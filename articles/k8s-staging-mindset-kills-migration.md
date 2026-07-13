---
layout: article
title: "Routing Is Atomic. Deployment Is Not."
description: "Part 5 of \"Why Kubernetes Infrastructure Rots.\" When the deployment pipeline can't express that two versions coexist, teams smuggle version branching into application code via feature flags that never get removed — and the failure unit an enterprise capability needs is never a container."
permalink: /articles/k8s-staging-mindset-kills-migration/
date: 2026-07-10
author: "Gary Yang"
tags: ["kubernetes", "blue-green", "feature-flags", "migration", "distributed-systems", "platform-engineering"]
---

# Routing Is Atomic. Deployment Is Not.

*Part 5 of "Why Kubernetes Infrastructure Rots." The previous articles examined how the operator mindset fragments domains ([Part 1](/articles/k8s-operator-mindset-vs-domain-modeling/)), fails to abstract them ([Parts 2–3](/articles/k8s-cargo-cult-centralization/)), and produces distributed monoliths with no dependency graph ([Part 4](/articles/k8s-gitops-distributed-monolith/)). This article examines a downstream consequence: when the deployment pipeline can't express that two versions coexist, teams smuggle version branching into application code via feature flags — and the flags never get removed.*

---

Here's something that should be obvious but isn't: **in a distributed system, you cannot atomically deploy a new version across N services.**

The moment you have two services that deploy independently, there is a window — seconds, minutes, sometimes hours — where they are running different versions. This isn't a bug. It's physics. Network calls are async. Deployment rollouts are sequential. Pods restart at different times.

Multiple versions are always running simultaneously. The question is not whether you design for multi-version coexistence. The question is whether you acknowledge it or pretend it away.

Feature flags are the pretending. Blue/green is the acknowledgment.

And there's a limit to the pretending that most teams never hit until it's too late. A feature flag is a runtime `if/else` inside one binary — which quietly assumes two things: that you can *name* the difference worth branching on, and that the difference is a **value your code can switch at runtime**. Both assumptions fail exactly when the stakes are highest. Sometimes you can't name the predicate at all (the failure is an unknown unknown). Sometimes you can name it perfectly but the thing being switched is an immutable, coarse-grained artifact — a container image, owned by another team, dragging its whole dependency closure — that no `if` statement can toggle. Blue/green assumes neither: it branches on *which instance served this request*, a fact you always have regardless of what differs between the versions or who owns them. That gap is where the flag approach quietly runs out of road, and the last section of this article shows both ways it happens.

I recently saw this play out in a concrete, instructive way.

## The Case

A team at a multi-tenant SaaS platform was migrating custom domain routing between two CDN data planes:

```
LEGACY:  Customer domain -> Per-tenant CDN -> Edge function (Python)
           -> Database query per request (5-50ms) -> Backend

NEW:     Customer domain -> Shared multi-tenant CDN -> Edge function (JS)
           -> Embedded routing parameter (~1ms, zero queries) -> Backend
```

Both paths deliver traffic to the same backend with the same headers. DNS determines which CDN receives traffic. The two data planes are completely independent at runtime. Traffic is naturally partitioned by domain name — every request's `Host` header is the partition key, visible at DNS before any backend is involved.

The new system was already deployed. Multi-tenant CDN distributions were running. Edge functions were deployed. Everything was ready to receive traffic.

The team used a feature flag.

## What the Flag Did

Rather than running both paths and routing between them, the team added `IsManagedByNewSystem()` to their existing services:

```go
func CreateCustomDomain(ctx context.Context, cd *CustomDomain) (*string, error) {
    if IsManagedByNewSystem() {
        // NEW PATH: lightweight CR, skip legacy CDN provisioning
        cd.Spec.IsMultiTenant = true
        cd.Annotations["hostname"] = cd.Spec.DomainName
    } else {
        // LEGACY PATH: full CDN provisioning
        cd.Spec.AccountID = config.AccountID
        cd.Spec.CachePolicyID = config.CachePolicyID
        cd.Spec.LambdaName = config.LambdaName
        // ... 4 more fields
    }
}
```

This `if/else` repeated across five locations in two independently deployed services. Each branch was a version fork — two mutually exclusive business logic paths in one function, switched by an environment variable.

Because the services deploy independently through a staged promotion pipeline (a sequence of rings — deployment tiers from internal/dev up to production — each holding one version at a time), the env var wasn't reliable: pods restart at different times, so two services reading the "same" flag disagree during the window. Moving the flag into a shared ConfigMap doesn't close the window either — a ConfigMap projected as a volume is refreshed by the kubelet on its sync loop (tens of seconds, not instant), and env-var-sourced ConfigMap values don't update in a running pod at all without a restart. So the planned fix was a timestamp in a shared ConfigMap: "if the domain was created after this timestamp, use the new path" — trading a propagation race for a wall-clock comparison that both services can evaluate independently.

The flag introduced:
- A CRD field (`isMultiTenant`) that splits the domain entity into two subtypes by migration state, not business rules
- Split-brain risk during any ConfigMap propagation window
- No rollback — `isMultiTenant:true` is permanent, no mechanism to revert to legacy
- No path for existing domains — only new domains after the timestamp
- Orphaned resources — new-path CRs have no delete owner
- A CronJob missing the new field's filter (safe by accident, not design)

## The Flag Is Two Products in One Binary

