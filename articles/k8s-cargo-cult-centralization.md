---
layout: article
title: "Why Neither Shared Repos Nor Better Tools Fix Infrastructure Rot"
description: "Parts 2–3 of \"Why Kubernetes Infrastructure Rots.\" Someone notices the fragmentation and builds a shared-scripts repo, or reaches for CDK. Both fail — one centralizes data without modeling it, the other hands abstraction tools to people who don't think in abstractions."
permalink: /articles/k8s-cargo-cult-centralization/
date: 2026-07-10
author: "Gary Yang"
tags: ["kubernetes", "infrastructure", "abstraction", "platform-engineering", "distributed-systems"]
---

# Why Neither Shared Repos Nor Better Tools Fix Infrastructure Rot

*The fragmentation is obvious. Six repos for one domain. So someone creates a "shared scripts" repo. Someone else suggests CDK. Neither works — because one centralizes data without modeling it, and the other provides abstraction capabilities to people who don't think in abstractions.*

---

## The Three Stages of Infrastructure Rot

Every large Kubernetes platform I've examined follows the same trajectory:

**Stage 1: Copy-paste fragmentation.** One domain, N repos. Deploy scripts copied and tweaked. Dependencies implicit. (Covered in Part 1.)

**Stage 2: Failed abstraction.** Someone notices the fragmentation. They create "shared" repos — shell script libraries, centralized registries, governance directories. The fragmentation gets worse, not better.

**Stage 3: Resignation.** The shared repos become yet another layer to maintain. Teams route around them. New fragments appear. The cycle restarts.

---

## Why Stage 2 Feels Like the Right Move

The operator who creates a "shared scripts" repo is responding to real pain. The diagnosis is accurate. The treatment is what goes wrong.

A software engineer hearing "I've fixed this deploy bug in three repos now" would ask: *What's the domain model? What are the aggregates? What invariants need enforcement?*

An operator hearing the same complaint asks: *Where should I put the shared files?*

The operator centralizes **data and scripts.** The software engineer centralizes **domain logic and contracts.** The difference determines everything.

---

## Case Study 1: The Shell Script Library

**The pain:** Every GitOps stack needs a local k3d cluster for development. Each repo has its own `start-cluster.sh` installing the same components. Version changes require updating every repo.

**The fix:** A shared scripts repo consumed via git submodule. A `lib/` directory of bash functions, a `components/` directory of YAML files, consumed by `source lib/_config_parser.sh` in each repo.

**Why it's cargo-cult:** It *looks* like a library — `lib/` directory, config file, modular components. But there's no versioning (consumers get HEAD of main), no interface contract (functions discovered by reading source), no dependency resolution (component ordering encoded in script execution order, not in a model), and no tests. A breaking change in a shared function breaks every consumer simultaneously with no deprecation path.

A software engineer would publish a versioned CLI tool to an internal package registry — pinned versions, typed configuration, dependency resolution built in. The key difference isn't language. It's that the software engineer's version models the domain (components have dependencies, versions have compatibility constraints) while the operator's version models the procedure (run these scripts in this order).

---

## Case Study 2: The Monolithic Registry

**The pain:** Teams pull third-party container images from dozens of upstream registries. Images need security scanning before production. Every team manages their own list.

**The fix:** A single repo with one sprawling JSON file that every team edits — a flat array of `{source_registry, source_image, tag, target_registry}` entries. Python scripts check for new entries, pull images, scan them, push to internal registry.

**Why it's cargo-cult:** Centralized data, no domain model. There's no concept of who owns an image, what depends on it, when it was last verified, or what happens if it's removed. Every team edits one file — the worst possible merge conflict surface. Images are added but never removed; the file grows monotonically. Each Python script re-parses the flat JSON independently; there's no shared model of what an "image source" is.

A software engineer would model `ImageSource` as an aggregate root with owner, scan policy, version lifecycle, and consumer dependencies. Each team manages their own sources file. A shared pipeline enforces invariants. Centralize the policy; distribute the data.

---

## Case Study 3: Governance by Filesystem

**The pain:** Security scanners flag CVEs. Some are accepted risks. Teams need a way to register exceptions.

