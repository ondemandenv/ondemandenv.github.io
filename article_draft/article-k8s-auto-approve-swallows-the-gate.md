---
layout: article
title: "The Auto-Approve: When the Reconcile Loop Swallows terraform plan"
description: "An aside to \"Why Kubernetes Infrastructure Rots.\" Wrapping Terraform in a Kubernetes reconcile loop forces approvePlan: auto, disableDriftDetection: true, forceUnlock: auto — three individually reasonable flags that, together, switch off every safety mechanism Terraform brought with it."
permalink: /articles/k8s-auto-approve-swallows-the-gate/
date: 2026-07-10
author: "Gary Yang"
tags: ["kubernetes", "terraform", "gitops", "reconciliation", "infrastructure", "platform-engineering"]
---

# The Auto-Approve: When the Reconcile Loop Swallows `terraform plan`

*A team wraps Terraform in a Kubernetes reconcile loop to manage AWS resources "the GitOps way." To make the loop run, they set `approvePlan: auto`. To stop the loop from surprising them, they set `disableDriftDetection: true`. To stop it deadlocking on a held state lock, they set `forceUnlock: auto`. Three flags. Each one individually reasonable. Together they switch off, one at a time, every safety mechanism Terraform brought with it — until what remains is a cron that runs `terraform apply` unattended against production AWS, with no human ever reading a diff. Nobody decided to build that. It's what the loop's contract requires.*

*This is an aside in the series "Why Kubernetes Infrastructure Rots." It pairs with [Operator Stockholm Syndrome](/articles/k8s-operator-stockholm-syndrome/) and the [Thermostat](/articles/k8s-thermostat-not-a-deployment-engine/) synthesis: Stockholm is about wrapping AWS **API calls** in a reconcile loop; Thermostat is about the loop **lacking** the DAG primitive infrastructure needs; this one is about the loop **deleting** a safety primitive Terraform already had.*

---

## The Artifact

A team manages a slice of AWS — an ECS Fargate service, a VPC and its peering, some Route53 associations — with Terraform. None of it runs in Kubernetes. It runs in AWS, as AWS resources always have.

The Terraform code is not applied by a human running `terraform apply`. It is not applied by a CI job. It is not applied by Spacelift or Atlantis. It is applied by a **Kubernetes controller**, reconciling a Custom Resource, inside the cluster. The CR looks like this (trimmed to the load-bearing fields):

```yaml
apiVersion: infra.contrib.fluxcd.io/v1alpha1
kind: Terraform
metadata:
  name: terraform-managed-service
spec:
  approvePlan: auto              # (1)
  disableDriftDetection: true    # (2)
  interval: 12h0m0s              # (3)
  tfstate:
    forceUnlock: auto            # (4)
  sourceRef:
    kind: OCIRepository          # (5)
    name: ...-infra
```

And the source it consumes is not a git checkout. The Terraform repository's release pipeline packages the HCL as an **OCI artifact** and pushes it to a container registry:

```bash
# from the infra repo's release workflow
- name: Remove backend
  run: |
    cat provider.tf | tr '\n' '\r' \
      | sed -e 's/backend "remote" {[^}]*}[^}]*}//g' \
      | tr '\r' '\n' >| provider.tf          # strip the remote backend
- name: Flux push
  run: |
    flux push artifact oci://.../tf-code:${VERSION} --path="$(pwd)/"
```

So the full path a change travels — say, bumping one container image tag by one patch version, a one-character diff in one HCL local — is:

> edit the Terraform repo → tag a release → CI strips the backend and pushes an OCI artifact → open a PR in a *different* repo (the Flux config repo) bumping the OCI tag that CR (5) points at → an `OCIRepository` in the cluster pulls the new artifact → the `Terraform` controller spins up a runner Pod → the runner runs `terraform apply` → AWS changes.

Seven hops to move one character. Hold that thought; we'll come back to what the seven hops cost. First, the four flags.

---

## What `plan` Is Actually For

Terraform is two commands wearing one name. `plan` computes the diff between your code and the real state of the world, and **shows it to a human**. `apply` executes that diff.

The split is the entire point. `plan` is where this line —

```
# aws_ecs_service.example_service must be replaced
-/+ resource "aws_ecs_service" "example_service" {
```

— gets read by someone *before* the service is destroyed and recreated. `plan` is the gate. It is the moment where "here is what will change" is separated, deliberately, from "change it," so that a person (or a policy check, or a PR approval) can stand in the gap and say *no, not that.*

Every sane way of running Terraform preserves the gate. A human at a terminal reads the plan and types `yes`. Atlantis posts the plan as a PR comment and waits for an approving review. Spacelift shows the plan in a run and blocks on confirmation. The gate can be a person or a policy, synchronous or asynchronous — but it is *there*, between plan and apply, always.

