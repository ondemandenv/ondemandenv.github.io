---
layout: article
title: "The Operator Mindset: Why One Domain Becomes Six Repositories"
description: "Part 1 of \"Why Kubernetes Infrastructure Rots.\" How the operator mindset fragments a single domain into six CRDs in six repos — and why the mechanism that lets it rot silently is written into the API server itself: etcd has no foreign keys, and admission runs one object at a time."
permalink: /articles/k8s-operator-mindset-vs-domain-modeling/
date: 2026-07-10
author: "Gary Yang"
tags: ["kubernetes", "operators", "domain-driven-design", "infrastructure", "distributed-systems", "platform-engineering"]
---

# The Operator Mindset: Why One Domain Becomes Six Repositories

*A platform team owns a domain — say, tenant network policy across regions, tiers, and compliance variants. Eighteen months later that one domain is six CRDs in six repos, each with its own controller, its own config schema, and no `ownerReference` linking any of them. Making a cross-cutting change means six PRs and a deploy order held in someone's head. The problem isn't the people. It's that the Kubernetes ecosystem systematically selects for a way of thinking that produces this — and the mechanism that lets it rot silently is written into the API server itself: etcd has no foreign keys, and admission runs one object at a time.*

*This is Part 1 of the series "Why Kubernetes Infrastructure Rots." Each part takes one facet of the same structural problem and grounds it in a mechanism you can verify on any cluster with `kubectl`.*

---

## Two Responses to the Same Problem

A team needs to manage a network-policy domain: rule sets that apply across multiple regions, four environment tiers, and three compliance variants (commercial, FedRAMP, a product-specific one). The natural Kubernetes expression is a Custom Resource — a `NetworkRuleSet` CRD — reconciled by a controller that programs the actual dataplane (Calico `GlobalNetworkPolicy`, a cloud WAF, whatever the enforcement point is).

**The operator response:** Define a `NetworkRuleSet` CRD. Write a controller. When the FedRAMP variant needs different rules, copy the repo, tweak the CRD's defaults, ship a second controller. When CloudFront-scoped rules need different handling from cluster-ingress rules, copy again. Repeat per compliance variant. Each repo has its own CRD `spec`, its own reconciler, its own Helm chart.

Result: six CRDs that are 90% the same schema, six controllers that are 70% the same reconcile logic, cross-CRD dependencies expressed only as **string fields** that happen to hold another CR's name, and no CI that catches breakage across them because each controller's unit tests run against a fake client that only knows its own types.

**The software-engineer response:** Identify the domain. Network-rule management has rule sets, IP sets, a policy that binds them, and compliance variants. Model these as *one* API — one CRD group with a few kinds, or one kind parameterized by scope/regime/tier — reconciled by one controller. One repo, one reconcile loop, N `NetworkRuleSet` objects.

Both engineers are competent. Both are solving the same problem. The difference isn't skill — it's **mental model**. And the reason the first model rots while the second doesn't is not aesthetic; it's that the API server enforces nothing across the six-repo split, as we'll see.

---

## The Two Mental Models

Throughout this series "operator" means the ops-heritage infrastructure engineer, and "software engineer" means the engineer who approaches problems through domain modeling and type systems. These aren't job titles — they're cognitive orientations.

| Dimension | Operator Mindset | Software Engineer Mindset |
|-----------|-----------------|---------------------------|
| **Unit of work** | Runbook / procedure (now: a controller per task) | Domain model / API |
| **Reuse mechanism** | Copy the repo, tweak the CRD | One CRD, more cases in one reconciler |
| **Response to new requirement** | New CRD, new controller | New field/variant in existing model |
| **Success metric** | "It reconciled and nothing crashed" | "The invariants are enforced by the API" |
| **Complexity response** | More CRDs, more controllers, more conditionals | Fewer kinds, better schema, CEL rules |
| **Failure response** | Add a step to the reconciler | Change the schema so the failure can't be submitted |

Neither is wrong in isolation. Operators excel at getting a controller running. Software engineers excel at keeping a system correct as it grows. The problem is that the Kubernetes ecosystem almost exclusively rewards the first and gives the second almost no leverage — because the primitives that *would* enforce cross-object correctness (foreign keys, multi-object transactions) don't exist in the API server.

---

## How the K8s Ecosystem Selects for Operators

