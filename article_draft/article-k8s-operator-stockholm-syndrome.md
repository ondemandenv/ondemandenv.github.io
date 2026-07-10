---
layout: article
title: "Operator Stockholm Syndrome: When the K8s Control Plane Becomes the Universe"
description: "An aside to \"Why Kubernetes Infrastructure Rots.\" A team routes every cloud API through a cluster CR reconciled by a controller — even when the cluster has no semantic role in the interaction. Five layers to do what is mechanically three SDK calls. The habit of treating the cluster as the universe is the captor."
permalink: /articles/k8s-operator-stockholm-syndrome/
date: 2026-07-10
author: "Gary Yang"
tags: ["kubernetes", "operators", "crossplane", "terraform", "aws", "platform-engineering"]
---

# Operator Stockholm Syndrome: When the K8s Control Plane Becomes the Universe

*A team needs to manage AWS certificates. They reach for a Kubernetes operator that wraps a Crossplane Managed Resource that delegates to an upjet runtime that embeds terraform-provider-aws as a Go library that calls the AWS ACM API. Five layers to do what is, mechanically, three SDK calls. Asked why, the team will tell you "because that's how we do AWS in this platform." That answer is the symptom.*

---

## The Anti-Pattern in One Sentence

Stockholm syndrome is when the captive identifies with the captor and starts seeing the world through the captor's frame. The K8s-operator equivalent is when the only legitimate way to talk to a cloud provider becomes "through a Kubernetes Custom Resource reconciled by a controller running in the cluster" — even when the cluster has no semantic role in the interaction.

The cluster isn't the captor here. The captor is **the team's own habit of treating the cluster as the universe.** The cloud provider is the actual hard dependency. The cluster is one of N possible orchestration surfaces — but inside the team's mental model it has become the only one, and any path that doesn't go through it feels illegitimate, "untyped," "uncontrolled," "not GitOps."

---

## A Concrete Case

A team manages custom domains for SaaS tenants. The lifecycle is: customer requests a domain → operator requests an ACM certificate → operator polls until ACM marks it ISSUED → operator wires it into a CDN distribution.

Two operators in the same workspace solve essentially this problem. Call them Operator A and Operator B.

**Operator A** uses the AWS SDK directly. Three functions: `RequestCertificate`, `DescribeCertificate`, `DeleteCertificate`. The state machine lives in Go, in one file, parameterized by the customer's domain CR. When AWS marks a cert `VALIDATION_TIMED_OUT`, the operator sets the customer-facing CR state to "expired" and stops trying. When the customer fixes their DNS, the next reconcile observes the cert is `ISSUED` and proceeds. There is exactly one reconcile loop between Operator A's code and ACM — its own.

**Operator B** routes the same lifecycle through Crossplane Managed Resources. Its reconciler creates an `acm.aws.upbound.io/v1beta1.Certificate` MR. That MR is then reconciled by a *second* controller — the Crossplane provider — whose reconcile loop calls, in-process via upjet's no-fork runtime, the same `terraform-provider-aws` Go function the `terraform` CLI would call during `apply`. So the same logical operation now runs behind **two stacked reconcile loops**, each with its own workqueue, its own rate-limiter backoff, and its own poll interval — Operator B's loop reconciling the MR, and the provider's loop reconciling the cloud resource. That provider function, since 2021, has a subtle behavior: on `VALIDATION_TIMED_OUT` it marks the resource gone (`SetId("")`) so the next `apply` recreates it.

In a CLI context this is correct: a human runs `apply`, sees a plan to recreate, and the cert is replaced. In Operator B's context it's a bug, and the mechanism is worth naming because it's not obvious why a *read* causes a *recreate*. Crossplane's managed reconciler runs a fixed contract every loop: `Observe()` → if the external resource "doesn't exist," `Create()`. upjet implements `Observe` by calling terraform-provider-aws's read, which — on `VALIDATION_TIMED_OUT` — does `d.SetId("")`. An empty ID is upjet's signal for "resource gone," so `Observe` returns `ResourceExists: false`, and the very next step in the contract is `Create()`. The controller isn't buggy; it's faithfully executing "observe says gone, so create." And it does this unprompted: Crossplane re-runs `Observe` on a poll interval (independent of any spec change), so with no human and no new input, the loop recreates the cert on a timer. ACM accumulates an orphan timed-out cert plus a fresh `PENDING_VALIDATION` cert, and the cycle repeats. Customers who eventually publish their DNS validation CNAME find the cert they're validating against no longer exists — a new one was provisioned days ago with a different validation CNAME. Support tickets follow.

Operator A could not have produced this bug. There is no recreate path; no SDK function returns "the resource is gone" for a status that means "the resource exists but is in a terminal state." Operator A reads the status, decides what to do, and does it. The state machine is in one place.

