---
layout: article
title: "Why Your GitOps Is a Distributed Monolith"
description: "Part 4 of \"Why Kubernetes Infrastructure Rots.\" Five repos, five teams, six reconciliation layers, zero transactional boundary. CI stays green while the cluster sits in a partial-failure state — the distributed monolith failing in slow motion, one reconciliation interval at a time."
permalink: /articles/k8s-gitops-distributed-monolith/
date: 2026-07-10
author: "Gary Yang"
tags: ["kubernetes", "gitops", "flux", "helm", "distributed-monolith", "terraform", "infrastructure", "platform-engineering"]
---

# Why Your GitOps Is a Distributed Monolith

*A platform team deployed three components to a Kubernetes cluster. CI passed. The GitOps pipeline updated the tag. Flux reconciled. Everything looked green. The cluster spent the next hour in a partial failure state — one controller retrying thousands of times, another Kustomization stuck on a stale revision, a third blocked by a policy defined in a different repo by a different team. Nobody saw a single red status until someone checked the pod logs. This is the distributed monolith at work.*

---

## The Promise vs. the Reality

GitOps promised us declarative, auditable, self-healing infrastructure. Split your platform into stacks. Each stack gets its own repo. Each repo deploys independently via Flux or ArgoCD. Clean separation of concerns.

What we actually got is a distributed monolith — the same tight coupling as the monolith we fled, but now spread across five repos with no transactional boundary, no shared type system, no way to reason about cross-cutting changes, and reconciliation loops stacked six layers deep.

The monolith at least failed atomically. The distributed monolith fails in slow motion, one reconciliation interval at a time.

---

## Anatomy of a Partial Failure

Here's a real incident, anonymized but exact in its mechanics.

A team deployed three related components to a Kubernetes cluster — a gateway controller, a protocol proxy, and an orchestrator. Each component had its own Helm chart, namespace, CRDs, and controller pod. The deployment used a Flux GitOps stack with the standard three-Kustomization pattern: a root that creates two children — one for HelmReleases (`deploy-apps`), one for configuration resources (`deploy-config`).

**Minute 0:** CI builds version N, pushes OCI artifact to a registry, the deployment orchestrator updates the GitOps repo with the new tag, Flux polls and picks it up. All green.

**Minute 1:** `deploy-apps` applies version N — all six HelmReleases update. Controllers come up. But the controllers reconcile Gateway API `Gateway` custom resources, which triggers creation of data-plane proxy Services. The controllers default to `type: LoadBalancer` for these Services.

**Minute 2:** An OPA Gatekeeper admission webhook intercepts the Service creation. Two policies flag it:
- `LoadBalancerConstraint` — only whitelisted Service names can create LoadBalancers. This one **denies** the request. The whitelist lives in a *different repo* managed by a *different team*.
- `K8sRequiredLabels` — FinOps-mandated labels are missing. This one only **warns**, but the warning appears alongside the deny in the same error output, making it look like two blockers when only one actually blocks.

**Minute 3:** The controller enters a retry loop. Every 10 seconds: reconcile Gateway → try to create Service → Gatekeeper denies → log error → retry. Count climbs steadily — and would continue indefinitely if left alone.

**Minute 15:** The team pushes a fix — remove the problematic resources. CI builds a new version. But `deploy-config` was *also* changed, and the new configuration references a Calico `GlobalNetworkPolicy`. The ServiceAccount deploying configuration resources doesn't have Calico RBAC — that permission lives in a *third repo*.

**Minute 16:** `deploy-config` fails with `Forbidden` on dry-run. It stays on the previous version while `deploy-apps` has already moved forward. The root Kustomization health-checks both children, sees `deploy-config` unhealthy, and marks itself `Unknown`. The two children are now on different revisions. The root never converges.

**Minute 30:** The team pushes another fix. This time, `deploy-config` builds cleanly — zero resources, no Calico reference. Flux applies it. All Kustomizations finally show Ready.

**Minute 45:** But the controllers are *still retrying*. The Gateway custom resource was applied by a previous revision and exists on the cluster. `prune: true` is supposed to garbage-collect resources dropped from the desired set — Flux tracks what a Kustomization owns in an inventory and prunes what's no longer in the build. The mechanism it relies on: the current build still names the objects to reconcile, and prune diffs that against the inventory. When a build error or an empty render leaves the controller without a trustworthy new desired set, the safe behavior is to *not* prune (pruning on an empty/failed build would delete everything the Kustomization owns) — so the orphaned resource is left in place rather than removed. The resource stays. The retry loop continues. (Whether a given empty-render case *should* prune has been a real source of Flux edge-case behavior; the load-bearing point here is that "prune" is inventory-diff, not a dependency-aware cascade.)

**Minute 60:** Manual `kubectl delete` of the orphaned Gateway resource. Controller stops retrying. Silence.

Three code pushes. Two cascading failures. One manual intervention. The controller had been retrying for an hour straight, and would have continued indefinitely. CI said green the entire time.

---

## Anatomy of a Slow-Motion Kill: When Helm Uninstalls Your Neighbor's Schema

Here's a second incident, different in shape but identical in root cause. Where the first incident involved admission policies and RBAC boundaries, this one involves something more fundamental: **Helm's lifecycle model deleting a CRD that another stack's controller depends on.**

A platform team maintained two Flux stacks on the same cluster:

- **Gateway stack** — deployed gateway controllers and their CRDs, including a subchart called `legacy-gateway-crds`. This subchart installed several CRDs, among them `ratelimitconfigs.ratelimit.solo.io`.
- **Networking stack** — deployed the network operator (this article will call it **NetOp** for brevity — it's not a real acronym, just shorthand for the rest of this piece), a controller that watches multiple CRDs including `RateLimitConfig` from `ratelimit.solo.io/v1alpha1`. NetOp creates rate-limiting configurations for tenant traffic as part of its startup sequence.

Different repos. Different teams. Different deploy cycles. Deployed to the same cluster.

**Day 0:** The gateway team ships a PR replacing `legacy-gateway` with a new chart called `new-gateway`. Clean swap — old subchart removed from `Chart.yaml`, new one added. CI passes. The deployment orchestrator pushes to Ring 1 (test environment). Flux reconciles. The `gateway-stack` HelmRelease reports `Ready: True`. All green.

**Day 0, under the hood:** Helm sees that `legacy-gateway-crds` is no longer in the release manifest. Because CRDs were in the chart's `templates/` directory (not `crds/`), Helm treats them like any other resource — it deletes them as part of the upgrade. The `ratelimitconfigs.ratelimit.solo.io` CRD is removed from the cluster. Helm reports success. Flux reports success. Nobody notices, because Helm has no concept of "something outside my release depends on this resource."

**Day 0, still under the hood:** NetOp pods are still running. They started hours ago and already have the `RateLimitConfig` CRD schema cached in their informer. They don't re-resolve the CRD on every reconciliation cycle. The deletion is invisible to them. The cluster appears healthy.

**Day 1, 24 hours later:** A different team merges a PR to NetOp — an unrelated change to HPA behavior during environment hibernation. CI builds a new NetOp version. Flux deploys it to Ring 1. The new pod starts up. During initialization, NetOp runs its startup routine that ensures the rate-limit config exists — which resolves `RateLimitConfig` via the API server's discovery endpoint. The CRD doesn't exist anymore. Fatal error:

```json
{
  "level": "error",
  "logger": "setup",
  "msg": "unable to setup global resources",
  "error": "no matches for kind \"RateLimitConfig\" in version \"ratelimit.solo.io/v1alpha1\""
}
```

The pod crashes. Kubernetes restarts it. It crashes again. `CrashLoopBackOff`. The old NetOp pods — the ones with cached informers — are still running fine. The cluster is in split-brain: two healthy pods on version N, one crash-looping pod on version N+1. The HelmRelease that deployed NetOp doesn't know its pod is crash-looping — it only checks if `helm upgrade` succeeded, not whether the pods it created are healthy.

**Day 1 + 1 hour:** The team investigating the NetOp crash notices the error. They trace it to the missing CRD. They trace the missing CRD to the gateway stack upgrade from the previous day. They force-reconcile the networking stack's HelmRelease to recreate the CRD. NetOp restarts. Cluster recovers.

Then they check Ring 1. Same CRD missing. Same fix needed. Manual intervention, cluster by cluster.

**The timeline:**

| Time | What happened | Who saw it |
|------|--------------|-----------|
| Day 0, afternoon | Gateway stack deploys a new version, Helm deletes `RateLimitConfig` CRD | Nobody |
| Day 0, afternoon | Gateway stack HelmRelease reports `Ready: True` | Flux dashboard shows green |
| Day 0 – Day 1 | NetOp pods run fine on cached informers, CRD absence invisible | Nobody |
| Day 1, morning | NetOp deploys an unrelated PR, new pod crashes on missing CRD | NetOp team sees CrashLoopBackOff |
| Day 1, later that morning | Root cause identified: CRD deleted by gateway stack swap | Team traces cross-stack dependency |
| Day 1, early afternoon | Manual force-reconcile restores CRD on the dev ring | an engineer (manual fix) |
| Day 1, later that afternoon | Ring 1 still broken, same CRD missing | Team discovers blast radius |

**What makes this worse than the first incident:**

1. **24-hour delay.** The damage was done on Day 0. The symptoms appeared on Day 1. The team investigating the NetOp crash initially blamed the NetOp PR — because that's what changed. The actual cause (gateway stack subchart swap) was a day old and deployed by a different team.

2. **Helm's lifecycle model is the weapon.** Terraform would never do this. Remove a module from a Terraform config, and `terraform plan` shows you exactly what will be destroyed — including resources that other modules reference. Helm has no such model. It tracks resources per release, not per cluster. Delete a subchart, and Helm deletes its resources — even if those resources are CRDs that other releases depend on.

3. **The `templates/` vs `crds/` trap.** Helm has two places for CRDs: the `crds/` directory (installed once on first `helm install`, never deleted or upgraded) and `templates/` (treated like any other resource — created, updated, deleted). The `crds/` path is "safe" but useless for upgrades — you can't update a CRD schema via `crds/`. So charts put CRDs in `templates/` for upgradeability, which means they get deleted on uninstall. You get to choose between "CRDs that can't be upgraded" and "CRDs that get nuked when the chart is removed." There is no option for "CRDs that can be upgraded but are protected from accidental deletion."

4. **No blast-radius awareness.** The gateway team had no way to know — at PR time, at CI time, or at deploy time — that removing `legacy-gateway-crds` would break NetOp. There is no `helm impact` command. There is no Flux dependency graph that shows "this CRD is watched by a controller in a different stack." The cross-stack dependency exists only in the cluster's runtime state, invisible to every tool in the pipeline.

5. **Caching masks the blast.** The old controller pods kept running because a controller resolves each watched kind to a REST endpoint *once*, at manager startup — the discovery **RESTMapper** maps the GVK to a resource path and the informer opens a watch on it, and neither is re-resolved on a timer afterward. (The precise thing that goes stale is the RESTMapper's GVK→resource mapping plus the already-established watch, not "the informer cache" in the loose sense.) So a running controller keeps serving from an established watch even after the CRD is deleted — correct behavior for a live process, but it means the cluster *appears* healthy while the schema is gone. The blast only becomes visible when a **new** pod starts: its startup discovery now fails to find the kind (`no matches for kind …`), and it crashes. Cause and symptom are separated by hours or days — and by team and repo boundary.

This is the distributed monolith in its purest form. Two stacks. Two repos. Two teams. Two deploy cycles. One implicit dependency — a CRD schema — that no tool in the pipeline models, tracks, or protects. Helm deleted it because Helm only knows about its own release. Flux reported green because Flux only checks Kustomization health. The cluster was broken for 24 hours and nobody knew.

---

## The Five-Repo Problem

Here's what a single domain operation — "expose a gateway to the network" — touches:

| Repo | Team | What it owns | What this domain needs from it |
|------|------|-------------|-------------------------------|
| Gateway stack | Gateway team | Controllers, CRDs, HelmReleases | Deploy the controller and data plane |
| OPA Gatekeeper stack | Security team | Admission policies | Whitelist the namespace for LoadBalancer Services |
| Networking stack | Networking team | Calico policies, Gloo, Istio | Allow ingress/egress for the namespace |
| Access stack | Platform team | RBAC, ServiceAccounts | Grant the SA permission to create resources |
| Terraform | Infrastructure team | Cloud infra, VPC, DNS | Create the load balancer and DNS record |

Five repos. Five teams. Five deploy cycles. Five reconciliation intervals. Zero transactional boundary.

The gateway team can't deploy a complete feature without PRs to at least three other repos. Each PR has its own review cycle, its own CI, its own deployment cadence. The networking stack deploys on a different schedule than the OPA stack, which deploys on a different schedule than the gateway stack.

This is a monolith. It's just not in one repo.

---

## The Reconciliation Layer Cake

Each layer has its own polling interval and failure mode:

| Layer | Interval | Failure mode |
|-------|----------|-------------|
| CI → artifact registry | Immediate | Build failure (visible) |
| Deployment orchestrator → GitOps repo | Immediate | Tag update failure (visible) |
| Flux OCIRepository → artifact | 5 minutes | Poll miss (invisible) |
| Root Kustomization → children | 5-60 minutes | Health check timeout (invisible) |
| Child Kustomization → resources | 5 minutes | Apply failure, prune failure (invisible) |
| HelmRelease → Helm chart | 30-60 minutes | Upgrade failure, rollback (invisible) |
| Controller → reconcile CRs | Continuous | Admission denial, RBAC failure (invisible) |

The top two layers are visible — CI dashboards show pass/fail. Everything below is invisible unless you `kubectl` into the cluster and inspect individual resources. There is no single pane of glass that shows "version X is fully deployed and healthy." You assemble that picture manually from Kustomization status, HelmRelease status, pod logs, and events across multiple namespaces.

Worst case latency: CI finishes → 5 minutes for OCI poll → root reconciles but health-check fails → 5 minutes retry → child picks up new revision → 5 minutes to apply → controller reconciles → admission denied → retry every 10 seconds forever. Your "instant" GitOps deploy takes 15 minutes to propagate and may never converge.

The old `kubectl apply` gave you synchronous feedback. GitOps gave you eventual consistency with no clear "eventually."

### When "Eventually" Means "Never": The Stale Status Cascade

The layer cake doesn't just add latency. It creates failure modes where the system *never converges* — not because the resources are wrong, but because a **status field about the resources** is stale.

A Terraform resource on a platform — a Terraform-runner resource that manages NLB security groups — runs via the tofu-controller. At some point, the controller completes a plan: no changes needed. `Ready: True`. The resource is in its desired state. But the `Reconciling` condition gets stuck at `True` with message "Fulfilling prerequisites." The controller finished its work and forgot to clear its own status flag. No runner pods are running. No errors in the logs. The plan succeeds every 12 hours.

Now trace the cascade through the layer cake:

| Layer | Status | What it sees |
|-------|--------|-------------|
| Terraform resource | `Ready: True`, `Reconciling: True` (stale) | Healthy — plan completes, no changes |
| Kustomization `deploy-apps` | `Unknown/Progressing` | Health check sees `Reconciling=True` → "not converged" |
| Kustomization `deploy-config` | `DependencyNotReady` | `dependsOn: deploy-apps` → blocked |
| All networking-stack config changes | **Cannot deploy** | Entire config pipeline frozen |

Seven clusters had the same stale condition. (Throughout this article, an *environment* is a single self-contained cluster deployment, and a *ring* is a promotion tier — internal/dev tiers first, then staging, then production — the pipeline promotes through, one tier at a time. These seven environments all sat in the same tier.) All stuck since that day. No alerts. No dashboards showing red. The Terraform plan ran successfully every 12 hours. The HelmReleases were healthy. The pods were running. The Kustomization health check — a blunt instrument that, via the kstatus convention, classes any object reporting `Reconciling: True` as "in progress" *regardless of* `Ready: True` — treated the stale condition as "still converging" and blocked the entire deployment chain. *(This precedence rule, and the exact `Ready=True`+`Reconciling=True` state that triggers it, is reproduced live in [Verify It Yourself §"kstatus"](/articles/k8s-verify-it-yourself/#parts-2--5--kstatus-a-stale-reconciling-condition-blocks-readiness).)*

For seven days, the networking stack could not deploy configuration changes to any environment in that tier. The fix required an RFC, a CAB review, and a scheduled maintenance window — to `kubectl patch` a status field on seven clusters. A stuck boolean that the controller should have cleared automatically blocked all deployments for a week, and the only detection mechanism was a human reading Kustomization conditions during an unrelated investigation.

This is the layer cake's worst failure mode: not "resource broken" but "resource healthy, status stale, entire deployment chain frozen, nobody told." The layers above can't distinguish "still converging" from "converged but forgot to say so." There is no timeout. There is no escalation. There is no alert that fires when a Kustomization has been in `Progressing` for seven days. The system is designed to be eventually consistent — and it will wait forever for an "eventually" that already happened.

The sequel was worse. The team prepared a fix — suspend and resume each Terraform resource to reset the stale condition — got RFC approval, and executed it across all seven environments. The conditions didn't clear. Two days later, someone ran `kubectl get pods` on the Terraform controller itself. `ImagePullBackOff`. The controller wasn't running. The health checks had been reporting stale conditions from a dead controller for an unknown duration. The fix required a running controller to take effect. Nobody checked whether the controller was alive before executing the fix, because no tool in the stack surfaces controller liveness as a health signal. The HelmRelease said `Ready`. The Kustomization said `Progressing`. The pod said `ImagePullBackOff`. Three different views of the same system, and the only accurate one required a human to look at the right resource in the right namespace.

---

## The Cluster Is the Monolith

The previous section described what happens when multiple stacks share a cluster. But notice what didn't appear in the diagnosis: "if only we'd drawn the repo boundaries differently." The failure isn't organizational. It's architectural.

Every Kubernetes extension — CRD, operator, admission webhook, service mesh — funnels through the same chokepoint:

```
                    ┌──────────────────────────────┐
                    │         API Server            │
                    │    (single serialization      │
                    │     point for all mutations)  │
                    └──────────┬───────────────────┘
                               │
                    ┌──────────▼───────────────────┐
                    │           etcd                │
                    │   (single store for ALL       │
                    │    CRDs, CRs, Secrets,        │
                    │    ConfigMaps, RBAC, events)  │
                    └──────────────────────────────┘
                               ▲
           ┌───────────────────┼───────────────────┐
           │                   │                   │
    ┌──────┴──────┐    ┌──────┴──────┐    ┌──────┴──────┐
    │  Gloo (50+  │    │  Istio (60+ │    │  Calico     │
    │  CRDs)      │    │  CRDs)      │    │  (30+ CRDs) │
    └─────────────┘    └─────────────┘    └─────────────┘
    │  Watches all │    │  Watches all│    │  Watches all│
    │  VirtualSvcs │    │  Gateways   │    │  NetPols    │
    └──────────────┘    └─────────────┘    └─────────────┘
```

140+ CRDs. All registered globally — CRD registration is cluster-scoped, not namespaced. All stored in one etcd. All validated by one admission chain. All watched through one API server's informer cache.

This is not a distributed system. It's a **monolithic kernel with a plugin API**.

The consequences are architectural, not operational:

| Property | What K8s claims | What actually happens |
|----------|----------------|----------------------|
| **CRD scope** | "Extend the API" | Global registration — one bad CRD schema blocks all `kubectl apply` |
| **Admission chain** | "Policy as code" | Serial pipeline — one slow webhook adds latency to every mutation in the cluster |
| **Informer cache** | "Efficient watch" | Shared memory — every operator's watch-list competes for the same API server connection pool |
| **etcd** | "Reliable store" | Single write journal — all 140+ CRDs serialize through one Raft consensus group |
| **Failure domain** | "Namespaces isolate" | Cluster-wide — API server down = all operators down, all reconciliation stops |

**Blast radius is always the cluster.** Not the namespace. Not the stack. Not the team. The cluster. A Gatekeeper webhook that takes 5 seconds to respond slows down every `Service` creation across every namespace. An Istio control plane OOM kills xDS delivery to every sidecar. A Calico Felix crash drops NetworkPolicy enforcement for every pod. An etcd compaction stall freezes every controller.

Namespaces are an accounting boundary, not a fault boundary. RBAC limits *who* can mutate, but every mutation still flows through the same API server, the same admission chain, the same etcd. You can't isolate one operator's blast radius from another. You can't circuit-break a misbehaving CRD controller without restarting the API server that all controllers depend on.

This means the distributed monolith described in the previous sections isn't a repo-boundary mistake that better org design could fix. It's the inevitable consequence of the K8s extension model: **everything that "extends" Kubernetes actually centralizes through Kubernetes**. Every CRD, every operator, every mesh, every policy engine adds load and coupling to the same single-threaded chokepoint. The more you extend, the more monolithic it becomes.

The five-repo, five-team, six-layer GitOps architecture is a distributed monolith not because the teams drew the wrong boundaries — but because the platform underneath enforces a single blast radius regardless of how you draw them.

---

## When the Blast Radius Extends Beyond the Cluster

The previous section showed that blast radius is always the cluster. But what happens when one operator manages resources *across* clusters — when the coupling extends beyond Kubernetes into the CDN layer that serves real customer traffic?

A team built a CDN operator that manages CloudFront Multi-Tenant Distributions. Each distribution serves custom domains for customer applications — certificates, routing functions, DNS records. The operator runs on management environments and creates three `MultiTenantDistribution` CRs — one per ring:

```
Management environment (EKS)
└── Edge Operator (single pod)
    ├── mtd-apps-dev   → CloudFront Distribution (Ring 0)
    │   └── N Distribution Tenants (customer domains)
    ├── mtd-apps-test  → CloudFront Distribution (Ring 1)
    │   └── N Distribution Tenants (customer domains)
    └── mtd-apps-stage → CloudFront Distribution (Ring 2)
        └── N Distribution Tenants (customer domains)
```

Same pattern for the production rollout rings (Ring 3, Ring 4, Ring 5). **Two operator pods manage the entire CDN layer for all six rings.**

The team investigated deploying one operator per ring — the obvious fix for blast radius. They rejected it. Route53 wildcard DNS constraints force two CDN accounts (a pre-production account and a production account). A single Route53 hosted zone serves all three rings in each account. You can't split it without customer-visible DNS changes across every custom domain. The distributed monolith is **architecturally mandatory**.

The consequences:

**No progressive rollout within CDN.** Runtime operators (those that manage Gloo, Istio, Calico per-environment) deploy through the six-ring pipeline — Ring 0 first, then Ring 1, then Ring 2, then three progressively wider production rings. A bug in Ring 0 is caught before it reaches Ring 1. The CDN operator bypasses this entirely. A Helm upgrade on the pre-production management environment hits Ring 0, Ring 1, and Ring 2 simultaneously. There is no "promote to the next ring" for the CDN layer.

**Shared CloudFront Function across all rings.** The operator deploys a JavaScript function, roughly a hundred lines, to every distribution. The function runs on every viewer request — parsing tenant context, routing to the correct origin, transforming paths. The same JS runs on Ring 0 and Ring 2. If the function has a routing bug, all three rings' custom domains are affected at once. There is no mechanism to deploy a new function to one ring first.

**Cross-account IAM chain with no circuit breaker.** The operator pod assumes roles across three AWS accounts: the management account (IRSA), the CDN account (cross-account assume-role), and the DNS account (another cross-account assume-role). A trust policy change in any account silently breaks reconciliation. The operator retries forever. No alert fires because the HelmRelease is healthy — Helm doesn't know the pod can't reach AWS.

**Several interdependent PRs across multiple repos.** At the time of writing, the operator has a handful of open PRs — CRD restructuring, certificate management, orphaned resource adoption, zero-downtime migration, WAF configuration — plus additional cross-repo PRs in the legacy operator and routing service. All depend on each other. All deploy independently. A working group had to coordinate the merge, which is an implicit acknowledgment that these PRs form a single atomic change spread across repos with no transactional boundary.

This is the distributed monolith taken to its logical extreme. The cluster is still the monolith — but the operator reaches *through* the cluster into AWS resources that serve customer traffic across multiple rings. The blast radius isn't just "every pod on this cluster." It's "every custom domain on three rings."

---

## The Missing DAG: It's Not Just CRDs

The CRD deletion incident was dramatic — a controller crash-looping, a 24-hour delayed blast. But CRDs are just one resource type. The same cross-release dependency problem exists for **every resource type on the cluster**. Nobody talks about it because the other failures are quieter.

Here's what a single platform actually looks like when you trace the implicit dependencies between independently deployed stacks:

| Resource type | Installed by | Referenced by | What happens when the installer is removed |
|---|---|---|---|
| **CRD** (`ratelimitconfigs.ratelimit.solo.io`) | Networking stack (`gloo-ee` chart) | NetOp controller (networking stack), global-rate-limit (networking stack), gateway stack (via `legacy-gateway-crds`) | Controllers that register the GVK in their scheme crash on startup — `no matches for kind` |
| **Secret** (license key, TLS cert) | Secrets-store stack (ExternalSecret → SSM) | Networking stack (Gloo license), gateway stack (Solo UI), Istio (mTLS certs) | HelmRelease upgrade fails — referenced Secret doesn't exist. But the HelmRelease retries silently. |
| **ConfigMap** (`platform-baseline-config`) | Terraform (a cluster-baseline Terraform module) | Every Flux stack (via `valuesFrom`) | All HelmReleases that reference it fail to render. But they fail at different times depending on reconciliation interval. |
| **Namespace** (`kube-gloo-system`) | Networking stack (Helm `install.createNamespace`) | Gateway stack (deploys gateway proxy into it), access stack (RBAC references it) | Removing networking stack deletes the namespace — and everything in it, including resources from other stacks. |
| **ClusterRole** | Access stack | NetOp (needs `gateway.solo.io` permissions), another controller (needs Crossplane permissions) | Access stack removes an apiGroup from the ClusterRole → operator gets `Forbidden` on next reconcile. Silent until a new CR triggers the write path. |
| **Admission webhook** (Gatekeeper) | OPA stack | Every stack that creates Services, Deployments, ConfigMaps | OPA stack adds a new constraint → existing stacks' controllers start getting denied. No notification to the affected teams. |
| **NetworkPolicy** (Calico GlobalNetworkPolicy) | Networking stack | Every namespace on the cluster | Networking stack changes a default-deny rule → pods in other stacks lose connectivity. No error in the affected stack's reconciliation. |

Every row in this table is the same pattern: **Stack A installs a resource. Stack B depends on it. Neither A nor B declares the dependency. No tool tracks it.**

The [Ladder of Abstraction](https://ondemandenv.dev/articles/abstraction-ladder/) identifies this as the core function of Layer 2 (Declarative Composition): modeling infrastructure as a graph database with nodes, edges, and topological traversal. Terraform's state file is a Layer 2 artifact — it tracks resources as a DAG and refuses unsafe deletions when cross-references exist. Helm and Flux operate at Layer 1 (Declarative State) — individual resource declarations with no graph. Each HelmRelease is an isolated node. Each Flux Kustomization is an isolated node. The edges between them — the CRD that two stacks share, the Secret that three controllers reference, the namespace that four teams deploy into — exist only at runtime. Layer 2 is missing from the GitOps deployment model, and the distributed monolith is the result.

Helm tracks resources per-release. Flux tracks resources per-Kustomization. Terraform tracks resources per-state-file. None of them track cross-boundary dependencies. The question "if I remove Stack A, what breaks?" has no tooled answer — it requires a human to mentally trace the graph across every stack, every controller, every namespace.

This is not a CRD-specific problem. It's a **resource DAG problem** — and the DAG doesn't exist anywhere except in the heads of the senior engineers who've been burned by each dependency individually.

### The migration problem makes it worse

Dependencies between stacks are manageable when stacks are stable — you learn them once, document them in a runbook, and they don't change. The problem explodes during **migrations** — when you're replacing one component with another and need to transfer ownership of shared resources.

Consider a real migration: Gloo Edge v1 → kgateway v2. The networking stack deploys `gloo-ee`, which installs 33 CRDs. The network operator (NetOp, a controller in the same stack) creates instances of 8 of those CRDs — VirtualServices, RouteTables, AuthConfigs, Upstreams, RateLimitConfigs, and more. The gateway stack (a different repo, different team, different deploy cycle) installs kgateway alongside Gloo during the transition.

The migration requires:

1. Install kgateway CRDs (new API groups) — gateway stack
2. Migrate NetOp from Gloo types to Gateway API types — NetOp repo (code change)
3. Migrate global-rate-limit from Gloo `RateLimitConfig` to new mechanism — global-rate-limit repo
4. Update RBAC for new API groups — access stack
5. Update network policies for new namespaces — networking stack
6. Verify zero Gloo CR instances remain — manual kubectl across all environments
7. Remove `gloo-ee` HelmRelease — networking stack
8. Remove Gloo images from registry — the image-ingestion repo

Eight steps, five repos, three teams, deployed independently through a ring pipeline with no transactional boundary. Step 7 deletes 33 CRDs. If step 2 or 3 isn't complete on every environment in every ring, controllers crash. If step 6 is skipped, Helm deletes CRDs that still have instances — which either fails (if finalizers exist) or orphans the instances (if they don't).

There is no `terraform plan` that shows the full impact. There is no Flux dependency that says "don't remove `gloo-ee` until NetOp's newer major version is deployed to all environments." There is no gate in the promotion platform that says "this deployment depends on that deployment." Each step is a separate PR, a separate CI run, a separate ring promotion, a separate bake timer. The ordering exists only in a migration plan document that no automation reads.

The team that recently experienced the CRD deletion — one subchart removed, one CRD gone, one controller crash-looping — is now planning this migration. They know what happens when you get one dependency wrong. The migration has dozens.

### What the DAG would look like

If the dependency graph existed, it would look something like this:

```
gloo-ee (networking-stack)
├── CRDs: 33 CRDs in gateway.solo.io, gloo.solo.io, ratelimit.solo.io, ...
│   ├── consumed by: NetOp (creates VirtualService, RouteTable, AuthConfig, Upstream, RateLimitConfig)
│   ├── consumed by: global-rate-limit (creates RateLimitConfig)
│   └── consumed by: gloo control plane (reconciles all Gloo CRs)
├── Namespace: kube-gloo-system
│   ├── used by: gateway-stack (deploys gateway proxy)
│   └── used by: access-stack (RBAC scoped to namespace)
├── ClusterRoles: gloo-resource-reader, gloo-upstream-mutator
│   └── consumed by: NetOp (bound via ClusterRoleBinding)
└── Secrets: gloo-license, gloo-tls
    └── consumed by: gloo-ee pods (mounted as volumes)

access-stack
├── ClusterRole: developer-read
│   └── consumed by: every team's kubectl access to CRDs
└── ClusterRole: flux-deployer-sa
    └── consumed by: every Flux stack's ServiceAccount

platform-baseline-config (Terraform)
└── consumed by: every Flux stack (valuesFrom in HelmRelease)
```

This graph doesn't exist in any tool. Helm doesn't build it. Flux doesn't build it. Kubernetes doesn't build it. The API server knows which resources exist but not which resources depend on which. The `ownerReferences` mechanism tracks parent-child within a single controller, not cross-controller or cross-stack dependencies.

**Terraform builds this graph for its own state.** `terraform plan` shows you: "deleting module X will destroy resources A, B, C. Resource D in module Y references resource B. This will break." The Kubernetes ecosystem has nothing equivalent across Helm releases.

The result: every migration, every major upgrade, every component swap is a manually-traced dependency exercise. The senior engineers who've been burned enough times carry the graph in their heads. New team members don't — and neither do the tools they use.

---

## "That's Just How Eventual Consistency Works"

Bring this up in a retrospective and someone will say it. It's the thought-terminating cliché of platform engineering: *"That's how eventual consistency works. You can't have atomic deploys in a distributed system."*

This is wrong. Not because eventual consistency doesn't exist — it does — but because they're treating an *implementation choice* as a *law of physics*.

Terraform has explicit dependency graphs. It builds a DAG of resources, resolves ordering, and applies them in topological order. If step 3 depends on step 2, step 3 waits. If step 2 fails, step 3 doesn't run. You get a clear plan, a clear apply, and a clear error. CloudFormation does the same with stack dependencies. Pulumi does the same with real programming language semantics — `async/await`, typed outputs wired to typed inputs, the dependency graph is the code.

These tools prove that declarative infrastructure deployment does not require eventual consistency. You can have a dependency graph. You can have ordered execution. You can have synchronous feedback. You can have atomic rollback. The technology exists. It's been production-grade for a decade.

So why doesn't the Kubernetes GitOps ecosystem have it?

Because Kubernetes was designed as a **runtime reconciliation engine**, not a **deployment orchestration engine**. The reconciliation loop — watch desired state, compare to actual state, converge — is brilliant for runtime self-healing. A pod crashes, the ReplicaSet controller restarts it. A node dies, the scheduler reschedules. No human intervention needed.

But the community took a runtime pattern and applied it to deployment. Flux and ArgoCD watch a Git repo and reconcile the cluster toward it — the same pattern. The problem is that deployment has properties that runtime doesn't:

| Property | Runtime | Deployment |
|----------|---------|------------|
| **Ordering** | Usually irrelevant (pods are fungible) | Critical (CRDs before CRs, policies before workloads) |
| **Atomicity** | Not needed (partial state is fine, will converge) | Essential (partial state = broken cluster) |
| **Dependency** | Implicit (controllers watch their own resources) | Explicit (this Service needs that policy exception) |
| **Feedback** | Asynchronous (events, conditions) | Synchronous (did it work? yes/no) |
| **Rollback** | Automatic (controller reverts to desired state) | Manual (which of 5 repos do you revert, in what order?) |

Terraform solves deployment because it was designed for deployment. It models dependencies explicitly, executes in order, reports success or failure synchronously, and rolls back atomically.

Flux solves runtime reconciliation because it was designed for runtime. It watches, compares, converges, retries. But it has no dependency graph between Kustomizations. No ordering between stacks. No atomic apply across repos. No synchronous feedback beyond "I applied what was in Git."

The engineers who say "that's just how eventual consistency works" are revealing something important: they've only operated inside the Kubernetes ecosystem. They haven't used Terraform's DAG. They haven't seen Pulumi's typed resource graph. They haven't experienced what deployment looks like when the tool models dependencies explicitly instead of hoping that independent reconciliation loops converge.

It's not that explicit DAG-based deployment is impossible in Kubernetes. It's that the dominant tools chose not to build it, the community accepted the tradeoff, and now an entire generation of platform engineers believes that "deploy and hope it converges" is the only option. They're proud of their ability to debug convergence failures — the same way a veteran sysadmin is proud of their ability to fix a system that a better design would have prevented from breaking.

The right response to "that's just how eventual consistency works" is: *"Terraform doesn't have this problem. Why does your GitOps?"*

---

## The Prune Problem: Lifecycle Without a Model

The most insidious symptom of the distributed monolith isn't the deploy failure — it's the *cleanup* failure.

GitOps controllers like Flux offer a `prune: true` setting: if a resource was in the previous build but isn't in the current one, delete it. This is how GitOps achieves declarative state — the repo is the source of truth, and anything not in the repo gets removed.

In theory.

In the incident above, the team removed a Gateway custom resource from the repo. CI built a new artifact. Flux applied it. The Kustomization reported `Ready: True`. But the Gateway CR was still on the cluster. The controller was still reconciling it. The retry loop was still running.

Why? The Kustomization build produced *zero resources*. Flux's prune logic compared "what I applied" against "what's in the inventory" — but when the build output is empty, the prune path hits an edge case. The inventory still listed the Gateway CR. The Kustomization still reported healthy. The cluster still had the orphan. Nobody was told.

This isn't a bug in Flux. It's a fundamental problem with implicit lifecycle management.

**No resource in the GitOps model knows what depends on it.** The Gateway CR creates a data-plane proxy Deployment and a Service. When you delete the Gateway CR, the controller should clean up the Deployment and Service. But if the controller's own retry loop prevented the data plane from ever being created (because Gatekeeper blocked the Service), then the Gateway CR has no finalizer, no ownerReference chain, no cleanup path. It's an orphan that thinks it still has work to do.

**No Kustomization knows what other Kustomizations affect the same namespace.** `deploy-apps` deploys HelmReleases that create controllers. `deploy-config` deploys Gateway CRs that the controllers reconcile. Delete the Gateway CR from `deploy-config`, and `deploy-apps` has no idea — its controller keeps trying to reconcile a resource that a sibling Kustomization was supposed to prune.

**No repo knows what resources other repos created in "its" namespaces.** The networking stack created a Calico policy for the gateway namespace. The gateway stack created a Gateway CR in the same namespace. Delete one, and the other has no idea. The dependency is implicit — encoded in human knowledge, not in the system.

This is a solved problem — outside of Kubernetes.

Terraform's dependency graph isn't just a deployment tool. It's a lifecycle tool. `terraform apply` walks the DAG forward: create dependencies before dependents. `terraform destroy` walks it backward: delete dependents before dependencies. Remove a resource from the configuration, run `terraform plan`, and Terraform shows you exactly what will be deleted, in what order, with what downstream effects. No orphans. No edge cases. No "zero resources means no prune."

The DAG *is* the cleanup model. If resource B depends on resource A, then creating means A-then-B, and destroying means B-then-A. The dependency graph encodes both directions. You get creation order and destruction order from the same model.

Flux has no such model. Each Kustomization manages its own inventory — a flat list of resources it applied. Prune compares the current build against the inventory and deletes the difference. But the inventory has no dependency information. It doesn't know that a Gateway CR created a Deployment and a Service via a controller. It doesn't know that deleting the Gateway CR should trigger cleanup of the data plane. It doesn't know that another Kustomization deployed a network policy that only exists because this Gateway exists. Each Kustomization is an island, pruning its own flat list, blind to the dependency graph that connects resources across Kustomizations, across namespaces, across repos.

In DDD terms, this is what happens when you have **no aggregate root**. An aggregate root enforces invariants across its cluster of entities. Delete the root, and everything it owns gets cleaned up — because the ownership is explicit, modeled, enforced. In the GitOps world, there is no aggregate root. There are resources scattered across repos, applied by independent reconciliation loops, with dependencies that exist only in the operator's head.

The cognitive cost is enormous. Every change requires the operator to mentally trace:

1. What resources does this create? (Read the Helm chart, the Kustomization, and the controller source code)
2. What other resources depend on these? (Check every other repo that targets the same namespace)
3. What happens when I remove this? (Trace the prune logic, the finalizer chains, the controller cleanup paths)
4. What happens if cleanup fails? (Know the edge cases in Flux prune, Helm uninstall, controller finalizers)

A senior engineer can do this. A new team member cannot. And the senior engineer can only do it because they've been burned before — they carry the dependency map in their head because the system doesn't model it anywhere.

This is the real cost of the distributed monolith: not the one-hour incident, but the permanent cognitive overhead of operating a system whose lifecycle is implicit, whose dependencies are unmodeled, and whose failure modes are discoverable only through experience.

---

## The Sysadmin's Instinct vs. the Domain Modeler's Instinct

How did we get here? The repo boundaries aren't arbitrary — they follow a consistent logic. It's just the wrong logic.

**The sysadmin's instinct: Group by what it *is*.**

All network policies in one repo. All OPA policies in another. All RBAC in a third. All Helm charts for one "category" in a fourth. This feels clean — you know where to find things. Need a network policy? Check the networking stack. Need an OPA exception? Check the OPA stack.

**The domain modeler's instinct: Group by what it *does*.**

Everything needed for the gateway to function — controller, CRDs, Gateway CRs, network policy, OPA exception, RBAC — in one bounded context. Everything needed for observability in another. Everything needed for tenant isolation in a third.

The sysadmin's grouping optimizes for **discoverability by infrastructure type**. The domain modeler's grouping optimizes for **deployability by business capability**.

The difference is invisible on day 1. By month 12, the sysadmin's grouping has produced a system where deploying one feature requires coordinating across five repos, three teams, and six reconciliation loops — while the domain modeler's grouping lets a team ship end-to-end in one PR.

---

## What DDD Tells Us About GitOps Boundaries

Domain-Driven Design offers precise vocabulary for what went wrong:

**Bounded Context:** A boundary within which a particular domain model applies consistently. In platform engineering, a bounded context should be "everything needed for capability X to function." Instead, we draw boundaries around infrastructure types — "everything that is a network policy."

**Aggregate Root:** An entity that owns the lifecycle of its cluster of objects. A `Gateway` custom resource is an aggregate root — it should own its data-plane proxy, its Service, its network policy, its OPA exception. Instead, each of these is owned by a different repo, deployed by a different reconciliation loop.

**Anti-Corruption Layer:** A translation boundary between contexts. When the gateway stack needs an OPA exception, it should declare the requirement; a translation layer should fulfill it. Instead, the gateway team submits a PR to the OPA repo, written in the OPA team's vocabulary, deployed on the OPA team's schedule.

**Anemic Domain Model:** A model that holds data but enforces no invariants. The GitOps repos are anemic domain models — they contain YAML resources but encode no relationships between them. There's no way to express "this Gateway requires this OPA exception and this Calico policy." Each resource is deployed independently, and their consistency is the operator's responsibility.

Here's what the current split looks like in DDD terms:

```
Bounded Context: "Gateway"
  Aggregate Root: Gateway CR
  Required invariants:
    - Controller must be running           (gateway-stack repo)
    - CRDs must be installed               (gateway-stack repo)
    - Namespace must exist                 (gateway-stack repo)
    - Network ingress/egress allowed       (networking-stack repo)
    - LoadBalancer whitelist exception      (opa-gatekeeper-stack repo)
    - FinOps labels on all resources       (opa-gatekeeper-stack repo)
    - ServiceAccount has RBAC              (access-stack repo / Terraform)
    - Load balancer + DNS record exist     (Terraform)
```

Eight invariants, spread across five repos. No mechanism to validate them together. No mechanism to deploy them atomically. No mechanism to detect when one changes and the others don't.

---

## The Distributed Monolith Checklist

You have a distributed monolith if:

- [ ] Deploying one feature requires PRs to 3+ repos
- [ ] A cross-cutting change (upgrade a CRD version, change a namespace name) takes days, not minutes
- [ ] CI passes but the cluster is in a broken state
- [ ] You discover deployment failures by reading pod logs, not from a dashboard
- [ ] "It works locally" but fails on the real cluster because of policies/RBAC/network rules defined elsewhere
- [ ] Teams wait on each other's deploy cycles for their feature to work end-to-end
- [ ] Nobody can answer "what version is running?" without checking 4 different resources
- [ ] Orphaned resources accumulate because pruning doesn't work across repo boundaries
- [ ] Removing a resource from Git doesn't remove it from the cluster — and nobody notices
- [ ] Removing a subchart deletes CRDs that controllers in other stacks depend on — and Helm calls it success
- [ ] A Secret, ConfigMap, or Namespace installed by one stack is silently consumed by three others — and nobody declared the dependency
- [ ] Migrating from component A to component B requires a manually-traced dependency graph across 5+ repos with no tooled verification
- [ ] The question "if I remove this stack, what breaks?" can only be answered by a senior engineer from memory
- [ ] The dependency map between resources exists only in senior engineers' heads
- [ ] Rollback means "revert 3 repos in the right order and hope the reconciliation loops converge"
- [ ] A stale status condition on one resource blocks the entire stack's deployment chain for days — and no alert fires

If you checked more than three, congratulations — you've rebuilt the monolith, but worse. The monolith at least had a single deploy pipeline and a single rollback button.

---

## What the Right Boundaries Look Like

I'm not arguing for one giant repo. I'm arguing for boundaries drawn by domain capability, not infrastructure type.

**Current (infrastructure-cut):**

```
networking-stack/     → all Calico, Gloo, Istio for everyone
opa-gatekeeper-stack/ → all OPA policies for everyone
gateway-stack/        → gateway controllers only
access-stack/         → all RBAC for everyone
terraform-infra/      → all Terraform for everyone
```

**Alternative (domain-cut):**

```
platform-gateway/
  ├── controllers/        (gateway controller, proxy, orchestrator)
  ├── network-policy/     (Calico allow rules for gateway namespaces)
  ├── admission-policy/   (OPA exceptions for gateway namespaces)
  ├── rbac/               (ServiceAccount, ClusterRole)
  └── infrastructure/     (Terraform module for LB + DNS)

platform-networking/
  ├── gloo/
  ├── istio/
  ├── calico-base/        (default-deny, IMDS deny, etc.)
  └── ...

platform-security/
  ├── opa-base/           (base policies that apply everywhere)
  └── ...
```

Each domain owns its complete lifecycle. Base policies (default-deny, required labels) stay centralized because they genuinely apply to everyone. But domain-specific exceptions and configurations live with the domain.

The key principle: **Centralize the policy. Distribute the implementation.**

The security team owns the *policy* that LoadBalancer Services are restricted. The gateway team owns the *exception* that their namespace is whitelisted. The policy is global; the exception is local. Currently both live in the security repo, which means the gateway team can't ship without the security team's PR review cycle.

---

## Why This Doesn't Happen

Platform teams know this is painful. They're not oblivious. They just face structural incentives that make the domain-cut impractical:

**1. Tooling assumes infra-cut boundaries.** Flux Kustomizations, Helm charts, and OCI artifacts are designed around "one repo = one stack = one deployment unit." There's no native support for "this stack needs a resource from that stack's API group."

**2. RBAC follows the infra-cut.** ServiceAccounts are scoped to stacks. The gateway-stack SA has Gateway API permissions but not Calico permissions. Giving it Calico permissions would violate least-privilege. The RBAC model enforces the infra-cut even if you want to escape it.

**3. Organizational boundaries reinforce repo boundaries.** The networking team owns the networking stack. The security team owns the OPA stack. Reorg-ing repos means reorg-ing ownership, which means reorg-ing teams. Nobody wants to touch the org chart to fix a deploy pipeline.

**4. The sysadmin mental model is dominant.** Kubernetes was built by and for operations engineers. The community thinks in terms of "resources to apply" not "domains to model." Every conference talk, every blog post, every best-practice guide assumes infra-cut boundaries. It takes active resistance to think differently.

**5. Complexity is a defense weapon.** This is the one nobody says out loud.

North Korea's nuclear program does nothing good for its people. It doesn't feed them, educate them, or improve their lives. But it makes the regime indispensable. The weapons exist to ensure that the people who control them cannot be removed — because only they understand the launch codes, the supply chains, the maintenance rituals.

Institutional complexity works the same way. A platform with five repos, six reconciliation loops, three implicit dependency chains, and edge cases discoverable only through tribal knowledge is a platform that *cannot be operated by newcomers*. The senior engineers who carry the dependency map in their heads become irreplaceable — not because they're brilliant, but because they're the only ones who know which `kubectl delete` to run when Flux prune doesn't work, which repo to PR when a policy blocks your deploy, and which Slack channel to ask when RBAC is wrong.

To be clear: this isn't an indictment of individuals. It's an indictment of organizational systems that reward complexity retention over knowledge transfer. Most platform engineers don't think "I'll make this complex so I can't be fired." But the incentive structure is real — and organizations build it, not engineers. Simplifying the system — drawing clean domain boundaries, making dependencies explicit, automating the cognitive overhead away — would make the platform operable by anyone. And "operable by anyone" is a direct threat to the people whose value proposition is "I'm the only one who can operate this."

The nuclear analogy holds in another way: disarmament requires trust. Simplifying infrastructure complexity requires the organization to invest in the domain modeling skills that would replace tribal knowledge with explicit models. If the organization won't invest — if it keeps hiring for "Kubernetes experience" instead of "domain modeling experience" — then the engineers holding the tribal knowledge are rational to keep it implicit. Why document yourself out of a job when the organization has shown no interest in the alternative?

This is why the distributed monolith persists even when everyone knows it's painful. The pain is distributed across the entire team. The benefit of complexity is concentrated in the few who understand it. The few who could simplify it have the least incentive to do so.

---

## Four Incidents, One Missing Graph

In four days, a single platform team hit three incidents. A fourth followed the same week — different shape, same root cause. Different symptoms. Different blast radii. **The deployment tooling has no dependency graph across releases.**

### Incident 1: Policy blocks a resource from a different stack (Day 1)

The gateway stack deployed controllers that create `Gateway` CRs. The controllers tried to instantiate data-plane proxy Services with `type: LoadBalancer`. An OPA Gatekeeper constraint — deployed by the security stack, owned by a different team, on a different deploy cycle — denied the Service creation. The controllers entered an infinite retry loop. CI said green. Flux said green. The cluster spent hours with controllers retrying every 10 seconds.

**The missing edge:** `Gateway CR` → creates → `Service (LoadBalancer)` → requires → `OPA exception (loadbalancerconstraint)`.

With a DAG: "Deploying this Gateway will create a LoadBalancer Service. The cluster's admission policy denies LoadBalancer Services unless whitelisted. No whitelist entry exists for this namespace. **Deployment will fail.**"

### Incident 2: Helm deletes a CRD that another stack depends on (Day 3)

The gateway stack replaced `legacy-gateway-crds` with `new-gateway-crds`. The old chart bundled `ratelimitconfigs.ratelimit.solo.io` — a CRD consumed by NetOp in the networking stack. Helm deleted the CRD as part of the subchart removal. NetOp crashed on its next pod restart, 24 hours later. Two rings affected.

**The missing edge:** `legacy-gateway-crds` → provides → `ratelimitconfigs.ratelimit.solo.io` CRD → consumed by → `network-operator` (networking stack).

With a DAG: "Removing `legacy-gateway-crds` will delete the `ratelimitconfigs.ratelimit.solo.io` CRD. This CRD is watched by `network-operator` in namespace `platform-runtime`. **Deletion will crash NetOp on next restart.** Co-owner `gloo-ee` also provides this CRD but won't recreate it until its next reconcile."

### Incident 3: Two controllers overwrite each other's fields on the same CR (Day 4)

A deployment controller added two fields to a shared CRD. A network controller — watching the same CR for a different purpose — performed a full-object `Update()` (an HTTP `PUT`, which replaces the whole object) on every reconcile cycle, using a typed struct that didn't include the new fields, so they marshaled as absent and were erased. No error. No log. Most instances of the resource had `null` for both fields. *(This is [Part 6](/articles/k8s-cr-shared-mutable-state/) in miniature; the PUT-strips-fields mechanism and its SSA fix are reproduced live in [Verify It Yourself §"Update() Is an HTTP PUT"](/articles/k8s-verify-it-yourself/#part-6--update-is-an-http-put-it-silently-strips-fields-it-doesnt-know).)*

**The missing edge:** `Deployment Controller` → writes → `ApplicationDeployment.spec` ← writes ← `network operator` (via shared library `Update()`).

With a DAG: "Two controllers write to `ApplicationDeployment.spec`. DC's struct includes `timers` and `entityConfigurations`. NetOp's struct does not. NetOp uses full-object `Update()`, not SSA. **NetOp will erase DC's fields on every reconcile.** Deploy NetOp's struct update before DC's field addition, or switch NetOp to status-only writes."

### Incident 4: Health checks report stale status from a dead controller (Day 8+)

A different team upgraded the cluster's Terraform controller — the component that reconciles infrastructure-as-code resources — from an early release candidate to the next stable version on a production ring. The new version had a kstatus regression: it set `Reconciling: True` on every Terraform custom resource it touched, then never cleared the condition. Nine hours later, the team reverted. The revert performed a Helm fresh-install of the old version. The old controller came back up. But the `Reconciling: True` conditions — set by the briefly-running new version — persisted on the custom resources. The old controller didn't know to clear conditions it hadn't set.

From this point, every Flux Kustomization health check on every Terraform resource timed out. Every ten minutes, the health check polled the resource, saw `Reconciling: True`, interpreted it as "in progress" via kstatus, waited for the timeout, and marked the Kustomization as `Unknown`. Downstream Kustomizations that depended on the Terraform stack saw `DependencyNotReady` and stalled. Alerts fired — well over a hundred of them. The team noticed after five days. A senior engineer initially dismissed them: "I've seen those warnings before in that ring, they happen sometimes during deployments. Eventually they go away."

They didn't go away. After five days of investigation, the team identified the stale condition, prepared a fix script (suspend and resume each Terraform resource to force the controller to reset conditions), and submitted an RFC for the production ring. The RFC was approved. A different engineer executed the script across all six environments.

The stale conditions didn't clear.

Two days later, someone finally ran `kubectl get pods` on the Terraform controller deployment. The pods were in `ImagePullBackOff`. The controller wasn't running. It hadn't been running for an unknown duration — possibly since the revert, possibly due to a separate image registry issue that emerged afterward. Nobody knew, because nobody had checked. The HelmRelease said `Ready: True` — Helm had applied the manifests successfully. The Kustomization health checks said `Unknown` — the resources were "in progress." Neither tool checked whether the controller pod was alive.

The team had spent three days preparing, approving, and executing a fix that required a running controller to take effect. The suspend/resume patches were applied to the cluster's API server. The API server accepted them. Nothing happened, because no controller existed to watch for the spec changes and act on them. The fix was a no-op against a corpse.

The infrastructure team — a separate team responsible for the controller's image and deployment — confirmed it was a known ongoing incident affecting all environments in the ring. A fix was already in progress. But the platform team had no way to know this. No alert existed for "controller pod not running." The HelmRelease didn't check pod health. The Kustomization health check didn't check controller liveness. The alerts — all of them — said the same thing — "Terraform resource reconciliation in progress" — whether the controller was alive and working, alive and stuck, or dead.

**The missing edge:** `Kustomization health check` → evaluates → `Terraform CR .status.conditions` → managed by → `tofu-controller pod` → requires → `container image pull` → requires → `registry image availability`.

With a DAG: "The health status of Terraform CRs depends on a running tofu-controller. The controller's pod cannot start (ImagePullBackOff). **All Terraform CR status conditions are stale. Health checks are reporting cached state from a dead controller. Any fix that requires the controller to act — including suspend/resume — will be a no-op.**"

**What makes this incident different from the other three:**

The first three incidents are about missing edges *between stacks* — one stack's change breaks another stack's resource. This incident is about a missing edge *within the reconciliation machinery itself.* The tool that checks whether resources are healthy has no way to check whether the thing that *makes* resources healthy is running. The health check is downstream of the controller, but it doesn't model that dependency. It checks the patient's chart without checking whether the doctor is in the building.

### The graph that doesn't exist

Four incidents. Four different failure modes. One pattern:

| Incident | Shared state | Writer A | Writer B | What the DAG would show |
|---|---|---|---|---|
| Gatekeeper block | Admission chain | Gateway stack (creates Services) | Security stack (defines constraints) | "This resource will be denied by that policy" |
| CRD deletion | Cluster CRD registry | Gateway stack (removes subchart) | Networking stack (controller watches CRD) | "Deleting this chart will remove a CRD that controller depends on" |
| Field stripping | CR `.spec` | Deployment Controller (adds fields) | NetOp (overwrites entire spec) | "These two controllers have incompatible write patterns on the same object" |
| Stale health from dead controller | CR `.status.conditions` | Kustomization health check (reads conditions) | tofu-controller (should write conditions, but is dead) | "Health status depends on a running controller; controller is not running" |

### What Terraform and CloudFormation do instead

Try deleting a VPC that has subnets in Terraform:

```
$ terraform plan -destroy -target=aws_vpc.main

Error: aws_subnet.private still depends on aws_vpc.main
  Delete aws_subnet.private first, or remove both.
```

It won't let you. The DAG knows that `aws_subnet.private` references `aws_vpc.main.id`. Deleting the VPC without deleting the subnet first would orphan the subnet — so Terraform refuses. It doesn't delete the VPC and hope the subnet figures it out eventually. It doesn't delete the VPC and let the subnet crash at runtime. It tells you, at plan time, before any mutation, that the operation is unsafe.

CloudFormation does the same thing. Try deleting a stack that exports a value consumed by another stack:

```
DELETE_FAILED: Export networking-stack:VpcId is referenced by stack gateway-stack.
Cannot delete export in use.
```

The stack won't delete. CloudFormation's cross-stack references are explicit — `Fn::ImportValue` creates a dependency edge. The DAG knows that `gateway-stack` depends on an export from `networking-stack`. Deleting the exporter while the importer exists is not allowed. Not "allowed but risky." Not "allowed with a warning." **Not allowed.**

This is what predictable infrastructure looks like. The DAG is not a visualization tool or a debugging aid. It's an **enforcement mechanism.** You can't create a circular dependency. You can't delete a resource that has dependents. You can't modify a resource's type without Terraform showing you the cascade of destroy-and-recreate that follows. Every destructive operation is previewed, validated, and either approved or blocked — before it touches the real infrastructure.

Now compare what Helm did in Incident 2:

```
$ helm upgrade gateway-stack ./chart
  # Old subchart legacy-gateway-crds removed from Chart.yaml
  # New subchart new-gateway-crds added

Release "gateway-stack" has been upgraded. Happy Helming!
```

Happy Helming. Helm deleted the `ratelimitconfigs.ratelimit.solo.io` CRD because it was part of the removed subchart. It didn't check whether any other release on the cluster references that CRD. It didn't check whether any controller watches that GVK. It didn't check whether any custom resources of that type exist. It deleted the CRD and reported success. The NetOp controller in a different namespace, deployed by a different release, managed by a different team, crashed 24 hours later.

Terraform would never do this. If a CRD were a Terraform resource with dependents — controllers that reference its GVK, custom resources of its type — `terraform plan` would show:

```
# module.networking.kubernetes_manifest.ratelimitconfig_crd will be destroyed
  - resource "kubernetes_manifest" "ratelimitconfig_crd" {
      - apiVersion = "apiextensions.k8s.io/v1"
      - kind       = "CustomResourceDefinition"
      - name       = "ratelimitconfigs.ratelimit.solo.io"
    }

Error: module.networking.kubernetes_manifest.netop_ratelimit_cr depends on
       module.gateway.kubernetes_manifest.ratelimitconfig_crd

  Cannot destroy ratelimitconfig_crd while netop_ratelimit_cr exists.
  Remove or update the dependent resource first.
```

The operation would be blocked. Not "allowed but eventually consistent." Blocked. The CRD stays. The controller doesn't crash. The incident doesn't happen.

The same applies to every incident in the table above. CloudFormation won't let you delete a security group that a load balancer references. Terraform won't let you destroy an IAM role that a Lambda function depends on. Both tools encode dependencies as **hard edges in a DAG** — not as runtime discovery, not as eventual consistency, not as tribal knowledge. The graph is the source of truth. If the graph says A depends on B, you can't delete B without addressing A first. Period.

### Why Helm, Flux, and controller-runtime can't do this

Helm has a per-release inventory — a flat list of resources this release created. It doesn't know what other releases depend on. It doesn't know that deleting a CRD will crash a controller in a different namespace. It doesn't know that two releases installed the same cluster-scoped resource. Each release is an island.

Flux has `dependsOn` between Kustomizations — but it only controls ordering, not dependency validation. A Kustomization can depend on another Kustomization and still break it by deleting a resource the other needs. `dependsOn` means "wait for this to be ready before starting." It doesn't mean "if this changes, check that I'm still valid." It's a sequencing hint, not a dependency edge. Flux health checks evaluate resource status conditions via kstatus — but kstatus reads the resource's own `.status`, not the controller that manages it. A resource can report `Reconciling: True` forever — whether the controller is alive and working, alive and stuck, or dead. The health check has no way to distinguish these states. It polls the patient's chart without checking whether the doctor is in the building.

Controller-runtime has no graph between controllers. Each controller watches its own set of GVKs and reconciles independently. There's no mechanism to declare "I depend on this CRD existing" or "I write to these fields on this CR and no one else should." Field managers (SSA) partition writes — but only when both controllers opt in, and they say nothing about CRD existence or schema compatibility.

The Kubernetes ecosystem has **three partial inventories** (Helm release manifests, Flux Kustomization inventories, controller-runtime informer caches) and **zero cross-inventory dependency graph.** Each tool knows what it owns. None of them know what depends on what it owns. The dependency information exists — in the cluster's runtime state, in controller source code, in CRD schemas, in admission webhook configurations. But no tool assembles it into a graph that can be queried at plan time.

### The unasked question

This is not an unsolvable problem. It's an **unasked question.**

Terraform proves that a dependency graph can be built, queried, and enforced before any mutation — for infrastructure far more complex than a Kubernetes cluster. CloudFormation proves that cross-stack dependency validation works at scale across hundreds of stacks. Both have done this for over a decade.

The Kubernetes ecosystem doesn't lack the technology. It lacks the demand. The community accepted eventual consistency as the cost of declarative infrastructure and never asked for the alternative. The engineers who could demand it are the ones who carry the graph in their heads — the ones who trace CRD ownership by reading Helm labels, who know which controllers watch which GVKs by reading Go source code, who know which OPA policies block which Services by remembering the last incident. The graph exists. It's just stored in tribal knowledge instead of in a tool.

The difference between Terraform and Helm is not sophistication. It's **what the tool considers its responsibility.** Terraform considers it responsible for knowing what depends on what — across modules, across providers, across state files. Helm considers itself responsible for one release at a time. The CRD that Helm deleted belonged to Helm's release. That it also belonged to the cluster's operational reality — that controllers depended on it, that custom resources referenced it, that deleting it would cascade into a multi-ring incident — was someone else's problem. And "someone else" was a human carrying a mental DAG that no tool ever asked them to externalize.

---

## Practical Steps (If You Can't Reorg)

You probably can't redraw every boundary tomorrow. Here's what you can do:

**1. Make cross-repo dependencies explicit.** If your stack needs an OPA exception, declare it in your repo — even if it's just a comment or a README. When the dependency breaks, you'll know where to look.

**2. Build a deployment status aggregator.** One dashboard that shows, for each domain: OCI artifact version, Kustomization applied revision, HelmRelease status, controller pod health, and policy compliance. Stop making humans assemble this from six `kubectl` commands.

**3. Push exceptions to the domain.** Instead of PRing the OPA repo for a whitelist entry, define a mechanism for domains to declare their own exceptions (with policy team approval). The exception data lives with the domain; the enforcement stays centralized.

**4. Test cross-repo invariants in CI.** If your Gateway requires an OPA exception and a Calico allow rule, write a test that validates all three exist. Run it in your stack's CI. Catch the breakage before it reaches the cluster.

**5. Reduce reconciliation layers.** Every layer between "code pushed" and "resource applied" is a place where eventual consistency can stall. If you can eliminate one Kustomization, one polling interval, or one dependency chain, do it.

**6. Monitor controller liveness independently from resource health.** Flux health checks tell you whether a resource's conditions look healthy. They don't tell you whether anything is driving those conditions. Add deployment availability alerts for every controller in `flux-system`. If available replicas = 0 for more than five minutes, page someone — don't wait for a human to run `kubectl get pods` eight days later.

**7. Name the distributed monolith.** The most powerful thing you can do is call it what it is. Once the team sees the five-repo, three-team, six-layer deploy for what it is — a monolith wearing a microservices costume — the conversation changes from "how do we fix this deploy" to "how do we fix these boundaries."

---

## The Core Problem

The Kubernetes ecosystem taught us to think about infrastructure in terms of resources: Deployments, Services, ConfigMaps, Policies, NetworkPolicies. Each resource type gets a controller, a CRD, a repo, a team.

Domain-Driven Design taught us to think about software in terms of capabilities: what does the system *do*, and what does each piece need to function end-to-end?

When you organize by resource type, you get clean repos and broken deploys. When you organize by capability, you get messy repos and working systems.

The sysadmin looks at a gateway and sees: a Deployment, a Service, a NetworkPolicy, an OPA constraint, a DNS record. Five things. Five places to put them.

The software engineer looks at the same gateway and sees: one bounded context with one aggregate root and five invariants that must be satisfied simultaneously. One thing. One place to deploy it.

The gap between these two views is where partial failures live — invisible, indefinite, and discoverable only by accident.

---

### Series: Why Kubernetes Infrastructure Rots

- **Part 1: [The Operator Mindset](/articles/k8s-operator-mindset-vs-domain-modeling/)** — Why one domain becomes six repositories. The repo-per-problem anti-pattern as a consequence of thinking in procedures instead of models.

- **Part 2: [The Cargo Cult](/articles/k8s-cargo-cult-centralization/)** — Why shared repos and better tools don't fix it. The failed abstraction phase.

- **Part 3: [The Abstraction Instinct](/articles/k8s-abstraction-instinct/)** — What no tool can provide. CDK in the hands of an operator is still operator thinking.

- **Part 4: [The Distributed Monolith](/articles/k8s-gitops-distributed-monolith/)** — Why your GitOps is a monolith wearing a microservices costume. Five repos, five teams, zero transactional boundary, and six incidents in four weeks. *(this article)*

- **Part 5: [The Staging Mindset](/articles/k8s-staging-mindset-kills-migration/)** — Routing is atomic. Deployment is not. Why feature flags are what happens when the infrastructure can't express version coexistence.

- **Part 6: [The Shared Mutable State](/articles/k8s-cr-shared-mutable-state/)** — The CR is a database table with no foreign keys, shared between controllers with no ownership model. Silent data loss as a design consequence.

- **Aside: [Operator Stockholm Syndrome](/articles/k8s-operator-stockholm-syndrome/)** — When the K8s control plane becomes the universe. Routing every cloud API through a cluster CR even when the cluster has no semantic role.

- **Aside: [The Cron and the Gate](/articles/k8s-cron-and-gate/)** — When the operator models itself instead of the domain. One `Reconcile()` hook, triggered identically by create/resync/requeue, becomes the only place policy can live.

- **Aside: [The Configuration Problem](/articles/k8s-tribal-knowledge/)** — One business rule sliced across Helm, ConfigMap, Flux substitution, and Calico's dataplane — zero cohesion, load-bearing tribal knowledge.

- **Aside: [The Auto-Approve](/articles/k8s-auto-approve-swallows-the-gate/)** — When the reconcile loop swallows `terraform plan`. Wrapping a tool with a human-in-the-loop gate in a loop that structurally can't hold one.

- **Aside: [You Can't Front-Run the Composition Gap](/articles/k8s-front-run-composition-gap/)** — Why correct first-principles reasoning must crash once before it can diagnose.

- **Lab: [Verify It Yourself](/articles/k8s-verify-it-yourself/)** — Copy-pasteable, real-output reproductions of every cluster mechanism the series cites (foreign keys, CEL scope, ownerRefs, SSA, PUT-strips-fields, resourceVersion, CRD versioning, kstatus).

- **Synthesis: [The Thermostat That Ate Infrastructure](/articles/k8s-thermostat-not-a-deployment-engine/)** — How a container self-healing pattern became a deployment engine. The missing DAG from node boot to infrastructure blue/green.