The `if/else` is not a business rule. It's a version selector. The code asks: "Am I product A or product B right now?" That's the job of a deployment system (which binary to run), not runtime code (what to do with a request).

**The code is untestable as a unit.** Test files have two suites: `TestCreate_Success` (legacy) and `TestCreate_ManagedByNewSystem` (new). The setup is `t.Setenv("FLAG", "true")` — configuring deployment state to test business logic.

**The flag crosses bounded contexts.** It appears in two services with different deployment pipelines. Both must agree on semantics and timing. A deployment concern has become a distributed coordination problem.

**The domain model is polluted.** `isMultiTenant` on the CRD is not a domain concept. A custom domain is not "multi-tenant" or "single-tenant." It's a customer's domain that routes to their application. The field exists to tell the controller "which version created me" — infrastructure leaking into the domain model.

The same team's new CDN operator has its own variant: an `environment` field (enum: `dev`, `sdbx`, `prod`) on the `MultiTenantDistribution` CRD. The value is fully deterministic — `dev` for the earliest, pre-production rings, `prod` for the later, customer-facing rings — and exists only to set AWS tags for WAF association and cost tracking. It's deployment topology masquerading as domain state. The team agreed to remove it and derive it from the ring in Go code, which is exactly the right fix: compute deployment context from deployment inputs, don't store it in the domain model. But the field was there for months, used in production, and removing it now requires a CRD schema migration across all clusters.

## Why Migration Flags Never Get Removed

The most dangerous property isn't immediate complexity. It's that **new logic builds on top of flags until they become load-bearing structure**.

**Month 1**: Five `if/else` blocks across two services. "We'll remove it after migration."

**Months 3-6**: Every feature and bug fix must work in both modes. New CRD field needs population — but only in the new path. Bug fix for legacy requires verification against new path. Monitoring needs `WHERE isMultiTenant = false`. Flags grow from 5 to 12 to 20+, some nested with other conditionals.

**Months 6-12**: The flag is part of the system's identity. Dashboards split by flag state. Runbooks diverge. On-call must diagnose which path. New hires learn "we have two modes." The CRD schema has `isMultiTenant` as a permanent field. Removing it now requires: completing the original migration, CRD schema change (breaking), cross-service coordinated removal, monitoring/runbook updates. A bigger project than the original migration. Never prioritized. The flag stays.

**Year 2+**: Next migration adds another flag. Three binary flags = 8 code paths. Five flags = 32. Most combinations untested. The avalanche is the steady accumulation of incidents where "unexpected flag combination" is the root cause. Each individually fixable. The pattern only visible in aggregate.

Every migration flag. Every `isMultiTenant` field. Every ConfigMap timestamp. Every nested conditional that checks flag + stage + region. Every runbook that forks into "legacy path" and "new path." Every on-call investigation that starts with "which mode was this domain in?" Every new hire who needs two weeks to understand why the same function has two completely different behaviors. Every PR review that asks "does this work with the flag on AND off?" Every test suite that doubles because there are two products in one binary.

Teams feel this weight. They call it "technical debt" or "complexity" or "the system is hard to change." They try to fix it with better documentation, more tests, stricter code review, cleanup sprints. None of it works, because they're treating symptoms. The root cause isn't in the code — it's in the model that forced the code to be this way.

## The Same Pattern, Larger Scale: CDN Migration

The same platform has a second migration underway — replacing per-tenant CloudFront distributions with a shared multi-tenant CDN. The architectural parallel is exact:

```
LEGACY:  Customer domain -> Per-tenant CloudFront -> Lambda@Edge (Python)
           -> DynamoDB query per request (5-50ms) -> Backend

NEW:     Customer domain -> Multi-tenant CloudFront -> CloudFront Function (JS)
           -> Embedded routing parameter (~1ms, zero queries) -> Backend
```

Both CDN paths are running. Both serve the same backends with the same headers. DNS determines which path handles traffic. The traffic is perfectly partitionable by domain name — every request's `Host` header is the partition key.

The team used a flag. The legacy operator's CRD gained a `ForEdgeOperator: true` annotation to route new custom domains to the new system instead of creating per-tenant distributions. The same `if/else` as `IsManagedByNewSystem()`, at the Kubernetes CR level:

```go
if customDomain.Annotations["ForEdgeOperator"] == "true" {
    // NEW PATH: create lightweight Domain CR for edge-operator
} else {
    // LEGACY PATH: full per-tenant CDN provisioning
}
```

And the same consequences:

- **Domain model pollution.** `ForEdgeOperator` on a `CustomDomain` CRD is not a domain concept. A customer's domain doesn't know or care which CDN serves it. The annotation exists to tell the legacy controller "skip this one" — deployment state leaked into the API.

- **No rollback.** Once `ForEdgeOperator: true` is set and the new operator provisions the domain, there's no automated path to revert to the legacy per-tenant distribution. The legacy CDN resources were either never created or already cleaned up.

- **Documented downtime per domain.** The migration plan calls for ~35-45 seconds of customer-visible downtime per domain during cutover. Pre-provision the ACM certificate (~10 min async), then the legacy operator releases the domain, then the new operator takes over. Sequential handoff — turn off A, turn on B, hope the gap is small.

Both CDN data planes exist. Both are deployed. Both serve the same backends. DNS is the partition key. A per-domain DNS switch would give instant, per-request, individually rollbackable migration — the exact blue/green pattern the article describes. Instead, the team is doing a sequential handoff inside the controller layer, accepting 35-45 seconds of downtime per domain, because the staging pipeline has no concept of two systems serving the same domain simultaneously.