Operator B produces this bug because it consumes a state machine — the terraform-provider-aws CRUD functions — that was designed for a different invocation model. The operator did not write that state machine. It cannot easily inspect or override it. It can only react to its outputs after the fact.

---

## Why the Team Picked Operator B's Pattern

Not because it was technically simpler. Not because it was faster to ship. Not because Operator A's pattern was unavailable — Operator A is in the same workspace, written by the same team, in production for years.

The team picked Operator B's pattern because, by the time Operator B was being designed, the team had already absorbed a set of unspoken rules:

- AWS resources must be represented as Kubernetes objects.
- The reconciler should describe intent, not call APIs.
- Anything that talks to AWS directly is "imperative" and therefore wrong.
- Crossplane is "the AWS provider for Kubernetes," so using it is the default; not using it requires justification.

None of these rules is written down. None is enforceable. None is, on inspection, true. AWS is not less declarative when accessed via the SDK — `RequestCertificate` is exactly as declarative as a Crossplane MR's `forProvider` block; in both cases you state what you want and a reconciler converges to it. The difference is which reconciler: the team's own Go code (which they understand and control) versus a stack of third-party reconcilers (which they consume and inherit semantics from).

The team picked the second option because, inside their captive frame, the second option doesn't feel like a choice. It feels like *how things are done.*

---

## What Stockholm Syndrome Looks Like in PR Reviews

A PR appears that uses the AWS SDK directly to manage a small set of resources. It will be reviewed by people whose mental universe is the cluster. Predictable comments:

- **"Why aren't we using a Managed Resource for this?"** Translation: I expected to see a CR, and I didn't. The absence of a CR violates a pattern I have internalized.
- **"This is imperative."** Translation: this code calls a function that does a thing. As opposed to a CR that, when applied, causes a controller to call a function that does a thing. The second is "declarative." The distinction is theological, not architectural.
- **"How do we GitOps this?"** Translation: my deployment workflow assumes the artifact is a YAML file in a repo. If the resource lives in AWS and is owned by an operator, my workflow doesn't apply. I am uncomfortable.
- **"What about drift detection?"** Translation: Crossplane gives us a status block I can `kubectl get` to see if the resource matches spec. Without a CR, where is the status block? The answer — "the operator's reconcile loop is the drift detection; it's running every 30 seconds against AWS" — does not satisfy, because the status isn't kubectl-shaped.

These comments are sincere. Each reviewer is doing their job as they understand it. The aggregate effect is that the captive frame is enforced by code review, and any escape attempt is reabsorbed.

---

## The Cost of the Frame

Operator B's path looks like a clean abstraction layer. It is not. It is a stack of independently-reconciling controllers, each owned by a different upstream, each with its own semantics, each capable of breaking the others in ways not visible at the layer above. Concretely, the "abstraction" is *additional control loops*: Operator B's reconcile loop, the Crossplane provider's reconcile loop, and behind it the upjet/terraform-provider-aws state machine — each a separate workqueue with a separate exponential backoff and a separate poll timer, none aware of the others' retry state. "Five layers" isn't a metaphor for complexity; it's a literal count of independent reconcilers and state machines the request passes through, any one of which can be mid-backoff while the one above it reports healthy.

When Operator B fails, the on-call engineer's debugging path is:

1. Read the operator's logs. See "managed resource not ready."
2. `kubectl describe` the MR. See `status.atProvider.status: PENDING_VALIDATION`. Looks fine.
3. Notice the `Arn` field changed since yesterday. Confused.
4. Check the Crossplane provider's logs. See `VALIDATION_TIMED_OUT` followed by a recreate.
5. Discover this is upjet behavior. Not documented in their tracker.
6. Discover upjet inherits it from terraform-provider-aws. Not documented either.
7. Read terraform-provider-aws PR #17869. Realize the behavior was added five years ago for a CLI use case the operator is not.

That is six layers of indirection between "the certificate didn't validate" and "I understand why."

When Operator A fails, the path is: read the operator's logs. The state machine is in one file. The bug is reproducible with two SDK calls in a unit test.

This is not a Crossplane failing. Crossplane is doing exactly what it was built to do. This is a **failure of frame** — a team that has accepted, without ever saying so out loud, that the cost of routing every AWS interaction through the cluster is zero.

The cost is not zero. It is one Slack thread, one Jira ticket, one customer-impacting incident, and 500 lines of Go you don't need to write or maintain.

---

## How to Notice It in Yourself

You are operating inside a captive frame if:

- The first design step for "we need to manage X in AWS" is "what CR represents X?" rather than "what's the lifecycle and where does the state machine live?"
- You feel that calling `aws-sdk-go-v2/service/<x>` directly from a controller is a regression, even when there's no architectural reason it would be.
- You assume a Crossplane MR will be more reliable than your own Go code, even though the MR is *additional* code on top of your code, with its own bugs.
- You can name the Crossplane provider's version but not the AWS SDK's version.
- "Declarative" and "imperative" are categories you use to evaluate code, rather than properties of specific behaviors you can point at.
- You have not written code that calls an AWS API directly from a controller in the last year.