**The fix:** A centralized repo with one directory per product repo, each containing a scanner-ignore file with CVE exceptions. Process: "create a folder named after your repo, add an ignore file, submit a PR."

**Why it's cargo-cult:** The filesystem IS the data model. No validation that directory names match actual repos. No link between exceptions and actual scan results. No lifecycle enforcement — the `expires` field exists but nothing checks it. No audit trail. At one organization I examined, the repo was still named after the previous scanner tool they'd migrated away from — accretion, not design.

A software engineer would colocate exceptions with the code they apply to, enforce expiry and approval requirements via CI policy, and let a dashboard aggregate across repos. Centralize the policy. Distribute the data.

---

## The Common Thread: Centralizing Data Instead of Modeling Domains

| Case | What they centralized | What they should have modeled |
|------|----------------------|------------------------------|
| Shell script library | Bash functions | Component dependencies, version compatibility |
| Image registry | A flat list of images | Ownership, scan policy, version lifecycle |
| Security exceptions | CVE ignore files | Exception lifecycle, approval workflow, policy enforcement |
| A shared CR | A `serviceHost` string field | A typed reference the API server could validate |
| Kustomization health check | One boolean (`Reconciling != True`) | Resource-type-aware health, so `Ready=True` isn't overridden by a stale `Reconciling` |

The last two are worth unpacking, because they show the *same* anemic-model instinct expressed in the two places Kubernetes most invites it: a Custom Resource used as a shared data store, and a GitOps health gate used as a dependency gate.

### The CR as an unvalidated shared store

Two controllers coordinate through one CR. Controller A (a deployment controller) writes a service address into `spec.serviceHost`; controller B (a network operator) reads it and programs routing. The address it wrote is wrong — a malformed namespace segment, pointing at a namespace that doesn't exist. Downstream: a 503 that takes days and a cross-team fire drill to trace back to that one string.