The `isMultiTenant` flag and `ForEdgeOperator` annotation are the same decision made twice. The first time was two services with one code path split. The second time is two operators with one CRD split. Both generated by the same root cause: a deployment model that can't express version coexistence.

---

## Why This Happened: The Staging Pipeline Assumption

The team's deployment model is a six-stage promotion pipeline. At each stage, there is exactly one version of each service. The gitops repo has one tag field per component. When a new version deploys, the old version is gone. There is no mechanism to keep both versions running and route traffic between them.

This is a staging pipeline. It answers: **"Is this code version safe to promote?"**

B/G answers a different question: **"Can I serve this entity from either path and switch instantly?"**

The staging pipeline has no concept of two things serving the same purpose simultaneously. So the team simulated versioning inside one version using the flag. Every downstream decision traced back to this assumption:

```
"One version per stage"
  -> Need a flag to switch behavior
    -> Flag must sync across two services -> ConfigMap timestamp
  -> Migration is one-way
    -> isMultiTenant is permanent -> no rollback -> orphaned resources
  -> Legacy and new can't coexist
    -> DNS record conflict -> no gradual migration
  -> Only new domains after timestamp
    -> Existing domains can't migrate (no ticket, no design)
```

The single-version model generated the flag. The flag generated the conditional complexity. The conditional complexity generated the testing burden, the operational overhead, the onboarding cost, the incident investigation time. Remove any one symptom and the model generates it again at the next migration. The only way to break the cycle is to change the model.

## The Alternative: Migration as a Routing Decision

The alternative starts with a different question: not "when do we switch behavior per stage," but **"how do we route each domain to the correct data plane?"**

Both data planes run simultaneously. Always. No flag.

**Service A** always creates both the legacy database route AND the new CR. One code path.

**Service B** always creates legacy CDN resources. No behavior change.

**The new system** reconciles new CRs into multi-tenant CDN resources — which it already does.

**DNS** still points to legacy CDN. All traffic on legacy. Zero risk.

Migration is a per-domain routing decision:

1. Verify the new path is provisioned and healthy for this domain
2. Switch DNS (or edge canary: 1% -> 10% -> 100%)
3. If healthy: schedule legacy CDN cleanup
4. If not: revert DNS. Instant. No code change. No re-deploy.

Each service has one code path. Legacy cleanup is decommissioning a controller, not removing conditionals from a shared codebase. Nothing to fossilize because there was no branching.

This works because of one architectural property: **the traffic is partitionable**.

## The Foundation: Partitionable Traffic

B/G migration has a prerequisite: **traffic must be partitionable by some key that both data planes can independently resolve.**

Each request to `portal.acme.com` is independent of requests to `dashboard.corp.net`. You can migrate one domain while the other stays on legacy. The partition key (domain name) is in every request's `Host` header, visible at the routing layer (DNS, CDN), resolved before any backend is involved.

```
partition key:    domain name (in Host header)
routing table:    { portal.acme.com -> new path, dashboard.corp.net -> legacy }
decision point:   DNS record (or edge function canary config)
atomicity:        per request — decided before any backend call
```

Feature flags operate at a different level. The flag is a per-deployment decision: "this pod reads a ConfigMap and picks a code path." Pods restart at different times. ConfigMaps propagate asynchronously. Two services reading the "same" flag will disagree for seconds or minutes during any change.

**Per-request routing is atomic. Per-deployment flags are not.** If you need consistent migration, put the decision where atomicity is possible.

Not all traffic is partitionable:

**Partitionable (B/G works):**
- By domain name — DNS or edge canary
- By tenant ID — header-based routing, service mesh
- By region — DNS geo-routing
- By API version — path-based routing

**Non-partitionable (harder):**
- Shared mutable state (database schemas) — both versions read/write the same tables
- Global singletons (distributed locks) — only one version can hold the lock
- Ordered event streams (Kafka consumer groups) — partition reassignment causes reprocessing
- Cross-entity transactions — request touches multiple partition keys

For non-partitionable traffic, you may genuinely need coordinated migration tooling — expand-and-contract, dual-write, or flags. The mistake is using non-partitionable tooling on a partitionable problem.

## Making the Non-Partitionable Partitionable

Most teams treat their systems as non-partitionable by default. Many can be *made* partitionable with deliberate design.

A database schema migration seems global — both versions read the same tables. But what if each tenant's data is in a separate partition, and the migration proceeds per-tenant? Expand-and-contract becomes per-partition, with rollback scoped to one tenant.

An event stream seems indivisible — consumer groups rebalance across all partitions. But what if partitions map to entity IDs, and the new consumer processes any partition independently? Migration becomes: shift assignments one at a time, verify, rollback individual partitions.

A shared cache seems global — both versions see the same entries. But what if the cache key includes a version discriminator? Each version reads/writes its own key space with fallback. Both coexist without interference.

The pattern: **find the entity boundary that makes it per-partition.** This is a domain modeling problem. The partition key is often the same aggregate root that DDD would identify — the tenant, the domain, the user, the order. If your domain model has a natural aggregate boundary, your migration likely has a natural partition boundary.

The real architectural work is not "how do we synchronize a flag across services." It's "how do we decompose this migration into independent, per-entity routing decisions."

## The Deeper Problem: The Single-Version Stack

There's a pattern beneath everything in this article that extends beyond migration design.