The gate is not ceremony. It is the one feature that makes it safe to let a tool with `destroy` in its vocabulary near production.

---

## The Loop Cannot Hold a Gate

A Kubernetes reconcile loop has a contract: observe actual state, converge it toward desired state, requeue, repeat — **unattended, indefinitely**. That is what a controller *is*. It is a thermostat: it does not phone you before it turns on the heat.

Now put Terraform inside that. The controller reconciles the `Terraform` CR by running `plan`, then `apply`. But `apply` needs the gate — a human reading the diff. A human reading the diff is, by definition, incompatible with "unattended, indefinitely." The loop cannot wait for a person; waiting for a person is the one thing a reconcile loop structurally cannot do.

So the controller offers flag **(1)**: `approvePlan: auto`.

This is not a misconfiguration. It is not laziness. It is the *only* value that lets the loop fulfill its contract. Any other value — any value that inserts a human — breaks the loop. **The gate and the loop are mutually exclusive by construction.** To wrap Terraform in a reconcile loop *is* to delete `plan`'s reason for existing. You cannot have both; the team that chose the loop chose, necessarily, to auto-approve.

Then the second-order consequences arrive, and each demands its own flag.

**Flag (2), `disableDriftDetection: true`.** Drift detection is the loop noticing that reality no longer matches state — and *acting* on it. But with auto-approve on, "acting on it" means: silently re-apply, every 12 hours, whatever anyone changed in the AWS console, with no diff shown to anyone. That is terrifying, so the team turns drift detection **off** — which is the safe choice, and also an admission. With drift detection off, the loop no longer reconciles anything. It has been reduced to: *re-run apply against a pinned artifact, on a timer.* It is not a controller anymore. It is a cron job with a CRD. (This is the [Cron and the Gate](/articles/k8s-cron-and-gate/) failure in a different costume: the operator's shape no longer matches what it does.)

**Flag (4), `tfstate.forceUnlock: auto`.** Terraform locks its state during an apply so two applies can't corrupt it. If an apply dies mid-flight, the lock is held, and — by design — a *human* is supposed to inspect why before force-unlocking, because a stuck lock often means a half-applied change. But the loop can't inspect anything and can't wait for a human, so it force-unlocks automatically and proceeds. Another human-in-the-loop safety, deleted for the same reason as the first two: the loop's contract has no room for a human, so every place Terraform expected one gets switched off.

The pattern rhymes because it is one pattern. **Every human-in-the-loop safety Terraform ships is individually incompatible with "unattended reconcile," so each is individually turned off** until none remain. The team did not decide to run production infrastructure changes with every safety disabled. They decided to use the loop, and the loop collected the flags one funeral at a time.

---

## The Wrong Gate Grows Back

Here is the part that turns an architecture smell into an operational one.

Having deleted Terraform's plan-approval gate, the team still needs *some* control over when AWS changes land in higher environments. You cannot just let every merge apply straight to production the moment CI is green. So they graft a gate back on — but not the one they removed. They reach for the gate the platform already has: **ring promotion**, the deployment tool's `stop`/`bake`/`promote` machinery.

Ring promotion was built to gate the rollout of **long-running workloads** — deploy a version to a ring, bake it while you watch its metrics, promote to the next ring if it's healthy. It is a gate that understands *a thing that runs and can be observed over time.*

It is now being used to gate a **one-shot, idempotent `terraform apply`** — a thing that runs once, changes AWS, and is done. There is nothing to bake. There are no workload metrics. The gate and the operation have no concepts in common.

And a gate that doesn't understand its operation fails in ways nobody watches for. A `stop` issued on this deployment unit at the moment one PR merged **persisted for six-plus days with no resume** — and, because the stop is scoped to the deployment unit and not to any PR, it would have silently gated a *completely unrelated* later apply, one belonging to a different ticket, with no connection to its own content or review state. No PR comment, no ticket note, no message explained the stop. It just sat there, a held gate on a mechanism that has no notion of "this apply already finished, you can stop holding."

So the ledger reads: they deleted the gate that understood the operation (the plan diff, which would have said *"this will replace the ECS service"*), and grew back a gate that does not (a workload-bake timer, which can only say *"stopped"* or *"not stopped,"* indefinitely, unwatched). The safety didn't move from a human to automation. It moved from *"a person sees the destroy before it happens"* to *"a promotion flag no one is looking at, gating an operation it was never designed to describe."*

---

## The Same Structure That Raises Risk Lowers Your Ability to Fix It

This is the point the rest of the series can only gesture at, and this specimen makes provable. The inversion of ends and means — putting the means (everything must be a K8s reconcile loop) ahead of the end (change some AWS resources correctly) — does not merely add maintenance cost. It multiplies **risk**, and it does so along three axes that compound, because the same structure that raises the risk also strips away the tools you'd normally use to bring it back down.

**Fragmentation is not length — it's deleted gates.** The seven-hop path from §1 is not risky because "long chains break." It is risky because *for the chain to flow automatically, every joint that could have been a gate had to be un-gated.* Each hop — the OCI push, the tag bump PR, the OCIRepository pull, the auto-approved apply — is a place a human could have looked. To make the pipeline pull the change through end-to-end without stopping, the team auto-approved the apply, disabled drift detection, and auto-force-unlocked the state. Fragmentation didn't just add steps; it created N places that each needed their safety switched off so the whole thing could run hands-free. **More fragments means more gates deleted, not merely more links to fail.**

**Complexity is not cost — it's invisibility of risk.** The six-day zombie `stop` was not bad luck. The risk lived in a grafted, mismatched gate that no one thinks to look at, because the machinery it's grafted onto (workload ring promotion) has no vocabulary for the operation it's gating (a one-shot apply). And proving that a given change even *took effect* requires reading a non-obvious `OCIRepository` object in a namespace no one associates with AWS — because the thing being managed (ECS) is not in the cluster at all. The accidental complexity doesn't just cost time to understand; it renders the risk **unobservable through every normal instinct**. You go looking for the change on the workloads, and it isn't there, because it was never a workload.

**One-way, one-branch, one-runtime — the recovery paths are gone too.** Normal engineering offsets high risk with cheap recovery: fast rollback, parallel hot-fix paths. This structure removes exactly those:

- **One-way.** There is no plan-time "look and decide not to" — auto-approve means you learn the diff only *after* it applied. And downstream, the companion migration in this same platform is documented as forward-only with no controller-driven rollback: to recover a single hostname you manually move traffic back, one at a time, as a last resort. Rollback moved from *O(read a diff and decline)* to *O(manually rebuild)*.
- **One branch.** The seven-hop chain is the *only sanctioned path*. You cannot legally hot-fix the AWS resource directly, because a direct change is "drift" and violates the whole unified standard — so the chain's total latency becomes the floor on how fast you can fix anything. When the zombie `stop` sat upstream, everything downstream was blocked, and no one had a bypass; that's why six days was possible.
- **One runtime.** Execution, state, and observability are all bound to the cluster — the controller runs there, the artifact is pulled there, proving effect means `kubectl`-ing a CR there — while the thing being managed lives entirely in AWS. That is a single-point operational surface that *isn't even the source of truth.* (This is a structural single point of dependency, not a claim that a specific cluster outage has severed AWS-change capability — but the dependency is real: for an operation that intrinsically needs nothing from Kubernetes, the platform has manufactured a hard dependency on Kubernetes being healthy.)

Put the three axes together and you get the sentence this whole article exists to earn:

> Traditional engineering cancels high risk with fast rollback and parallel repair paths. This structure does the opposite on every axis at once: it raises the risk and hides it (delete the gates, bury them in mismatched machinery), *and* it sets rollback to forward-only, repair to single-file serial, and the entire operational surface to one runtime that isn't the source of truth. **The mechanism that manufactures the risk and the mechanism that slows the repair are the same mechanism.** Mean-time-to-recovery isn't merely longer — it's structurally pinned to the total latency of a chain you're not allowed to leave.

Risk up, ability-to-fix down, driven by one root cause, moving the same direction. That is what "efficiency collapses" means here — not "there are more steps," but "the only path you are permitted to take is simultaneously the most fragile, the slowest, the least reversible, and the most single-pointed one available."

---

## The Category Error

The [Thermostat](/articles/k8s-thermostat-not-a-deployment-engine/) article framed the platform's ceiling: reconcile loops converge *individual resources toward individual desired states*, and infrastructure needs *groups of resources converged toward consistent collective states, in dependency order, with transactional rollback* — a different computational problem the loop cannot express. That article's gap is a **missing** primitive: the DAG was never there.

This specimen is the mirror image. Terraform's plan/apply gate is a primitive that *was* there — Terraform brought it. It exists precisely because infrastructure changes are **not** safely convergible without a human first reading the collective diff: destroy-and-recreate, ordering, blast radius. Wrapping plan/apply in a reconcile loop is not "GitOps for Terraform." It is taking a tool built around *a human reading a diff* and running it in a model that structurally *cannot contain a human reading a diff* — and then switching off, flag by flag, every mechanism that assumed the human was there.

The gate here isn't missing by accident. It was **deliberately deleted, one flag at a time, because the loop's contract required it** — and then, because a system still needs some gate, a wrong one was grafted back from the workload-rollout machinery, where it fails unwatched. Fragmentation guaranteed there were many gates to delete; accidental complexity guaranteed the deletions were invisible; one-way / one-branch / one-runtime guaranteed that when the invisible risk finally surfaced, you'd be slow, serial, and unable to reverse.

The loop did not automate the gate. It abolished it — and called the abolition "declarative."

---

## How to Notice It in Yourself

You are inside this frame if:

- You wrote `approvePlan: auto` and felt nothing — it read as boilerplate, not as *deleting the reason `plan` exists.*
- You turned off drift detection to stop surprise re-applies, and didn't register that this made the loop stop reconciling anything — that you now run a cron with a CRD.
- You added a *second* gate (a ring stop, a label, a manual promotion step) to control *when* an apply lands — i.e. you rebuilt, worse, the gate you deleted, on machinery that doesn't understand the operation.
- To prove a change took effect, you reach for `kubectl` against a cluster — for a resource that lives in AWS.
- You can recite the reconcile interval but not the last plan diff any human actually read. (When *was* the last one?)

The fix is not "rip out the controller." It is the recognition that **`terraform apply` is not a workload, and the value of Terraform is half in `plan`.** A change to cloud infrastructure wants a gate where a human reads the diff before the world changes — and that gate is not a nuisance the loop should optimize away. It is the feature. If your orchestration model cannot contain that gate, the model is wrong for the job — not the gate.

---

*The series in one sentence: infrastructure at scale is a software-engineering problem, and the tools the K8s ecosystem treats as defaults often add complexity — and delete safety — that no engineer would accept if they were solving the same problem outside the cluster's gravitational well.*

---

### Series: Why Kubernetes Infrastructure Rots

- **Part 1: [The Operator Mindset](/articles/k8s-operator-mindset-vs-domain-modeling/)** — Why one domain becomes six repositories. The repo-per-problem anti-pattern as a consequence of thinking in procedures instead of models.

- **Part 2: [The Cargo Cult](/articles/k8s-cargo-cult-centralization/)** — Why shared repos and better tools don't fix it. The failed abstraction phase.

- **Part 3: [The Abstraction Instinct](/articles/k8s-abstraction-instinct/)** — What no tool can provide. CDK in the hands of an operator is still operator thinking.

- **Part 4: [The Distributed Monolith](/articles/k8s-gitops-distributed-monolith/)** — Why your GitOps is a monolith wearing a microservices costume. Five repos, five teams, zero transactional boundary, and six incidents in four weeks.

- **Part 5: [The Staging Mindset](/articles/k8s-staging-mindset-kills-migration/)** — Routing is atomic. Deployment is not. Why feature flags are what happens when the infrastructure can't express version coexistence.

- **Part 6: [The Shared Mutable State](/articles/k8s-cr-shared-mutable-state/)** — The CR is a database table with no foreign keys, shared between controllers with no ownership model. Silent data loss as a design consequence.

- **Aside: [Operator Stockholm Syndrome](/articles/k8s-operator-stockholm-syndrome/)** — When the K8s control plane becomes the universe. Routing every cloud API through a cluster CR even when the cluster has no semantic role.

- **Aside: [The Cron and the Gate](/articles/k8s-cron-and-gate/)** — When the operator models itself instead of the domain. One `Reconcile()` hook, triggered identically by create/resync/requeue, becomes the only place policy can live.

- **Aside: [The Configuration Problem](/articles/k8s-tribal-knowledge/)** — One business rule sliced across Helm, ConfigMap, Flux substitution, and Calico's dataplane — zero cohesion, load-bearing tribal knowledge.

- **Aside: [The Auto-Approve](/articles/k8s-auto-approve-swallows-the-gate/)** — When the reconcile loop swallows `terraform plan`. Wrapping a tool with a human-in-the-loop gate in a loop that structurally can't hold one. *(this article)*

- **Aside: [You Can't Front-Run the Composition Gap](/articles/k8s-front-run-composition-gap/)** — Why correct first-principles reasoning must crash once before it can diagnose.

- **Lab: [Verify It Yourself](/articles/k8s-verify-it-yourself/)** — Copy-pasteable, real-output reproductions of every cluster mechanism the series cites (foreign keys, CEL scope, ownerRefs, SSA, PUT-strips-fields, resourceVersion, CRD versioning, kstatus).

- **Synthesis: [The Thermostat That Ate Infrastructure](/articles/k8s-thermostat-not-a-deployment-engine/)** — How a container self-healing pattern became a deployment engine. The missing DAG from node boot to infrastructure blue/green.
