---
layout: article
title: "The CR Is Shared Mutable State: Why Kubernetes Operators Silently Destroy Each Other's Work"
description: "Part 6 of \"Why Kubernetes Infrastructure Rots.\" One controller adds fields to a custom resource; another controller watching the same resource overwrites the whole spec every reconcile. No error, no log, no alert — silent data loss as a design consequence of the CR as shared mutable state."
permalink: /articles/k8s-cr-shared-mutable-state/
date: 2026-07-10
author: "Gary Yang"
tags: ["kubernetes", "operators", "custom-resources", "distributed-systems", "server-side-apply", "platform-engineering"]
---

# The CR Is Shared Mutable State: Why Kubernetes Operators Silently Destroy Each Other's Work

*A controller added two new fields to a custom resource. Another controller — watching the same resource for a different purpose — overwrote the entire spec on every reconcile. The new fields vanished. No error. No log. No alert. The system looked healthy. It wasn't. Every step below is reproducible on a throwaway cluster; the [companion lab](/articles/k8s-verify-it-yourself/) has the commands.*

---

## The Operator Hype and the Missing Architects

Kubernetes operators are the hottest infrastructure pattern of the last five years. The pitch: encode your operational knowledge in code. Instead of runbooks and manual `kubectl` commands, write a controller that watches custom resources and converges the system toward desired state. Automate the human operator out of the loop.

The industry embraced it. Every infrastructure concern now gets an operator. Certificate management? Operator. DNS? Operator. Network policies? Operator. Deployment orchestration? Operator. Rate limiting? Operator. Every vendor ships one. Every platform team writes three.

The architectural question — **what happens when five operators watch the same resource?** — was asked. The Kubernetes community answered it with server-side apply, field managers, and the status subresource convention. But the answer was a mitigation, not a fix. It addressed the symptom (concurrent writes) without questioning the premise (should these be concurrent writes at all?).

The operator pattern works beautifully in isolation. One CRD, one controller, one reconciliation loop. The problem is that real systems aren't isolated. A deployment touches networking, security, observability, and routing simultaneously. The moment multiple operators converge on the same resource — or even the same namespace — the pattern breaks in ways that the operator authors never anticipated, because they were never taught to anticipate them.

This isn't a tooling gap. It's an **architecture gap**. The distinction between deployment-time and runtime — what to deploy vs. how the running system behaves — is fundamental to any distributed system. Architects have understood this for decades. Deployment is a finite, ordered, transactional operation: apply these changes, verify, commit or rollback. Runtime is an infinite, concurrent, eventually-consistent loop: watch, compare, converge.

The Kubernetes operator pattern **collapses these two into one mechanism.** The reconciliation loop — designed for runtime self-healing — gets applied to deployment-time data structures. The same CR holds "what version of this application should run" (deployment) and "is the network route healthy" (runtime). The same controller both provisions infrastructure (deployment) and monitors its health (runtime). The same `Reconcile()` function runs when a human creates a CR (deployment event) and when the system detects drift (runtime event).

The industry sees the concurrent-write problem — SSA and field managers prove that. What it doesn't see is that concurrent writes are the *symptom*, not the disease. The disease is using a runtime mechanism (reconciliation loop) for a deployment-time concern (provisioning infrastructure in response to a deployment event). SSA partitions the fields. It doesn't question why two controllers are writing to the same object in the first place. The operator pattern feels like progress because it replaces manual work with code. It is progress — for the runtime case. For the deployment case, it's a regression: replacing an ordered, transactional pipeline with an unordered, eventually-consistent loop.

The result is what one team discovered on a Tuesday morning.

---

## The Incident

A platform team runs multiple Kubernetes operators that watch the same custom resource: `ApplicationDeployment`. One operator (the Deployment Controller) owns the lifecycle — it creates and updates the CR when applications are deployed. Another operator (the network operator — this article will call it NetOp for brevity) watches the same CR to configure network routing for the application.

The Deployment Controller shipped two new spec fields: `timers` and `entityConfigurations`. These fields configure application-level scheduling and entity behavior. They're deployment-time concerns — set once when the application deploys, consumed by downstream systems.

NetOp doesn't use these fields. It watches `ApplicationDeployment` to extract the application's identity and configure network routing — Gloo RouteTables, Istio ingress, Calico policies. It reads a few fields, does its work, and moves on.

Until recently, that was fine. NetOp read the CR but never wrote to its spec. Then a shared operator library (this article will call it `platform-controller-runtime`) introduced a time-to-first-ready Prometheus metric. The feature tracks how long a CR takes to reach a ready state — useful observability. To record the metric, the library writes back to the CR. The write mechanism: a full-object `Update()` using the operator's own typed Go struct.