The modern infrastructure stack — Kubernetes, GitOps, CI/CD pipelines, single-main-branch workflows — is built on an operational assumption: **one version of the truth, flowing through a single pipeline, arriving at a single destination.** One `main` branch. One Helm chart version per stage. One tag in the gitops repo. One pod spec per deployment. Everything converges. Everything serializes.

Trace it layer by layer:

| Layer | What it stores | How many versions | Why |
|-------|---------------|-------------------|-----|
| **Git (main)** | Source code | 1 active branch for CI | Trunk-based development, PR-and-merge |
| **CI** | Build artifacts | 1 output per trigger | One commit → one artifact |
| **OCI registry** | Helm chart / image | 1 tag per build | Immutable tag, no aliasing |
| **GitOps repo** | Deployment state | 1 tag field per component | `helm-repo.yaml` has one `ref.tag` |
| **Flux** | Reconciliation target | 1 desired state | `OCIRepository` → 1 version at a time |
| **Helm** | Release state | 1 release per name | `helm upgrade` replaces, doesn't fork |
| **K8s Deployment** | Pod spec | 1 ReplicaSet active | Rolling update converges to one version |
| **CRD** | API schema | N served, **1 stored** | Multiple `served` versions *can* coexist; one `storage` version + conversion cost is the real constraint |