Platform teams sit between infrastructure vendors and application teams. They're typically ops-background engineers who graduated from Ansible/Chef/Puppet into Kubernetes. The job postings said "Kubernetes experience," not "domain-modeling experience." The interview asked "how would you deploy X," not "how would you model X."

The tools reinforce it. Helm is a text templating engine that renders strings *before* the API server ever sees a typed object — so no schema, no validation, no CEL rule applies to an interpolated value. Kustomize patches YAML with more YAML. Flux and Argo reconcile directory trees. `kubebuilder` scaffolds one CRD + one controller per `create api` invocation, and the path of least resistance is exactly that: one more kind, one more reconciler. The tooling's gradient points at fragmentation, and the API server won't push back — because, as the next section shows, it *can't*.

---

## Why the Fragmentation Rots Silently: Three Missing Mechanisms

The operator's six repos aren't just aesthetically redundant. They rot because three things a senior engineer would expect to catch the drift **do not exist at the layer the split lives in.**

**1. etcd has no foreign keys.** A `FMSPolicy` that references a `NetworkRuleSet` by name holds that reference as a plain `string`. There is no referential-integrity constraint in etcd — no `ON DELETE RESTRICT`, no cascade. Delete the rule set and the policy keeps its dangling string; nothing at the storage layer objects. No schema construct anywhere says "this string must name an existing object of kind X." The invariant "the rule set must exist before the policy references it" is real, and the platform stores it nowhere. *(Reproduced live: [Verify It Yourself §"etcd Has No Foreign Keys"](/articles/k8s-verify-it-yourself/#part-1--etcd-has-no-foreign-keys).)*

**2. Admission validates one object, against one snapshot.** The instinct is "a webhook will catch the dangling reference." It can't, cheaply or reliably. A `ValidatingAdmissionWebhook` (and its CEL cousin, `ValidatingAdmissionPolicy`) is invoked with **the single object under admission**. CEL `x-kubernetes-validations` can enforce plenty *within* one object (`spec.max >= spec.min`, enums, immutability) but has no lookup for another object — its scope is `self` and `oldSelf`, nothing else. A webhook *could* reach back and read another object mid-admission, but that read isn't transactional with the write (the target can vanish a millisecond later), so it's a race, not a guarantee. The object boundary is exactly where cross-CR fragmentation hides. *(Reproduced live — intra-object rule rejects, cross-object dangling ref is accepted: [Verify It Yourself §"CEL Validates Inside One Object"](/articles/k8s-verify-it-yourself/#part-1--cel-validates-inside-one-object-not-across-objects).)*

**3. Nothing couples the CRs' lifecycles.** Within one controller you tie sub-resources together with `ownerReferences` (`controller: true`), and the garbage collector cascades deletes. Across six independently-owned CRDs there are no owner references between the *kinds* — each controller sets owner refs only on the leaf resources it creates. So the API server enforces no lifecycle relationship between the rule set in repo A and the policy in repo B; they can be created and deleted in any order, and the cluster happily holds an inconsistent set. The fragmentation persists because nothing in the control plane is empowered to notice it. *(Reproduced live — orphaned CR survives a parent delete, while an owner-ref'd child is GC'd: [Verify It Yourself §"No Cross-CRD ownerReference"](/articles/k8s-verify-it-yourself/#part-1--nothing-couples-two-crds-lifecycles-no-cross-crd-ownerreference).)*

Put together: the operator model distributes one domain across N CRDs, and the API server offers no foreign key, no cross-object admission, and no cross-CRD ownership to hold the pieces consistent. Correctness moves out of the platform and into tribal knowledge — "apply the rule set before the policy," "don't delete the base set, three policies point at it." That's not a discipline problem. It's the predictable result of asking a key-value store with per-object admission to enforce a relational invariant it has no primitive for.

---

## What Rot Looks Like

**Month 1:** One CRD, one controller, one repo. Clean.

**Month 6:** Three variants needed. Three repos, each a copy with tweaked CRD defaults. Still manageable.

**Month 12:** Cross-cutting change — say, a new required field in the shared rule schema. Now it's PRs to six CRD definitions, six controllers redeployed, and a rollout order (rule sets before policies) that only works if a human sequences it, because — see above — nothing enforces the order.

**Month 18:** A new hire runs `kubectl get crds | grep networkrule` and finds six kinds. "Why six?" Nobody has a good answer. The schemas have diverged — one uses `enabled: bool`, another `state: enum`, a third an annotation. The reconcilers handle the same AWS/Calico calls with three different error-handling styles. They're 70% identical and 30% subtly different in ways that matter at 3 a.m.

This is the **complexity death spiral**: each new requirement is locally cheap (`kubebuilder create api`, tweak, ship) and globally expensive (more schema surface, more implicit coupling the API server won't track, more coordination the platform won't enforce).

---

## The Repo-Per-Problem Anti-Pattern

It always starts the same way. A team ships a `NetworkRuleSet` CRD. Clean, done in a week. Then someone needs an `FMSPolicy` kind that references those rule sets. The rule-set repo is "done" — nobody wants to touch a working controller. New repo. Then CloudFront-scoped rules need different handling. New repo. Then FedRAMP: fork. Then product variants: fork again.

Eighteen months later:

```
$ kubectl get crds | grep -E 'ruleset|policy'
networkrulesets.net.example.com              # regional rule sets
fmspolicies.net.example.com                  # regional binding policies
fmspolicies-global.net.example.com           # CloudFront-scoped, forked kind
networkrulesets-fedramp.net.example.com      # FedRAMP fork
fmspolicies-saas.net.example.com             # product variant A
fmspolicies-freetier.net.example.com         # product variant B
```

Six kinds. One domain. Every `kubebuilder create api` was locally rational:

| Decision | Local Rationale | Global Cost (and the missing mechanism) |
|----------|----------------|-----------------------------------------|
| Split rule sets from binding policies | "Different reconcile cadence" | Cross-CR dependency stored as an unchecked `string`; no foreign key |
| New kind for global scope | "CloudFront rules differ from ingress rules" | Same schema, one scope field would have done it; now two CRDs drift independently |
| Fork for FedRAMP | "Different account, different approvals" | 90% identical schema, no shared source of truth; a fix lands in one, not the other |
| Skeleton kinds for variants | "We'll need them" | Empty CRDs claiming API surface; `kubectl` now lies about how many things exist |

Each decision optimized for **isolation** — the operator's primary value. But infrastructure at scale isn't a collection of independent procedures. It's a **system with invariants that span components**, and — this is the whole point — the components live in a control plane that has no way to enforce a spanning invariant. The invariants exist whether you model them or not; the only question is whether they're enforced by a schema or remembered by a person.

---

## The Anatomy: How to Spot It on a Cluster

Three signals, each checkable in one command (transcripts in [Verify It Yourself](/articles/k8s-verify-it-yourself/)):

- **N controllers, one domain.** A cluster of controller-managers whose reconcilers do structurally the same thing — create a cloud resource, write status, requeue. N near-identical reconcile loops are N copies of one deployment domain.
- **Schemas that disagree on the same concept.** One kind models the same idea as `spec.enabled: bool`, another as `spec.state: enum` — because each was scaffolded in isolation, with no shared type. Across six repos there *couldn't* be one, absent a shared Go module nobody set up.
- **Cross-CR references that are just strings.** `kubectl explain <kind>.spec.<ref>` returns `<string>` with no admission policy asserting existence. Rename the target in one repo and the other's reconciler logs `NotFound` on the next requeue — at runtime, not at submit time.

---

## The Same Pattern in GitOps Stacks

This isn't unique to controllers. Teams using Flux or Argo commonly have a repo per infrastructure stack — networking, observability, security. Each follows the same Helm-chart skeleton with its own override template: Go-template conditionals that branch on cluster tier, type, and region. The same `resolve(tier, clusterType, region) → config` function reimplemented from scratch in every stack, with its own bugs, because Helm has no way to share a *typed* function — only copied text.

The GitOps controller treats each stack as an opaque `Kustomization`/`HelmRelease`: it reconciles the directory to `Ready`, but it has no view *inside* the box and no notion that two stacks share a concept. So there is zero pressure to share abstractions — the reconciler rewards "it went Ready," not "it stayed modeled." (Part 4 shows what happens when those opaque boxes acquire ordering dependencies on each other.)

---

## The DDD Lens: Bounded Context vs Deployment Unit

The repo-per-problem anti-pattern conflates two things DDD keeps separate:

**Bounded Context**: a boundary within which a model is consistent. "Rule set" means the same thing whether regional or global, commercial or FedRAMP.

**Deployment Unit**: an independently deployable/roll-out-able artifact. You might roll regional and global out on different schedules, to different accounts, behind different approval gates.

The operator mindset equates them: different rollout ⇒ different CRD ⇒ different thing. The software-engineer mindset separates them: *same* CRD and controller, *different* CRs and rollout configs. One bounded context can produce many deployment units — the same codebase reconciling many objects across many rings. The six-repo cluster is one bounded context wearing six costumes; the team never drew the context map, and the API server — having no concept of a context map — never made them.

---

## How to Diagnose This in Your Organization

- **How many controllers share a reconcile shape?** N controllers doing structurally identical CRUD-against-a-cloud-API + status-write are N copies of one domain.
- **Can you make a cross-cutting change in one PR?** If a schema tweak requires PRs to multiple CRDs and a hand-sequenced rollout, those CRDs are one bounded context pretending otherwise — and the reason nobody merged them is that nothing forced the question.
- **Does anyone own the domain, or just the kinds?** "Team A owns the rule-set CRD, Team B owns the policy CRD" means you organized by artifact, not by domain — and the API server's lack of cross-CRD ownership let you.

---

## What Comes Next

This fragmentation is Stage 1 of infrastructure rot. When teams notice it, they try to fix it — shared script repos, monolithic config files, governance-by-directory. These cargo-cult software-engineering patterns without the domain modeling underneath, and the toolchain fights the abstractions that would actually help.

**Next — [Part 2: The Cargo Cult](/articles/k8s-cargo-cult-centralization/).** The failed-abstraction phase meets the tooling wall.

---

### Series: Why Kubernetes Infrastructure Rots

- **Part 1: [The Operator Mindset](/articles/k8s-operator-mindset-vs-domain-modeling/)** — Why one domain becomes six repositories. The repo-per-problem anti-pattern as a consequence of thinking in procedures instead of models. *(this article)*

- **Part 2: [The Cargo Cult](/articles/k8s-cargo-cult-centralization/)** — Why shared repos and better tools don't fix it. The failed abstraction phase.

- **Part 3: [The Abstraction Instinct](/articles/k8s-abstraction-instinct/)** — What no tool can provide. CDK in the hands of an operator is still operator thinking.

- **Part 4: [The Distributed Monolith](/articles/k8s-gitops-distributed-monolith/)** — Why your GitOps is a monolith wearing a microservices costume. Five repos, five teams, zero transactional boundary, and six incidents in four weeks.

- **Part 5: [The Staging Mindset](/articles/k8s-staging-mindset-kills-migration/)** — Routing is atomic. Deployment is not. Why feature flags are what happens when the infrastructure can't express version coexistence.

- **Part 6: [The Shared Mutable State](/articles/k8s-cr-shared-mutable-state/)** — The CR is a database table with no foreign keys, shared between controllers with no ownership model. Silent data loss as a design consequence.

- **Aside: [Operator Stockholm Syndrome](/articles/k8s-operator-stockholm-syndrome/)** — When the K8s control plane becomes the universe. Routing every cloud API through a cluster CR even when the cluster has no semantic role.

- **Aside: [The Cron and the Gate](/articles/k8s-cron-and-gate/)** — When the operator models itself instead of the domain. One `Reconcile()` hook, triggered identically by create/resync/requeue, becomes the only place policy can live.

- **Aside: [The Configuration Problem](/articles/k8s-tribal-knowledge/)** — One business rule sliced across Helm, ConfigMap, Flux substitution, and Calico's dataplane — zero cohesion, load-bearing tribal knowledge.

- **Aside: [The Auto-Approve](/articles/k8s-auto-approve-swallows-the-gate/)** — When the reconcile loop swallows `terraform plan`. Wrapping a tool with a human-in-the-loop gate in a loop that structurally can't hold one.

- **Aside: [You Can't Front-Run the Composition Gap](/articles/k8s-front-run-composition-gap/)** — Why correct first-principles reasoning must crash once before it can diagnose.

- **Lab: [Verify It Yourself](/articles/k8s-verify-it-yourself/)** — Copy-pasteable, real-output reproductions of every cluster mechanism the series cites (foreign keys, CEL scope, ownerRefs, SSA, PUT-strips-fields, resourceVersion, CRD versioning, kstatus).

- **Synthesis: [The Thermostat That Ate Infrastructure](/articles/k8s-thermostat-not-a-deployment-engine/)** — How a container self-healing pattern became a deployment engine. The missing DAG from node boot to infrastructure blue/green.