NetOp's typed struct didn't include `timers` or `entityConfigurations` — why would it? NetOp doesn't use those fields. But `Update()` replaces the entire object. On every reconcile, NetOp's write replaced the spec with its version of reality. The new fields disappeared.

The precise mechanism is worth naming, because it's the whole incident in one sentence: **`client-go`'s `Update()` issues an HTTP `PUT`, and a `PUT` replaces the entire resource.** The API server takes NetOp's serialized struct as the new object in full. Fields NetOp's struct doesn't model marshal as absent, and absent-in-a-PUT means deleted — not "left alone." (Contrast a `PATCH`, which carries only a diff.) There is no error because the write is perfectly valid: NetOp submitted a complete, schema-conformant object; it simply wasn't *the same* complete object. *(Reproduced live — a full-object PUT strips another writer's field with no error, while an SSA apply preserves it: [Verify It Yourself §"Update() Is an HTTP PUT"](/articles/k8s-verify-it-yourself/#part-6--update-is-an-http-put-it-silently-strips-fields-it-doesnt-know).)*

Nor does optimistic concurrency save you. `Update()` carries the `resourceVersion` NetOp read; the API server rejects a *stale* one with `409 Conflict`, and controller-runtime re-Gets and retries. But the 409 only guards against overwriting a version you didn't see — it does nothing when NetOp re-Gets DC's fresh write, *then* PUTs its field-stripped struct. Every write is based on the latest version, so no conflict ever fires; the writes serialize cleanly in time and each cleanly erases the other's fields. Optimistic concurrency prevents lost *updates to a field*; it does not prevent lost *fields*. *(Reproduced live: [Verify It Yourself §"resourceVersion"](/articles/k8s-verify-it-yourself/#part-6--resourceversion-the-optimistic-lock-the-write-loop-rides-on).)*

The majority of `ApplicationDeployment` resources in the cluster had `null` for both fields. Not because they were never set — because they were set and then silently erased, on every reconcile cycle.

No error was logged. No admission webhook caught it — a webhook sees the *incoming* object, not the diff against another writer's fields, so nothing about NetOp's write looks wrong to it. No test failed. The fields existed in the CRD schema. The Deployment Controller set them correctly. And then they vanished.

---

## The Operator Pattern Is a Deployment Model Pretending to Be a Runtime Model

The operator pitch says: "Define your desired state in a CR. The operator reconciles reality to match."

This sounds like runtime self-healing. A pod crashes, the ReplicaSet controller restarts it. A node dies, the scheduler reschedules. Continuous convergence. Elegant.

But most operators don't do runtime self-healing. They do **deployment orchestration disguised as reconciliation.**

When the Deployment Controller creates an `ApplicationDeployment`, that's not a runtime event. It's a deployment event — "deploy this application with these timers and this entity configuration." The desired state isn't "keep this running." It's "make this exist once, with these properties, as part of a coordinated deployment pipeline."

When NetOp reconciles the same CR to create RouteTables, that's also a deployment event — "provision the network infrastructure for this application." It happens once per deployment, not continuously.

But both are implemented as reconciliation loops. Both run on every change to the CR. Both re-read the spec, re-compute their output, and re-write. The deployment is over — the application is running, the routes are configured — but the loops keep running. The reconciler doesn't know the difference between "the CR was just created" and "the CR changed because another controller wrote to it." It reconciles either way.

This is the collapsed boundary. **A deployment event and a runtime event trigger the same code path.** The operator framework provides one hook — `Reconcile()` — for both. There's no `OnDeploy()` that runs once. There's no `OnRuntimeDrift()` that runs continuously. There's just `Reconcile()`, called for every reason, running the same logic, making the same writes, whether the trigger was a human deploying an application or another controller updating a status field.

An architect who understands the deployment/runtime distinction would immediately ask: "Why is the network provisioning controller running in a continuous loop on a resource whose spec shouldn't change between deployments? Why isn't the deployment a one-shot pipeline that calls NetOp's provisioning logic once, in order, after DC's fields are set?"

The answer: because the operator pattern doesn't offer that option. The only primitive is the reconciliation loop. Every problem becomes a reconciliation loop. Including problems that shouldn't be.

---

## Two Versions of Reality on One Object

This is the deployment versioning problem wearing a different costume.

In a previous article in this series, I described what happens when a staging pipeline — one version per stage, one tag in the gitops repo — forces two code paths into one binary. The team adds a feature flag. The flag becomes a version selector: "Am I product A or product B right now?" Two mutually exclusive business logic paths share one function, switched by an environment variable. The flag is what happens when the infrastructure can't express that two versions coexist.

The CR is the same problem at the data level.

The Deployment Controller shipped a new version of `ApplicationDeployment` — one that includes `timers` and `entityConfigurations`. NetOp is running an old version — its typed struct doesn't know those fields exist. Both operators are deployed through the same staging pipeline. Both passed CI. Both are "current version." But they disagree on what `ApplicationDeployment` looks like.

**Multiple versions are always running simultaneously.** Not just across services during a rolling update window. Permanently. Two controllers, deployed on different schedules, with different typed views of the same resource, writing to the same object. The CR is the shared mutable state where their version disagreement materializes.

The pipeline promoted DC's new schema. It did not — could not — verify that every other controller watching `ApplicationDeployment` was compatible with the new fields. There is no mechanism for this. The CRD schema accepts both versions (the new fields are optional). Kubernetes itself doesn't know or care that NetOp's struct is missing fields. The API server happily accepts NetOp's write, which happens to omit the fields DC just set.

This is the "one version per stage" assumption applied to data, not code. The pipeline assumes one version of the CR schema. Reality has N versions — one per controller that touches the resource. The CR is the flag: a single object holding the superposition of multiple controllers' incompatible views.

And unlike traffic — which can be partitioned by domain name, tenant ID, or region — **the CR is non-partitionable shared state.** Two controllers writing to the same `ApplicationDeployment` are like two services writing to the same database row with different schema expectations. You can't route one field to one controller and another field to another. The entire spec is one atomic write target. Every controller that touches it is a concurrent writer with no isolation.

This is why the fields only disappeared on **creation**. When DC creates the CR, it sets `timers` and `entityConfigurations`. NetOp immediately reconciles, writes back its version of the spec, and erases the fields. If DC later **updates** the fields (e.g., on a redeployment), NetOp has already reconciled — the timing race is different, and the fields may survive. The system is correct in some orderings and broken in others. No test captures this because tests run one controller at a time.

---

## Deployment Time vs. Runtime: The Collapsed Boundary

The execution model is wrong — deployment orchestration shouldn't be a reconciliation loop. But the data model is wrong too. A Kubernetes CR serves two masters simultaneously.

**Deployment-time concerns** on `ApplicationDeployment`:
- `timers` — what scheduled jobs does this application need?
- `entityConfigurations` — what entity-level configuration applies?
- Container image, resource limits, replica count

These are set once per deployment. They describe **what to deploy**. They change when a new version ships.

**Runtime concerns** on the same `ApplicationDeployment`:
- Network routing configuration (NetOp reads this to create RouteTables)
- Status conditions (is the application healthy?)
- Time-to-first-ready tracking (the feature that introduced the status write)

These are read and written continuously. They describe **how the running system behaves**. They change on every reconcile cycle.

In a well-modeled system, these would be separate resources — or at minimum, separate subresources with independent ownership. Deployment-time data would be immutable between deployments. Runtime data would be the reconciliation loop's domain.

Kubernetes CRDs collapse both into one `.spec` and one `.status`, with no ownership boundary between them. Any controller that can read the CR can write the CR. Any controller that writes the CR writes the **entire spec** (unless it uses server-side apply with field managers, which almost none do). The reconciliation loop — designed for runtime self-healing — operates on the same object that holds deployment-time configuration.

The result: a runtime reconciliation loop silently destroys deployment-time data. Not because of a bug. Because the system's data model doesn't distinguish between the two.

---

## The Reconciliation Loop Was Never Meant for This

The Kubernetes reconciliation pattern is elegant for its original purpose:

```
Desired state (spec) --> Controller --> Actual state (status)
     ^                                       |
     |                                       |
     +----------- Human / CI writes ---------+
```

One writer sets the spec. One controller reads it, acts on it, writes status. The loop converges. Beautiful.

The moment you add a second controller watching the same CR, the model breaks:

```
Desired state (spec) --> Controller A --> Actual state A
     ^        |
     |        +-------> Controller B --> Actual state B
     |                       |
     |                       +--- writes back to spec (its version)
     |                                   |
     +--- silently overwrites A's fields +
```

Controller B reads the spec, does its work, and writes back. Its typed struct doesn't include Controller A's fields. The API server accepts the write. Controller A's fields are gone. Controller A re-reconciles, sets them again. Controller B reconciles, erases them again. The two controllers are in a silent write loop — each undoing the other's work on every cycle.

This is not an edge case. This is the default behavior of any system where:
1. Multiple controllers watch the same CR
2. At least one controller writes back to the spec (not just status)
3. Controllers use typed structs that don't include each other's fields

All three conditions are common. In this incident, condition (2) was introduced by a shared library feature — a time-to-first-ready metric that seemed benign. Nobody reviewed that change through the lens of "which other controllers write to this CR?" — not because the ecosystem is unaware of concurrent writes (SSA exists for exactly this reason), but because the abstraction hid the write mechanism entirely. The operator author called a convenience function. The convenience function did a full-object `Update()`. The ecosystem's mitigation (SSA) was never in the code path.

---

## Why the Mitigations Don't Reach the Root Cause

The Kubernetes community recognized the concurrent-write problem and built mitigations: server-side apply, field managers, the status subresource convention. These are real engineering achievements. But they all address the same question — "how do we let multiple controllers safely write to the same object?" — without asking the prior question: **why are multiple controllers writing to the same object?**

**The operator community optimizes for safe concurrency, not lifecycle separation.** Conference talks show "we automated X with an operator" and "we solved field conflicts with SSA." Nobody asks "should this be a reconciliation loop or a deployment pipeline?" The question doesn't exist in the vocabulary because the framework doesn't offer the alternative.

**Operator frameworks provide one primitive.** Controller-runtime gives you `Reconcile()`. That's it. Whether you're provisioning a database (deployment), rotating a certificate (runtime), or updating a network route (deployment triggered by a deployment event), you write a `Reconcile()` function. The framework doesn't distinguish between these use cases. So the authors don't either.

**The CRD is the only modeling tool.** Want to express "this application needs timers, entity configuration, network routing, and health monitoring"? You get one CRD with one spec. The CRD schema defines fields. It doesn't define lifecycles, ownership, or ordering. It's a database table with no foreign keys, no constraints, and no transactions.

**Testing reinforces the blind spot.** Operator tests use envtest or fake clients. They run one controller at a time. They test "does my controller produce the right output for this input?" They never test "what happens when two controllers write to the same CR simultaneously?" The failure mode doesn't exist in the test environment because the test environment doesn't model concurrent controllers.

An architect would look at this system and say: "You have a deployment pipeline that needs ordering (DC writes spec, then NetOp reads it) implemented as concurrent reconciliation loops with no ordering guarantee. You have deployment-time data and runtime data on the same object with no ownership model. You have N controllers with N different typed views of one schema, deployed on different schedules, with no compatibility verification. This is a concurrency bug by construction."

The mitigations (SSA, field managers, status subresource) answer "how do we make the concurrent writes safe?" The architectural question is "why are these concurrent writes instead of an ordered pipeline?" The first question has answers. The second question is rarely asked — because the operator framework provides one primitive (`Reconcile()`), and when your only tool is a reconciliation loop, every problem looks like a convergence problem.

---

## Why Server-Side Apply Doesn't Save You

The standard response: "Use server-side apply with field managers. Each controller declares which fields it owns. Conflicts are detected."

In theory, yes. In practice:

**Almost no operator framework defaults to SSA.** Controller-runtime, the dominant framework, defaults to client-side `Update()` — a full-object replacement. Switching to SSA requires changing every reconciler's write path, declaring field managers, and handling conflict resolution. It's a significant refactor for any existing operator.

**Shared library abstractions hide the update mechanism.** The `platform-controller-runtime` wrapper provides a convenience method for status tracking. The operator author calls one function. They don't think about whether it's a full update or a patch. They don't think about field ownership. The abstraction that makes operators easy to write also makes this class of bug invisible.

**CRD schemas don't declare ownership boundaries.** A CRD defines what fields exist. It doesn't define who writes them. There's no schema-level annotation that says "this field is owned by Deployment Controller, read-only for everyone else." The ownership model — if it exists at all — is in documentation, not in enforcement.

**The bug is silent.** SSA conflict detection only works if both writers use SSA. Here's the mechanism, and it's inspectable: SSA records per-field ownership in `metadata.managedFields` — each field manager gets an entry listing exactly the fields it owns, and a conflicting *apply* is rejected with a 409 unless it passes `force: true`. But a client-side `Update()` (a PUT) doesn't participate: it replaces the whole object *and* rewrites `managedFields` wholesale, blowing away other managers' ownership records along with their fields. So if Controller A uses SSA and Controller B uses `Update()`, B wins unconditionally — A's field ownership is bypassed entirely, because a PUT was never subject to it. You can watch this happen: `kubectl get <cr> --show-managed-fields` before and after B's write shows A's manager entry vanish. You need 100% SSA adoption across every controller that touches the CR; one `Update()` holdout defeats the whole scheme. *(Reproduced live — managedFields partitioning two managers' fields, and the per-field survival that follows: [Verify It Yourself §"Server-Side Apply"](/articles/k8s-verify-it-yourself/#parts-4--6--server-side-apply-last-writer-wins-is-per-field-manager).)*

**SSA is a patch on the wrong model.** Even with perfect SSA adoption, you've added field-level ownership to a system that still collapses deployment and runtime into one object. You've partitioned the fields, but the reconciliation loops still run concurrently, still trigger on every change, still mix deployment events with runtime events. The field ownership prevents data loss. It doesn't fix the architectural confusion. It's a seatbelt on a car driving on railroad tracks.

---

## The Distributed Monolith Within a Single Resource

In a previous article in this series, I described how five repos, five teams, and five reconciliation loops produce a distributed monolith — a system with no transactional boundary, no dependency graph, no atomic deploy. The root cause: each stack pretends to be independent when the resources are actually coupled.

The CR is the same pattern at a smaller scale. Multiple controllers pretend to independently reconcile one object. The coupling is in the shared spec — but unlike repos, which at least have separate Kustomizations you can inspect, the CR gives you one `.spec` with no record of who wrote what. `kubectl get applicationdeployment -o yaml` shows the final state. It doesn't show that `timers` was set by DC and erased by NetOp moments later.

| Distributed monolith (across repos) | Distributed monolith (within a CR) |
|---|---|
| Five repos deploy independently | Five controllers reconcile independently |
| No DAG between stacks | No ordering between reconcilers |
| CI passes but cluster is broken | Tests pass but fields are erased |
| Cross-repo dependencies are implicit | Cross-controller field ownership is implicit |
| Rollback means "revert 3 repos in the right order" | Fix means "figure out which controller last wrote the spec" |
| Orphaned resources accumulate | Orphaned field values disappear |

The solution to the five-repo distributed monolith was domain-cut boundaries — group by capability, not by resource type. The solution to the single-CR distributed monolith is the same principle applied to data: **separate the CR by lifecycle, not by the convenience of having one object.** Deployment-time fields belong in a resource that only the deployment pipeline writes. Runtime state belongs in resources that reconciliation loops own. Each thing is what it is — nothing more.

---

## The Solution: Decouple Deployment Time from Runtime

The fix isn't better operators, better patching, or better field managers. It's a clean architectural separation that the industry has understood for decades but the Kubernetes ecosystem has never enforced:

**Deployment time focuses on versioning boundaries and interfaces between services.** Runtime focuses on business logic inside a version, completely unaware of versioning.

These are two different concerns with two different shapes:

| | Deployment Time | Runtime |
|---|---|---|
| **Focus** | Interfaces between services | Business logic within a service |
| **Question** | "Are the versions of DC and NetOp schema-compatible?" | "Given this ApplicationDeployment, what RouteTables do I create?" |
| **Aware of** | Version N vs N+1, contract compatibility, deployment ordering | Only the current version — there is no "other version" |
| **Execution model** | Ordered pipeline with a DAG | Continuous reconciliation loop |
| **Failure mode** | Explicit: incompatible versions fail validation before deploy | Convergent: drift is detected and corrected |
| **Data model** | Immutable artifacts with versioned interfaces | Mutable state with ownership boundaries |

In this model, the incident never happens. Here's why.

### Deployment time: the versioning boundary

DC adds `timers` and `entityConfigurations` to the `ApplicationDeployment` CRD. This is an **interface change** — the CRD schema is the contract between DC (the writer) and every controller that reads or writes the CR.

A deployment-time system treats this the way any distributed system treats an interface change:

1. **Schema compatibility check.** Before DC's new version deploys, the pipeline validates that every consumer of the `ApplicationDeployment` interface can handle the new fields. NetOp's typed struct doesn't include `timers`? That's a compile-time failure — not a runtime surprise. The same way a gRPC service won't deploy if its proto definition breaks a consumer.

2. **Deployment ordering.** If NetOp needs to update its struct first, the pipeline deploys NetOp before DC. If NetOp can safely ignore the new fields (because it never writes the spec), the pipeline deploys DC first. The ordering is explicit — a DAG, not a race between reconciliation loops.

3. **Version boundary as an artifact.** The CRD schema version, DC's expected schema, and NetOp's expected schema are all versioned artifacts with declared compatibility. "DC v2.3 writes `ApplicationDeployment` v1beta2 with `timers` field. NetOp v1.8 reads `ApplicationDeployment` v1beta1 without `timers`. Compatible: yes, if NetOp is read-only. Incompatible: if NetOp writes the full spec."

This is API versioning. It's contract testing. It's what every microservice team does with REST or gRPC APIs. The Kubernetes ecosystem skips it entirely because the CRD is treated as "just a schema" rather than what it actually is: **a shared interface between independently deployed services.**

### Runtime: business logic, unaware of versioning

Once deployed, each controller runs its business logic inside its version. NetOp doesn't think about "am I compatible with DC's schema?" It reads the fields it needs, creates RouteTables, writes status. It has no reason to write the spec. It has no reason to know that `timers` exists. It operates within the boundary of what it understands — its own bounded context.

The runtime controller is **version-unaware by design:**

```go
// NetOp's Reconcile() — runtime business logic
func (r *Reconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    var ad appsv1.ApplicationDeployment
    if err := r.Get(ctx, req.NamespacedName, &ad); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    // Read only the fields NetOp cares about
    appID := ad.Spec.ApplicationID
    envID := ad.Spec.EnvironmentID

    // Create RouteTables, AuthConfigs — NetOp's own resources
    if err := r.ensureRouteTable(ctx, appID, envID); err != nil {
        return ctrl.Result{}, err
    }

    // Write status on NetOp's own condition — never touch .spec
    meta.SetStatusCondition(&ad.Status.Conditions, metav1.Condition{
        Type:   "NetworkReady",
        Status: metav1.ConditionTrue,
    })
    return ctrl.Result{}, r.Status().Update(ctx, &ad)
}
```

No full-object `Update()`. No awareness of `timers` or `entityConfigurations`. No version selection logic. The controller reads what it needs, writes what it owns, and ignores everything else. It's business logic inside a version — pure runtime.

The key insight: **a runtime controller that writes only its own status and its own resources cannot destroy another controller's data.** The field-stripping bug is impossible by construction — not because of SSA or merge patches, but because the architecture doesn't give NetOp a write path to DC's fields.

### Why the current system gets it backwards

The current system has it exactly inverted:

- **Deployment time does no versioning.** DC adds fields. The pipeline doesn't check if NetOp's struct is compatible. No schema validation. No deployment ordering based on interface dependencies. The CRD is updated, both controllers are promoted through the same ring pipeline independently, and the system hopes they converge.

- **Runtime is version-aware by accident.** NetOp's `Reconcile()` function performs a full-object `Update()` — which implicitly asserts "my typed struct IS the complete schema." This is a version claim embedded in runtime code. Every reconcile cycle, NetOp says "the spec should look like this" — its version of the spec. It's enforcing a schema version it doesn't know it's enforcing.

The reconciliation loop has become a **silent version enforcer**. Not because anyone designed it that way, but because the operator pattern provides no separation between "update the fields I own" and "assert my version of the entire object."

### The tactical fixes still matter

Within the current system, before the architectural separation is achievable:

**1. Controllers that watch a CR should not write its spec.** NetOp should write to its own resources and to `.status` subresource only. The status-tracking feature that introduced the spec write violated an ownership boundary that nobody had declared — because the operator pattern doesn't teach you to declare ownership boundaries.

**2. Default to strategic merge patch, not full-object update.** If a controller must write to a CR, it should patch only the fields it owns:

```go
// BAD: replaces entire spec — implicit version assertion
err = r.Client.Update(ctx, cr)

// GOOD: patches only the diff — version-unaware
err = r.Client.Patch(ctx, cr, client.MergeFrom(original))
```

**3. Validate cross-controller schema compatibility in CI.** When DC adds new fields, the pipeline should verify that every controller watching that CRD can handle the new fields without data loss. A registry of which controllers watch which CRDs. Schema compatibility checks. Deployment ordering.

**4. Reserve the operator pattern for actual runtime concerns.** Certificate rotation? Operator. Self-healing restarts? Operator. Autoscaling? Operator. These are genuinely continuous, event-driven, runtime problems. Application deployment orchestration? That's a pipeline with ordering — a DAG, not a set of concurrent loops.

The test: **does this need to run continuously, or does it need to run once per deployment in a specific order?** If the answer is "once, in order," it's a deployment concern. Using a reconciliation loop for a deployment concern doesn't make it more reliable — it makes it concurrent, unordered, and vulnerable to the exact class of bug described in this article.

---

## What the Separation Looks Like in Practice

The theory — decouple deployment time from runtime — is easy to state. What does it look like structurally?

Take the general shape of the incident: edge/cloud infrastructure (distributions, certificates, DNS records) provisioned *and* monitored from inside one reconciliation loop watching one CRD. That operator handles both the provisioning (deployment-time, once, ordered) and the health monitoring (runtime, continuous). It's the poster child for the collapsed boundary. The redesign splits it in two, along the deployment/runtime line:

```
DEPLOYMENT TIME (an ordered pipeline — e.g. CDK/Terraform + CI):
══════════════════════════════════════════════════════════════
• Provisions the versioned cloud infrastructure (the shared base + per-tenant stacks)
• Emits ONE versioned interface artifact for runtime to consume (e.g. an origin
  DNS name in a parameter store) — and nothing else crosses the boundary
• Ordered: base deploys before dependents; a DAG, not a race

RUNTIME (K8s — stateless w.r.t. the cloud infra above):
══════════════════════════════════════════════════════════════
• Receives traffic already tagged (headers/token set at the edge) and routes on it
• Controllers read their inputs, write ONLY their own resources + their own .status
• K8s does not provision, monitor, or even know about the cloud infrastructure —
  it consumes the one interface artifact and nothing more
```

The provisioning operator and its CRD are deleted; provisioning becomes a pipeline with explicit ordering, not a reconciliation loop. The runtime becomes pure config-matching — route on headers set upstream.

### The versioning boundary

The **only coupling** between the two halves is a single versioned interface artifact — in the concrete case, a DNS name in a parameter store. The deployment pipeline writes it; the runtime reads it. Neither side knows the other's internals. When the deployment side upgrades (new edge function, new cache policy), it's a deployment-time operation with its own versioning: an interface-compatibility check at build time ("does the new edge function still emit headers the runtime can route on?"), explicit deploy ordering (base before dependents), and blue/green at the edge (two versions live, shift a percentage to roll back — no code change, no reconcile loop).

### The runtime boundary

Inside K8s, each controller does its business logic inside its version, and writes only what it owns:

- The **network controller** reads the app identity from its input CR and writes routing resources (e.g. VirtualServices) + its own `.status` condition. It never writes the input CR's spec, and doesn't know the deployment-time fields exist.
- The **deployment controller** writes the application spec — image, replicas, and the fields that were being erased (`timers`, `entityConfigurations`) — once per deployment. No other controller overwrites them, because no other controller writes that spec.

Each controller does exactly what it is. The field-stripping bug is structurally impossible — not because of defensive coding or SSA, but because the architecture never gives the network controller a write path to the deployment controller's fields.

### The lifecycle boundary, as a model

The separation is legible as three aggregates on two distinct lifecycles:

| Aggregate | Lifecycle | Owner | Changes when |
|---|---|---|---|
| **Shared infrastructure** (the base stack) | Deployment-time | The pipeline | Infra version changes |
| **Per-tenant infrastructure** | Deployment-time | The pipeline | A tenant is added/removed |
| **Per-environment routing** (K8s) | Runtime | K8s controllers | An app deploys, scales, or reroutes |

The deployment-time aggregates own *versioning* (which infra version, which schema, what order). The runtime aggregate owns *routing* (this request → this backend). They don't share a CRD, don't share a reconciliation loop, and touch only through the one versioned interface. That is the whole fix, stated as a model.

---

## The Pattern Beneath: Let Each Thing Be What It Is

"Keep it simple" is easy to say and impossible to act on without a principle that tells you where the complexity doesn't belong. The principle is: **let each thing be what it is.**

A reconciliation loop is a runtime mechanism. Let it do runtime work — watch for drift, converge state, heal failures. Don't make it orchestrate deployments. Don't make it enforce schema versions it doesn't know about. Don't make it write fields it doesn't own.

A deployment pipeline is an ordered, transactional mechanism. Let it validate interfaces, enforce ordering, check compatibility. Don't make it eventual. Don't make it concurrent. Don't make it hope that independent loops converge.

A CRD is a schema — an interface contract between services. Let it be versioned, validated, and owned. Don't treat it as a shared blackboard where any controller can write any field.

Every article in this series traces back to violations of this principle — making one thing pretend to be another:

- Repos that are one bounded context pretending to be six (Part 1: *The Operator Mindset*)
- Shared repos that centralize data pretending to model domains (Part 2: *Why Neither Shared Repos Nor Better Tools Fix It*)
- Text templates pretending to be typed abstractions (Part 3: *The Abstraction Instinct*)
- Runtime reconciliation pretending to be deployment orchestration (Part 4: *Why Your GitOps Is a Distributed Monolith*)
- Feature flags pretending to be multi-version coexistence (Part 5: *Routing Is Atomic. Deployment Is Not.*)

And now, Part 6: **a reconciliation loop pretending to be a deployment pipeline, operating on a shared mutable object pretending to be an interface contract, producing silent data loss that pretends to be a healthy system.**

The accidental complexity in every case comes from the same source: making a thing do what it isn't. The reconciliation loop isn't bad. The CRD isn't bad. The operator pattern isn't bad. They become bad when you use them for concerns they weren't designed for — and the ecosystem's mitigations (SSA, field managers) make it *easier* to use them for the wrong concerns by reducing the visible pain. The concurrent-write bug gets fixed. The collapsed lifecycle boundary stays.

Deployment time is about the **boundaries between versions** — schema compatibility, interface contracts, deployment ordering. Runtime is about the **business logic inside a version** — read your inputs, produce your outputs, write your status, unaware that other versions exist. These are different things. Let them be different things.

The mitigations are the symptom. The collapsed boundary is the cause. SSA, field managers, and merge patches all exist because multiple controllers write to the same object — and multiple controllers write to the same object because the framework offers one primitive for both deployment orchestration and runtime self-healing. The question that cuts through the mitigations: "Is this a versioning boundary problem or a business logic problem?" The answer determines whether you need a deployment pipeline or a reconciliation loop — and using the wrong one produces exactly the class of silent data loss we just spent a morning debugging.

---

*Based on a real incident: a deployment controller added two fields to a shared CRD; another controller watching the same CR silently erased both on every reconcile via a full-object `Update()`. Most instances of the resource ended up `null` for both fields. Nobody noticed until an unrelated troubleshooting session. Every mechanism above is reproducible on a throwaway cluster — see the [companion lab](/articles/k8s-verify-it-yourself/).*

---

### Series: Why Kubernetes Infrastructure Rots

- **Part 1: [The Operator Mindset](/articles/k8s-operator-mindset-vs-domain-modeling/)** — Why one domain becomes six repositories. The repo-per-problem anti-pattern as a consequence of thinking in procedures instead of models.

- **Part 2: [The Cargo Cult](/articles/k8s-cargo-cult-centralization/)** — Why shared repos and better tools don't fix it. The failed abstraction phase.

- **Part 3: [The Abstraction Instinct](/articles/k8s-abstraction-instinct/)** — What no tool can provide. CDK in the hands of an operator is still operator thinking.

- **Part 4: [The Distributed Monolith](/articles/k8s-gitops-distributed-monolith/)** — Why your GitOps is a monolith wearing a microservices costume. Five repos, five teams, zero transactional boundary, and six incidents in four weeks.

- **Part 5: [The Staging Mindset](/articles/k8s-staging-mindset-kills-migration/)** — Routing is atomic. Deployment is not. Why feature flags are what happens when the infrastructure can't express version coexistence.

- **Part 6: [The Shared Mutable State](/articles/k8s-cr-shared-mutable-state/)** — The CR is a database table with no foreign keys, shared between controllers with no ownership model. Silent data loss as a design consequence. *(this article)*

- **Aside: [Operator Stockholm Syndrome](/articles/k8s-operator-stockholm-syndrome/)** — When the K8s control plane becomes the universe. Routing every cloud API through a cluster CR even when the cluster has no semantic role.

- **Aside: [The Cron and the Gate](/articles/k8s-cron-and-gate/)** — When the operator models itself instead of the domain. One `Reconcile()` hook, triggered identically by create/resync/requeue, becomes the only place policy can live.

- **Aside: [The Configuration Problem](/articles/k8s-tribal-knowledge/)** — One business rule sliced across Helm, ConfigMap, Flux substitution, and Calico's dataplane — zero cohesion, load-bearing tribal knowledge.

- **Aside: [The Auto-Approve](/articles/k8s-auto-approve-swallows-the-gate/)** — When the reconcile loop swallows `terraform plan`. Wrapping a tool with a human-in-the-loop gate in a loop that structurally can't hold one.

- **Aside: [You Can't Front-Run the Composition Gap](/articles/k8s-front-run-composition-gap/)** — Why correct first-principles reasoning must crash once before it can diagnose.

- **Lab: [Verify It Yourself](/articles/k8s-verify-it-yourself/)** — Copy-pasteable, real-output reproductions of every cluster mechanism the series cites (foreign keys, CEL scope, ownerRefs, SSA, PUT-strips-fields, resourceVersion, CRD versioning, kstatus).

- **Synthesis: [The Thermostat That Ate Infrastructure](/articles/k8s-thermostat-not-a-deployment-engine/)** — How a container self-healing pattern became a deployment engine. The missing DAG from node boot to infrastructure blue/green.