Every layer above the CRD enforces single-version; the CRD layer is the one place the API *would* let two versions coexist (the pipeline above it still won't). There is no layer where you can say "run version A and version B simultaneously and route between them." The pipeline is a funnel — wide at the top (developers can branch), narrowing at every stage, until at the bottom there is exactly one version of everything.

The [Ladder of Abstraction](https://ondemandenv.dev/articles/abstraction-ladder/) maps these layers precisely: Git operates at Layer 1 (declarative state for source code), the GitOps repo operates at Layer 1 (declarative state for deployment), and Flux/Helm operate at the boundary between Layer 1 and the Layer -1 reconciliation engine. The critical absence is Layer 2 (Declarative Composition) — the layer that provides a graph of related resources with dependency edges and the ability to model multiple versions of the same graph simultaneously. Terraform has Layer 2 — its state file IS the graph, and you can have multiple workspaces representing different versions. The GitOps pipeline has no equivalent. The single-version constraint isn't a design choice any one tool made; it's the emergent property of an entire stack missing the layer that would make version coexistence expressible.

This is a deliberate design. It optimizes for auditability, reproducibility, and control. For managing infrastructure — clusters, nodes, network policies, certificate rotation — this model is excellent. You want one version of your network policies. You want one version of your mesh control plane. You want to know exactly what's running.

But the single-version model has a cost that infrastructure engineers don't see, because they've never worked without it: **it kills the software engineer's fundamental workflow.**

Software engineering is branching. You branch to experiment. You branch to compare. You branch to isolate risk. You run two versions of a function to see which performs better. You deploy a feature to 1% of users to validate the hypothesis. You keep the old code running alongside the new code until you're confident the new code is correct. The entire discipline assumes that **multiple versions coexist, and the system routes between them.**

Git was built for this. Branches are cheap, local, independent. You can have fifty experiments running simultaneously. Merge when ready. Delete when wrong. The data model is a DAG of commits — not a single timeline, but a graph of alternatives.

GitOps collapsed the DAG back into a line. The gitops repo has one branch that matters (`main`), one tag per component, and one reconciliation target. When Flux sees a new tag, the old version is gone. When Helm upgrades a release, the previous release is overwritten. When a Deployment rolls out, the old ReplicaSet scales to zero.

This isn't a bug in any individual tool. It's the emergent property of stacking eight single-version layers on top of each other. Each layer's designers made a reasonable choice. The aggregate effect is a pipeline that cannot express the most basic software engineering operation: **"run both and compare."**

**This is why teams reach for flags.** The infrastructure gives them no way to express "two versions coexist, traffic routes between them." The single-branch, single-deploy, single-version model makes the flag feel like the only option. The flag is a software engineer's attempt to reintroduce branching into a system that eliminated it — by simulating branches inside a single deployed version using `if/else`.

```
What the software engineer wants:
  branch A (legacy) ←─── 90% traffic
  branch B (new)    ←─── 10% traffic
  compare, then shift

What the infrastructure provides:
  one version, one deploy, one tag
  → so the engineer puts both branches in one binary
  → if (flag) { branch B } else { branch A }
  → the flag IS the branch, smuggled past the single-version pipeline
```

Every flag is a branch that the deployment model couldn't express. Every `isMultiTenant` field is a version tag embedded in a CRD because the gitops repo only has one tag field. Every ConfigMap timestamp is a merge commit date that the pipeline couldn't represent.

**But here's what the single-version stack can't change: multiple versions are always running.** Services deploy independently. Pods restart at different times. Ring promotion is sequential. There is always a window — seconds, minutes, sometimes hours — where different components are on different versions. The single-version model doesn't eliminate this reality. It just refuses to model it.

And what the infrastructure refuses to model, the application is forced to implement.

The versioning logic that should live in a routing table — "send this request to version A, that request to version B" — instead lives in `if/else` blocks inside business logic functions. The version coexistence that should be expressed as two Deployments behind a traffic split is instead expressed as two code paths inside one Deployment, switched by an environment variable that propagates asynchronously across pods.

The result is strictly worse on every dimension:

| Dimension | Version coexistence in infrastructure | Version coexistence in application code |
|-----------|--------------------------------------|----------------------------------------|
| **Isolation** | Two deployments, two processes, two failure domains | Two code paths in one process, shared memory, shared failure |
| **Rollback** | Shift traffic back. Instant. No redeploy. | Flip the flag. Wait for ConfigMap propagation. Hope both services agree. |
| **Testing** | Test each version independently | Test every flag combination (2 flags = 4 paths, 5 flags = 32 paths) |
| **Observability** | Metrics per deployment, per version | Metrics need `WHERE flag = true` on every query |
| **Blast radius** | One version fails, other keeps serving | Flag misconfiguration breaks both paths simultaneously |
| **Cleanup** | Decommission old deployment | Remove conditionals from every function in every service that reads the flag |
| **Cognitive load** | Two simple services | One complex service with two personalities |

The single-version infrastructure didn't reduce complexity. It moved complexity from the layer that has tools for managing it (load balancers, DNS, service mesh, traffic splitting) to the layer that has no tools for managing it (application code with `if/else` and environment variables). The infrastructure team's dashboard shows one clean version per ring. The application team's codebase has two products in one binary, growing more entangled with every sprint.

**The infrastructure's simplicity is the application's complexity.** Every version the pipeline refuses to model is a version the code must simulate. The pipeline looks clean. The code rots.

**But software doesn't need one truth. Customers need one coherent path — per request.**

A customer hitting `portal.acme.com` needs ONE path from DNS to CDN to backend. They don't need it to be the same path that `dashboard.corp.net` uses. They don't need all services on the same version. They need their request to be consistent with itself.

Per-request consistency is achievable. Per-deployment consistency is not. The routing layer can guarantee the former. The deployment pipeline cannot guarantee the latter. And yet the entire infrastructure stack is built around the latter.

## The Irony: Infrastructure Can't Consume Its Own Primitives

The ops mindset described above has a darker corollary. It doesn't just affect how teams design application migrations. It shapes how the infrastructure *itself* gets deployed — and the result violates the most basic distributed systems principle: **the component with the largest blast radius should have the fastest rollback and the most granular deployment.**

Consider what Istio and Gloo provide to applications:

- **Canary deployments** — shift 1% of traffic to the new version, observe, promote or roll back
- **Header-based routing** — route requests with `x-pioneer: true` to a new backend, everyone else stays on current
- **Traffic mirroring** — shadow production traffic to a new version without affecting users
- **Circuit breaking** — automatically stop sending traffic to failing instances

Now consider how Istio and Gloo *themselves* get deployed:

- All-or-nothing binary replacement across every proxy in the environment
- Every ingress pod restarts simultaneously
- No canary — every tenant on the environment gets the new version at once
- No header-based routing — there is no layer *above* the mesh to split traffic between old and new control planes
- Rollback means another full restart cycle, with potential xDS cache inconsistency, Envoy drain race conditions, and CRD version mismatches
- Compensating control: a bake time of a few hours in the early rollout ring, closer to a full business day in the general-availability ring, ring-by-ring promotion over days

The service mesh **sells** progressive delivery. The service mesh **itself** gets the deployment strategy it was designed to replace: deploy, pray, wait, and hope the bake timer catches what testing didn't.

Why? Because:

1. **The routing decision maker is the thing being upgraded.** You can't canary the component that *implements* canary. There is no layer above Istio that can split traffic between "old Istio" and "new Istio" at the request level.
2. **Envoy proxies share a single xDS push, not a versioned one.** istiod distributes config to all connected proxies over ADS (Aggregated Discovery Service); there is no per-subset xDS versioning. When istiod pushes a new config, every connected proxy converges to it. You can't tell it "push this config to 1% of sidecars" — the discovery stream has no notion of a canary cohort.
3. **The storage version, not "no coexistence," is the real schema constraint.** It's a common misconception that "two versions of a CRD can't coexist — one schema per GVK." They can: a CRD declares `spec.versions[]`, several can be `served: true` at once, and exactly one is `storage: true`, with a conversion webhook translating between them (reproduced live in [Verify It Yourself §"CRD Versions Do Coexist"](/articles/k8s-verify-it-yourself/#part-5--crd-versions-do-coexist-one-storage-version-conversion-on-read)). So the CRD layer is *not* where coexistence dies. What bites a mesh upgrade is narrower: every object is persisted at the single **storage version**, so a schema change forces a conversion path and a storage migration, and — combined with points 1 and 2 — the *runtime* (xDS) and the *routing authority* (the mesh itself) still flip atomically even though the API could serve both schemas. The atomicity is in the data plane and the upgrade's authority, not a CRD-versioning limitation.

This creates a perverse inversion:

| Layer | Traffic management capability | How it gets deployed |
|-------|------------------------------|---------------------|
| Application pods | Canary, header routing, traffic split, circuit break | Rolling update with readiness probes |
| Service mesh (Istio/Gloo) | *Provides all of the above* | All-or-nothing restart, multi-day bake |
| Cluster control plane (API server, etcd) | None | Managed by cloud provider, pray |

The layer with the **largest blast radius** (mesh controls all traffic for all tenants) has the **least deployment sophistication** (binary replace, no canary, no per-request routing). The layer with the **smallest blast radius** (one application, one namespace) has the **most deployment sophistication** (canary, traffic split, instant rollback).

This is backwards. In a well-designed distributed system, blast radius is proportional to rollback speed, and shared dependencies are the most conservatively deployed. Here, the shared dependency that every request transits is the one component you can't progressively deliver.

The bake-time-per-ring model compensates for this by turning time into a proxy for confidence: "if it survived most of a business day in the general-availability ring without alerts, it's probably fine." But time-based confidence is the weakest form of validation. It catches crash-on-startup. It doesn't catch subtle behavioral regressions, race conditions under specific traffic patterns, or performance degradation that only manifests at scale. The same team that would never accept "run the new app version for 8 hours and see if anyone complains" as a test strategy for their application accepts exactly that for the infrastructure beneath it.

The fix isn't better bake times or more rings. The fix is architectural: **move the traffic split point above the component you're upgrading.** CDN-level blue/green distributions. DNS-weighted routing. An edge layer that can send `x-pioneer: true` traffic through a new ingress stack while production traffic stays on the current one. If the infrastructure can't consume its own primitives, the answer isn't to accept the limitation — it's to put the routing decision somewhere that can.

---

## When the Bug Is an Unknown Unknown, Only Live Traffic Finds It

The Irony section shows a mesh that can't canary its own control-plane upgrade. Here's a sharper case, one layer further down the same stack: a bug that no canary a Kubernetes-native pipeline can build would have caught — not because the canary was implemented badly, but because the object K8s gives you to canary with only ever routes a *container*, and this bug's blast radius was never a container.

A platform's gateway stack shipped a routine hardening change to the image backing its rate limiter's Redis: swap the general-purpose base image for a nonroot, minimal one. It rolled through the promotion pipeline — dev, test, stage — reporting healthy at every ring, for weeks: pod `Running`, `ready: true`, `restartCount: 0`, HelmRelease `Ready: True`. Every signal a Kubernetes pipeline knows how to check was green.

It broke production anyway, silently. The new image runs nonroot by default; the chart forced a `runAsUser` that didn't match; the old image had papered over exactly this kind of ownership mismatch with a root-boot `chown` that a nonroot-by-design image correctly no longer performs. Redis's background save started failing with `Permission denied`. Redis's own default is to protect against silent data loss — `stop-writes-on-bgsave-error yes` — so once a save failed, it rejected every subsequent write. The rate limiter's counter increments are writes; they started erroring. The gateway's external rate-limit filter, like most, fails open on an errored decision by default. Rate limiting silently stopped enforcing, on live traffic, for as long as the pod kept running — which, since every K8s health signal stayed green, was indefinite.

Why didn't any pre-GA ring catch it — and would better testing have? No. Redis only runs a background save after enough writes accumulate past a threshold; it's a lazy, write-volume-gated code path by design. Pre-GA rings carry no real tenant traffic, so their Redis pods never crossed that threshold — not "ran the save path and passed," *never executed it, at all*, for the pod's entire pre-GA lifetime. The failing code wasn't undertested. It was untested by construction: no synthetic probe, smoke test, or acceptance check runs it, because the precondition for running it — real write volume — doesn't exist until real users generate it.

That's the shape of an **unknown unknown**: not a known risk nobody got around to testing, but a failure mode whose precondition is manufactured by production traffic itself, invisible to inspection of the artifact, the config, or even a live pod, for as long as that pod hasn't yet absorbed enough real writes. You cannot write an acceptance criterion for "the uid mismatch that only manifests after N dirty keys accumulate under real load" — nobody can enumerate that in advance. Gating the image swap ring-by-ring, exactly like a version bump, would not have fixed this. It would only postpone the identical, still-undetected exposure by however many days the pre-GA rings run, because those rings still carry no real write traffic. The fix isn't a better gate. It's not gating at all — it's testing against **live production traffic**, before full commitment, with an instant way back out.

That's blue/green, not staged rollout: put the new Redis behind a routing decision, send it a real slice of GA write traffic — one stamp, one tenant shard, some percentage — and watch what actually happens to real writes. If MISCONF appears, flip the routing weight back. No redeploy, no waiting for the next ring's bake window. The failure surfaces in seconds, because it's finally being fed the one input — real write volume — that makes it exist, and recovery is a routing change, not a rollback.

This is where Kubernetes runs out of primitives. A `Deployment` gives you exactly one thing to canary with: replace a fraction of the Pods behind a Service and watch their readiness probes. That's a container-health canary — it answers "did the new container come up, bind its port, pass liveness." It cannot answer "is the enterprise capability this container backs — rate limiting, for every tenant, on every request — still intact," because that capability was never a property of the container. It's a property of a request path crossing the Redis pod, the rate-limiter, and the gateway's fail-open default — none of which K8s's object model treats as one thing with one health signal. The pod was never the unit of failure here; it stayed perfectly healthy, by Kubernetes' own definition of healthy, for the entire incident. What failed was a cross-cutting contract with a blast radius of "every rate-limited request on this stamp" — a scope K8s has no object for, and therefore no rollback primitive for either. Rolling back a Deployment undoes a container. It cannot undo "the 20% of live traffic already routed to the new Redis while the rest stayed on the old one," because K8s never modeled two versions of this Redis coexisting behind a routing decision — the same single-version-stack constraint traced through Git, CI, the registry, and Helm earlier in this article, showing up one layer deeper, in a stateful backing service a security control depends on.

Real enterprise applications are almost never scoped to a container. The unit that needed a canary here was "rate limiting, as experienced by real tenant traffic" — a capability spanning multiple pods, two opposite failure-mode defaults (Redis fails closed, the gateway fails open), and every request on a stamp. Kubernetes gives you excellent primitives for canarying a container. It gives you none for canarying a capability. Reaching for K8s's native rollout mechanics to de-risk a change whose blast radius exceeds a container — which, for anything wired into a shared dependency like rate limiting, is most changes — is reaching for the wrong tool, correctly used.

### The Backdoor This Closes: "But K8s Is Fine for Pods"

The [Synthesis piece](/articles/k8s-thermostat-not-a-deployment-engine/#the-ceiling-nobody-sees) names the ceiling as a **category error** in Kubernetes' computational model — and grants the platform one safe harbor: *"Every one of these concepts works at pod level because pods are the unit Kubernetes was designed around."* Blue/green, canary, self-healing, immutable — all break at the infrastructure level, but all supposedly hold at pod level. The defense of Kubernetes always retreats to that harbor: "fine, don't use it to provision CloudFront — but for running a container, it's exactly right."

This Redis incident is inside the harbor, and it still sank.

Look at what the workload actually was. Not a CloudFront distribution, not a five-service transactional state machine, not an operator reconciling cross-account IAM. A single Redis. One `Deployment`, one Pod, one image, an `emptyDir`, a readiness probe. This is the *trivially-simple-dependency-graph* case the Synthesis piece concedes K8s handles perfectly: "image → container → readiness probe → Service endpoint. Four nodes, linear, fully managed by the kubelet." By that account it should have been safe. Every pod-level signal confirmed it was safe. And rate limiting was silently off across production for as long as the pod stayed up.

The harbor was never real. What made this a category error wasn't that the *workload* exceeded a container — the workload **was** a container, textbook-shaped. It's that the **thing that had to stay correct** was never the container. "Rate limiting works for every tenant" is an enterprise capability composed *through* that container together with a second controller and a fail-open default two hops away. Kubernetes modeled the container flawlessly and had no object, no health signal, and no rollback primitive for the capability. The pod being the unit K8s was designed around is not a safe harbor — it's the exact source of the blindness. K8s reports on the unit it models, and an enterprise application's correctness is never a property of that unit.

So the concession is too generous. It isn't "K8s is fine for pods, wrong for infrastructure." It's that **an enterprise application's failure unit is essentially never a container** — not at the infrastructure layer, and not even for a lone Redis that looks like the most K8s-native workload imaginable. The moment a container participates in a capability that spans more than itself — which, for anything an enterprise runs, is always — Kubernetes' entire object model is measuring the wrong thing. It will keep telling you the unit it owns is healthy while the capability that unit serves is dead, because it has no representation of the capability at all. That is not a gap you deploy around with more rings or better bake times. It is the platform reporting green about the only thing it can see, in a domain where that thing was never what mattered.

Kubernetes is a correct answer to "keep this container running." It is a category error the instant the question becomes "keep this enterprise capability correct" — and in an enterprise, that is the only question there ever was.

### And You Couldn't Have Flagged It Either — Twice Over

Return to the flag the whole article has been indicting. This Redis incident doesn't just argue that blue/green beats a staged rollout — it exposes two independent floors beneath the feature flag itself. The flag fails here for two unrelated reasons, and either one alone is fatal.

**Floor 1 — you can't name the predicate.** A feature flag can only guard a condition you can name. `if (flag) { ... } else { ... }` requires you to have identified, in advance, the difference worth branching on. That is exactly what an unknown unknown denies you. Even *knowing* the image swap was risky — even writing "this could break something" on the change ticket — there was no predicate to encode. The failure wasn't a code path you own; it was an emergent interaction (nonroot uid × forced `runAsUser` × the `bgsave` write threshold × Redis fail-closed × the gateway's fail-open default) manufactured by real write volume across two controllers. There is no `if (redisWillRejectWritesAfterNDirtyKeysUnderLoad)` to write, because nobody can enumerate that condition before production traffic produces it.

**Floor 2 — even with a perfect predicate, the branch unit won't fit in an `if`.** Now grant yourself the impossible: suppose you *had* known exactly what would break, and you had a clean predicate — `if (useHardenedRedis) { imageA } else { imageB }`. You still can't write it, because **the thing being switched is a container image, and an image is an immutable, indivisible deployment artifact — not a runtime value.** A code flag toggles a branch inside one running binary. This flag toggles *which binary exists at all*. You cannot select an image with an `if` statement in application code; image selection happens in the pod spec, at deploy time, one image per container. So the "flag" is not a flag — it's two Deployments, two pod specs, two rollout lifecycles, and now something above them has to choose. That is precisely the version-coexistence the pipeline refuses to model, resurfacing as the *literal* problem instead of a metaphor.

And the accidental complexity compounds from there, because an image has none of the properties a flag pretends it has:

- **It's not in your scope.** The rate limiter's Redis image is very likely owned by a platform or base-image team, pinned by a shared chart, and governed by a hardening mandate. "Toggle it per feature" means negotiating a fork of someone else's supply chain — an org boundary, not an `if`.
- **It's shared, so no single feature gets to decide.** The image isn't a per-feature resource — the rate limiter is one consumer, but many other features and services depend on that same Redis image too. A flag scoped to *your* feature can't say "featureX → imageA," because the image is one shared instance serving all of them at once. To honor the flag you'd have to make image selection a function of *every* feature that touches it — a combinatorial predicate no single team can own or test (featureX on + featureY off + featureZ on → which image?). The flag's `if` assumes a resource you alone control; a shared dependency has many consumers, so there is no single condition that is correct for all of them. The branching becomes so complicated it's self-evidently not worth it.
- **It drags its whole dependency closure.** An image is base layer + packages + uid/gid conventions + entrypoint. Branching the image branches *all* of that. The very bug here lived in that closure (the base image's root-boot `chown` behavior), not in anything a feature-team flag could reach.
- **It multiplies the build/scan/sign/promote matrix.** Two images means two things to build, CVE-scan, sign, and promote through every ring — permanently, until someone removes the flag. Which, as the "Why Migration Flags Never Get Removed" section already showed, is never.

So the flag isn't merely *worse* than blue/green here, the way the earlier sections framed it. On Floor 1 it is **inapplicable** — the branch predicate doesn't exist. On Floor 2 it is **the wrong shape** — the branch unit is an immutable image the team may not even own, so the innocuous-looking `if (feature)` metastasizes into a dual supply chain, a cross-team dependency, and a permanent build-matrix tax. Blue/green sidesteps both floors at once: it needs no predicate about *what* differs, and it switches nothing inside the binary — it branches on *which Redis instance this request hits*, a fact you always have and that costs one routing change to reverse. A flag asks "what will differ, and can you express that difference as a runtime condition inside code you own?" Blue/green asks "which version served this request?" and always knows. When the difference is a known knob inside your own binary, the flag is a bad tool for a job the pipeline should be doing. When the difference is an unknown unknown, or an immutable artifact you don't own, the flag is not a tool at all.

---

## Three Questions Before You Add a Migration Flag

**1. "Is my traffic partitionable?"**

What's the natural partition key? Can the routing layer see it without asking the backend? If yes — B/G. If no — flags might be appropriate.

**2. "Am I adding a flag because the systems can't coexist, or because my deployment model can't express coexistence?"**

For stateless data planes, they almost always can coexist. The flag is solving a tooling limitation, not a technical one.

**3. "Where can I make an atomic per-request routing decision?"**

DNS. Edge canary. CDN traffic splitting. Service mesh. Load balancer weighted routing. These are per-request, per-partition atomic decisions. Feature flags are per-deployment — and deployment is never atomic in a distributed system.

If your traffic is partitionable and your routing layer can see the key, the migration is a routing problem. Build it on the thing that provides the consistency guarantee you need.

---

*Based on observations from production multi-tenant SaaS platform architecture reviews. Details generalized; patterns are universal.*

---

### Series: Why Kubernetes Infrastructure Rots

- **Part 1: [The Operator Mindset](/articles/k8s-operator-mindset-vs-domain-modeling/)** — Why one domain becomes six repositories. The repo-per-problem anti-pattern as a consequence of thinking in procedures instead of models.

- **Part 2: [The Cargo Cult](/articles/k8s-cargo-cult-centralization/)** — Why shared repos and better tools don't fix it. The failed abstraction phase.

- **Part 3: [The Abstraction Instinct](/articles/k8s-abstraction-instinct/)** — What no tool can provide. CDK in the hands of an operator is still operator thinking.

- **Part 4: [The Distributed Monolith](/articles/k8s-gitops-distributed-monolith/)** — Why your GitOps is a monolith wearing a microservices costume. Five repos, five teams, zero transactional boundary, and six incidents in four weeks.

- **Part 5: [The Staging Mindset](/articles/k8s-staging-mindset-kills-migration/)** — Routing is atomic. Deployment is not. Why feature flags are what happens when the infrastructure can't express version coexistence. *(this article)*

- **Part 6: [The Shared Mutable State](/articles/k8s-cr-shared-mutable-state/)** — The CR is a database table with no foreign keys, shared between controllers with no ownership model. Silent data loss as a design consequence.

- **Aside: [Operator Stockholm Syndrome](/articles/k8s-operator-stockholm-syndrome/)** — When the K8s control plane becomes the universe. Routing every cloud API through a cluster CR even when the cluster has no semantic role.

- **Aside: [The Cron and the Gate](/articles/k8s-cron-and-gate/)** — When the operator models itself instead of the domain. One `Reconcile()` hook, triggered identically by create/resync/requeue, becomes the only place policy can live.

- **Aside: [The Configuration Problem](/articles/k8s-tribal-knowledge/)** — One business rule sliced across Helm, ConfigMap, Flux substitution, and Calico's dataplane — zero cohesion, load-bearing tribal knowledge.

- **Aside: [The Auto-Approve](/articles/k8s-auto-approve-swallows-the-gate/)** — When the reconcile loop swallows `terraform plan`. Wrapping a tool with a human-in-the-loop gate in a loop that structurally can't hold one.

- **Aside: [You Can't Front-Run the Composition Gap](/articles/k8s-front-run-composition-gap/)** — Why correct first-principles reasoning must crash once before it can diagnose.

- **Lab: [Verify It Yourself](/articles/k8s-verify-it-yourself/)** — Copy-pasteable, real-output reproductions of every cluster mechanism the series cites (foreign keys, CEL scope, ownerRefs, SSA, PUT-strips-fields, resourceVersion, CRD versioning, kstatus).

- **Synthesis: [The Thermostat That Ate Infrastructure](/articles/k8s-thermostat-not-a-deployment-engine/)** — How a container self-healing pattern became a deployment engine. The missing DAG from node boot to infrastructure blue/green.