The CR is the "centralized data store" between the two controllers, and it has the anemic-model disease in full: `serviceHost` is a raw `string`, not a typed reference; nothing validates that the namespace exists (and as Part 1 showed, admission *can't* cheaply validate cross-object existence anyway); there is no contract between producer and consumer. But there's a second, sharper mechanism underneath — the one that makes this the *default* outcome, not a fluke:

**A CR is shared mutable state with last-writer-wins semantics, and the default client write is a full-object replace.** When two controllers write the same CR, whether they clobber each other depends entirely on *how* they write. A `client-go` `Update()` is an HTTP `PUT` — it replaces the whole object, so any field the writer's Go struct doesn't model marshals as absent and is silently deleted. Server-Side Apply (`PATCH` with apply semantics + a field manager) instead partitions ownership per field in `metadata.managedFields`, so a writer only touches the fields it declares. Same two controllers, same CR — correct or corrupt depending on one method choice the schema does nothing to enforce. *(Reproduced live — a full-object `PUT` strips the other controller's field with no error; SSA preserves it: [Verify It Yourself §"Update() Is an HTTP PUT"](/articles/k8s-verify-it-yourself/#part-6--update-is-an-http-put-it-silently-strips-fields-it-doesnt-know). Part 6 is the whole essay on this.)*

The "centralize the data in a CR" instinct produces exactly this: a shared table with no types, no ownership model, and a default write path that clobbers. It holds information and enforces nothing.

### The health gate that can't tell "converging" from "converged"

A GitOps engine (Flux) gates a `Kustomization` on health, and lets other Kustomizations declare `dependsOn` it. Health is computed by the **kstatus** convention: read the object's `status.conditions`. Per that convention, an object reporting `Reconciling: True` is classed **InProgress** — and that classing takes precedence over `Ready: True`. So an object that is *both* `Ready: True` (converged, no changes) *and* `Reconciling: True` (a stale condition its controller set during a prior apply and forgot to clear) is judged **not healthy**. Every `Kustomization` that `dependsOn` it then never starts — because `dependsOn` gates on the dependency reporting *ready*, and this one never will until someone clears the condition. One controller's forgotten status write freezes an entire downstream chain, indefinitely, with no error anywhere.

*(Reproduced live — an object holding both `Ready=True` and a stale `Reconciling=True`, which is exactly the state a health gate rejects: [Verify It Yourself §"kstatus"](/articles/k8s-verify-it-yourself/#parts-2--5--kstatus-a-stale-reconciling-condition-blocks-readiness). The kstatus precedence rule is cited from the `cli-utils` kstatus library convention, not executed against Flux on the sandbox — noted honestly in that section.)*

The health check has no resource-type model — it reads one condition by name and applies one rule uniformly. That is the same anemic-model instinct as the `serviceHost` string: a boolean standing in for a domain concept ("is this Terraform resource actually done?") that a real model would have expressed with the resource's own semantics.

The operator instinct: **"The data is scattered. Put it in one place."**

The software engineer's instinct: **"There's no model. Define the aggregates and invariants."**

In DDD terms, these "centralized" repos are **anemic domain models** — data structures with no behavior, no invariants, no lifecycle. They hold information but enforce nothing.

And it's **worse than the original fragmentation.** Stage 1 at least had isolation — a change in one repo couldn't break another. Stage 2 loses that isolation (shared scripts break all consumers) without gaining proper abstraction (no contracts, no versioning). You end up with three layers: the original fragmented repos (still exist), the centralized repos (new bottleneck), and the implicit coupling between them (undocumented).

---

## "So Just Use Better Tools?"

This is where most articles about infrastructure problems end: "Use CDK instead of CloudFormation. Use Pulumi instead of Helm. Problem solved."

It's not that simple. The tooling wall is real — but it's not the only wall.

---

## The Tooling Wall

The Kubernetes ecosystem's core toolchain supports exactly one abstraction: **YAML files organized in directories, optionally processed by text templates.** Types, interfaces, contracts, invariants, composition — absent or bolted on.

### Helm: text templates pretending to be packages

When Helm templates need conditional logic — say, different config values per deployment ring and cluster type — you get this:

{% raw %}
```go-template
{{- $ring := .Values.global.infra.ring }}
{{- $cluster := .Values.global.infra.cluster.name }}
{{- $region := .Values.global.infra.aws.region }}

{{- if has $ring (list "canary" "production") }}
  {{- $_ := set .Values.configValues "gateway_domain" "production.example.com" }}
{{- else }}
  {{- $_ := set .Values.configValues "gateway_domain" "staging.example.com" }}
{{- end }}

{{- if and (hasPrefix "app" $cluster) (has $ring (list "canary")) }}
  {{- $_ := set .Values.configValues "gateway_memory" "8Gi" }}
{{- end }}

{{- if or (eq $region "eu-west-1") (eq $region "us-east-1") }}
  {{- $_ := set .Values.configValues "gateway_memory" "8Gi" }}
{{- end }}

{{- if eq "svc-canary-eu-west-1a" $cluster }}
  {{- $_ := set .Values.configValues "gateway_memory" "8Gi" }}
{{- end }}
```
{% endraw %}

This is a function: `(ring, clusterType, region) → Map<String, String>`. But it's expressed as Go template syntax mutating a map in place (`$_` discards the return value — a hack to use a function for its side effect). No parameter types. No return type. No way to unit test. Duplicated across every GitOps stack because Go templates have no import mechanism across charts.

A software engineer sees this and immediately writes:

```go
func resolveConfig(ctx InfraContext) ClusterConfig {
    config := defaultConfig()
    if ctx.Ring.IsProduction() {
        config.GatewayDomain = "production.example.com"
    }
    if ctx.ClusterType == Application && ctx.Ring == Canary {
        config.GatewayMemory = resource.MustParse("8Gi")
    }
    return config
}
```

Typed. Testable. Composable. But Helm can't express this. So every stack author reimplements the same conditional logic from scratch.

Helm supports "library charts" for sharing template functions. In the dozens of GitOps stacks I've examined, **zero** use a shared library chart for configuration logic. The tool supports sharing in theory; in practice it makes sharing painful enough that nobody does it.

### The rest of the toolchain

**Kustomize** can't express conditionals, so every variant needs its own overlay directory — the config override template expressed as a filesystem tree.

**GitOps tools** (Flux, ArgoCD) reconcile directories but can't express contracts between artifacts, cross-repo consistency, or domain semantics. A gitops repo is treated as source of truth, but its meaningful content is often just a set of version tags.

**CloudFormation StackSets** deploy templates across regions and accounts but offer no composition between templates. The Python deploy scripts in the WAF repos exist to compensate for this — manually coordinating cross-stack dependencies that the tool can't express.

None of these tools support types, interface contracts, aggregate invariants, or composition beyond file inclusion.

---

## CDK and Pulumi: Why the "Better Tools" Don't Spread

CDK and Pulumi solve every technical limitation above. Real programming languages. Real type systems. Real composition:

```typescript
class WafRuleGroup extends Construct {
  constructor(scope: Construct, id: string, props: WafRuleGroupProps) {
    super(scope, id);
    if (props.rules.reduce((sum, r) => sum + r.wcu, 0) > 1500) {
      throw new Error(`Rule group ${id} exceeds 1500 WCU capacity`);
    }
    this.ruleGroup = new wafv2.CfnRuleGroup(this, 'RG', {
      scope: props.scope,
      capacity: 1500,
      rules: props.rules.map(r => r.toCfn()),
    });
  }
}

// Variant is a parameter, not a code fork
for (const variant of ['commercial', 'fedramp', 'saas']) {
  new WafStack(app, `waf-${variant}`, loadConfig(variant));
}
```

One construct. Multiple variants. Type-checked. Invariant enforcement at synth time. Testable.

And yet CDK/Pulumi consistently fail to gain traction in operator-heavy organizations:

- **The hiring pipeline doesn't produce CDK users.** Job postings ask for Helm and Terraform, not TypeScript and domain modeling.
- **The existing investment is in YAML.** Migrating 50 Helm charts to CDK is a rewrite with negative short-term ROI.
- **CDK requires thinking differently.** It doesn't just change syntax — it changes the mental model. You have to model the domain. This is a mindset transition, not a tool migration.
- **The ecosystem doesn't support it.** Vendors ship Helm charts. Open-source projects ship Helm charts. CDK consumers end up wrapping Helm charts, defeating the purpose.

Terraform is the partial exception — modules with typed variables and documented outputs are genuinely reusable. But most Terraform in Kubernetes platforms is the same copy-paste pattern as Helm, just with `.tf` files.

---

## The Feedback Loop

The tools aren't just insufficient — they create a self-reinforcing cycle:

```
Operator-friendly tools
  → Attract operator-mindset engineers
    → Who build operator-style solutions
      → Which become "best practices" in blog posts
        → Which influence the next generation of tools
```

Kubernetes certifications test "write a YAML manifest," not "identify the aggregate boundaries." Conference talks demonstrate "how we deployed 500 microservices with ArgoCD," not "how we modeled our deployment domain." The community reproduces what the tools make easy and what the culture celebrates. Domain modeling is neither.

---

## The Uncomfortable Middle

Here's where the argument gets honest: blaming tools is incomplete.

CDK exists today. Pulumi exists today. CUE exists today. They solve every technical limitation described above. Operators don't adopt them — not because the migration cost is too high, but because **the tools require a way of thinking that operators don't have and don't know they're missing.**

The failed abstraction repos (Stage 2) weren't created because operators lacked CDK. They were created because operators saw "scattered data" where a software engineer would see "unmodeled domain." Give those same operators CDK and they'll produce YAML-equivalent TypeScript — the same concrete resources listed sequentially, just spelled in a different syntax.

The tool can change. The thinking doesn't — unless something else changes first.

**Next — [Part 3: The Abstraction Instinct](/articles/k8s-abstraction-instinct/).** The problem was never YAML vs TypeScript. It's whether you see a YAML manifest as "a configuration to apply" or as "an instance missing its class."

---

### Series: Why Kubernetes Infrastructure Rots

- **Part 1: [The Operator Mindset](/articles/k8s-operator-mindset-vs-domain-modeling/)** — Why one domain becomes six repositories. The repo-per-problem anti-pattern as a consequence of thinking in procedures instead of models.

- **Part 2: [The Cargo Cult](/articles/k8s-cargo-cult-centralization/)** — Why shared repos and better tools don't fix it. The failed abstraction phase. *(this article)*

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