The framing here isn't that Crossplane is bad. It's that Crossplane is **a tool with a specific purpose** — multi-cloud abstraction, central platform management of cloud resources for non-cloud-native consumers — and using it for everything because it's the cluster-native option is the same mistake as wrapping every database call in an ORM because that's the framework-native option. The tool is fine. The unconditional reach for the tool is the captivity.

---

## The Escape

The escape is not "rip out Crossplane." It is the recognition that **Kubernetes is one orchestration surface among many, and AWS is the actual source of truth.** A controller that talks to AWS directly is not less Kubernetes-native than one that goes through Crossplane. It is exactly as Kubernetes-native: it watches CRs, it reconciles toward declared state, it integrates with the controller-runtime. It just doesn't insert a Kubernetes intermediary between itself and the cloud API.

When you write that controller, you discover the same things you'd discover with Crossplane — that ACM is asynchronous, that DNS validation has a 72h window, that AWS sometimes returns transient errors. The difference is you discover these things in your own code, where you can encode the right behavior the first time. You don't inherit them through five layers of indirection from a 2021 PR by someone who was solving a different problem.

The series in one sentence: infrastructure at scale is a software engineering problem, and the tools the K8s ecosystem treats as defaults often add complexity that no software engineer would accept if they were solving the same problem outside the cluster's gravitational well.

This is the frame the captive cannot see. The job is to notice that you're inside it.

---

*This is the Stockholm Syndrome essay in "Why Kubernetes Infrastructure Rots." It pairs with Part 1 (The Operator Mindset) and the Thermostat synthesis — Part 1 is about how operators model the world, Stockholm is about how operators stop seeing alternatives, Thermostat is about what the wrong defaults produce at scale.*

---

### Series: Why Kubernetes Infrastructure Rots

- **Part 1: [The Operator Mindset](/articles/k8s-operator-mindset-vs-domain-modeling/)** — Why one domain becomes six repositories. The repo-per-problem anti-pattern as a consequence of thinking in procedures instead of models.

- **Part 2: [The Cargo Cult](/articles/k8s-cargo-cult-centralization/)** — Why shared repos and better tools don't fix it. The failed abstraction phase.

- **Part 3: [The Abstraction Instinct](/articles/k8s-abstraction-instinct/)** — What no tool can provide. CDK in the hands of an operator is still operator thinking.

- **Part 4: [The Distributed Monolith](/articles/k8s-gitops-distributed-monolith/)** — Why your GitOps is a monolith wearing a microservices costume. Five repos, five teams, zero transactional boundary, and six incidents in four weeks.

- **Part 5: [The Staging Mindset](/articles/k8s-staging-mindset-kills-migration/)** — Routing is atomic. Deployment is not. Why feature flags are what happens when the infrastructure can't express version coexistence.

- **Part 6: [The Shared Mutable State](/articles/k8s-cr-shared-mutable-state/)** — The CR is a database table with no foreign keys, shared between controllers with no ownership model. Silent data loss as a design consequence.

- **Aside: [Operator Stockholm Syndrome](/articles/k8s-operator-stockholm-syndrome/)** — When the K8s control plane becomes the universe. Routing every cloud API through a cluster CR even when the cluster has no semantic role. *(this article)*

- **Aside: [The Cron and the Gate](/articles/k8s-cron-and-gate/)** — When the operator models itself instead of the domain. One `Reconcile()` hook, triggered identically by create/resync/requeue, becomes the only place policy can live.

- **Aside: [The Configuration Problem](/articles/k8s-tribal-knowledge/)** — One business rule sliced across Helm, ConfigMap, Flux substitution, and Calico's dataplane — zero cohesion, load-bearing tribal knowledge.

- **Aside: [The Auto-Approve](/articles/k8s-auto-approve-swallows-the-gate/)** — When the reconcile loop swallows `terraform plan`. Wrapping a tool with a human-in-the-loop gate in a loop that structurally can't hold one.

- **Aside: [You Can't Front-Run the Composition Gap](/articles/k8s-front-run-composition-gap/)** — Why correct first-principles reasoning must crash once before it can diagnose.

- **Lab: [Verify It Yourself](/articles/k8s-verify-it-yourself/)** — Copy-pasteable, real-output reproductions of every cluster mechanism the series cites (foreign keys, CEL scope, ownerRefs, SSA, PUT-strips-fields, resourceVersion, CRD versioning, kstatus).

- **Synthesis: [The Thermostat That Ate Infrastructure](/articles/k8s-thermostat-not-a-deployment-engine/)** — How a container self-healing pattern became a deployment engine. The missing DAG from node boot to infrastructure blue/green.
