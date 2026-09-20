---
layout: article
title: "An Accident of Scheduling: Symptoms, Coping Disciplines, and Why the Defect Is Invisible"
description: "Part 3 of \"Scope Dissolution in Distributed Software Engineering.\" What the mechanism looks like from a desk: the per-repository pipeline displaced the stack as the unit binding ownership, order and consistency boundary, and the deployed system became an accident of scheduling. Review becomes social rather than evidential, better proposals cannot be shown, the test matrix is not computable — and the defect is structurally exempt from the diagnostics organisations actually run."
permalink: /articles/scope-dissolution-accident-of-scheduling/
date: 2026-09-19
author: "Gary Yang"
tags: ["distributed-systems", "gitops", "ci-cd", "organizational-design", "platform-engineering", "cargo-cult", "software-engineering"]
---

# An Accident of Scheduling

### Symptoms, coping disciplines, and why the defect is invisible

*Part 3 of a series. [Part 1](/articles/scope-dissolution-checker-never-caught/) argued that the one checker which crossed a process
boundary was discarded, and a second never adopted. [Part 2](/articles/scope-dissolution-no-place-for-a-promise/) argued that the
prevailing model has no syntactic category in which a cross-service promise could
be placed, and that the boundary at which typing dies is exactly the boundary along
which loose coupling lives. [Part 2](/articles/scope-dissolution-no-place-for-a-promise/) closed by observing that the three preconditions
of evolvability — local variation, cheap variation, comparable variants — are all
compromised. This part asks what that looks like from a desk.*

---

## 1. Why a symptomatology is necessary

The preceding parts are mechanism. If a reader does not recognise their own working
week in what follows, the mechanism has no referent and the series should be
disregarded.

There is also a structural reason to descend to this level. A defect of the kind
described in Parts [1](/articles/scope-dissolution-checker-never-caught/) and [2](/articles/scope-dissolution-no-place-for-a-promise/) does not present as a defect. It presents as a
distribution of ordinary difficulties, each of which has a local and usually human
proximate cause. §11 argues that this is not incidental: the defect is
**structurally exempt from the diagnostic apparatus organisations actually use**,
and that exemption is the reason two decades elapsed without a diagnosis.

[Part 2 §2.3](/articles/scope-dissolution-no-place-for-a-promise/#23-on-mindset-stated-fairly) conceded that "mindset" correctly names the difference between the two
traditions but cannot explain its persistence, and deferred the persistence
mechanisms to this part. §11 and §12 discharge that obligation.

---

## 2. The chain

Begin from the type of the thing that organises deployment.

```
the pipeline's type is  pipeline(ref) → stage
  ⇒ the unit of versioning = the unit of ownership = one repository
  ⇒ no object represents "the system": no ref, no version number,
     no pipeline denotes the whole
  ⇒ each repository maintains only its own version; each proceeds alone
  ⇒ N repositories' artefacts are mixed together in one environment
  ⇒ that combination was never declared, chosen, or tested by anyone
  ⇒ the compatibility of the combination is recorded nowhere
  ⇒ therefore it is carried by people talking to one another
```

The pivotal step is the third, and it is not a new observation: **"there is no
system-level version" and "a world is not a first-class value" are the same
absence.** A world would *be* that set of mutually consistent versions. What a
practitioner experiences as fragmentation is the same hole seen from a desk rather
than from a model.

### 2.1 What the pipeline displaced

The chain reads as though `pipeline(ref) → stage` were a starting point. It is not.
It displaced a better unit.

A **stack** — in CloudFormation, Terraform, or CDK — is the only unit that binds
three things at once:

| What a stack binds | Per-service pipeline |
|---|---|
| **Owner** — who owns this bundle of resources | The service owns its pipeline; **nobody owns "the assembled system in environment X"** |
| **Deployment order** — a DAG derived from references | **Does not exist**; pipelines run independently and ordering is arranged by people |
| **A consistency boundary** — stack-level rollback, failure semantics | None |
| A declared external interface (outputs, exports) | Present, but as untyped strings ([Part 2, §5](/articles/scope-dissolution-no-place-for-a-promise/#5-why-types-do-not-cross-and-where-they-die)) |

And the deployment model of the containerised era rotated the axis:

```
organised by stack (a bundle of resources + internal DAG + owner + consistency boundary)
            ↓ axis rotation
a cell in a (service × environment) matrix, advanced through shared environments
```

The dependency graph between services therefore has no position in the model. A
change requiring coordinated ordering **cannot be expressed**, and must be
sequenced by people. Everything commonly complained about under the headings of
unclear ownership, inconsistency, version conflict and fragmentation is a
**consequence of this single rotation**, not a set of independent process problems.

### 2.2 The rotation was not a preference

It would be easy, and wrong, to attribute the rotation to the tastes of one
profession. The mechanism is the trigger model of continuous integration:

> CI is triggered by **repository events**. A push can therefore only start a
> pipeline for **its own repository**. There exists no push that means "the system
> changed."

The (service × environment) matrix is the shadow of that fact.

**Falsification.** If the cause were professional preference, organisations with
strong software-engineering cultures should organise deployment around
system-level units. They do not; they also run per-repository pipelines
(**unverified** as a population claim, and worth measuring), because the trigger
model is the same. Tooling, not culture.

### 2.3 A hand-numbered DAG

The ecosystem does contain ordering mechanisms — init containers, readiness gates,
chart hooks, and continuous-delivery sync waves. The form of the last is worth
noting (**annotation syntax and semantics unverified**):

> A sync wave is **an integer written by hand**, whereas Terraform's and
> CloudFormation's ordering is **derived from references**.

A hand-numbered approximation of a DAG, against a derived one. This is the same
shape as the compatibility matrix in §4: **something a tool should have derived has
instead been transcribed by a person.**

### 2.4 Terraform and CloudFormation, fairly

Their DAG is sound only **within** a single stack or state. Cross-state lookups and
cross-stack exports resolve to untyped strings at apply time ([Part 2, §5](/articles/scope-dissolution-no-place-for-a-promise/#5-why-types-do-not-cross-and-where-they-die)). So they
supply **N stacks each with an internal DAG, plus untyped edges between them** —
not a first-class object representing the whole graph.

They therefore went considerably further than a per-service pipeline: they retained
the unit that binds owner, order and boundary. But an enterprise application's
multi-service dependency graph **crosses stacks**, which returns the problem to L3,
where both types and ordering die at the boundary of ownership.

That missing object has a name in the literature: the **global type** of multiparty
session types, which — as quoted in [Part 1](/articles/scope-dissolution-checker-never-caught/) — "encodes the sequencing information".
The object this section finds missing is the object that formalism supplies.

---

## 3. The deployed system is an accident of scheduling

- `order-service v2.7` carries **no information** about which `pricing-service`
  version it works with.
- The combination running in production is **whatever each pipeline last happened
  to promote**.
- No one chose it, and no artefact records "I was tested against these peer
  versions."

Hence:

> The running system is an **unnamed, undeclared, never-collectively-tested**
> combination. It exists as a fact about the cluster at time T, not as a declarable
> object.

Which gives a precise account of a sentence everyone has said:

> **"It was working yesterday."** — Because yesterday was a *different
> combination*, and **neither combination has a name**, so neither can be
> reproduced nor bisected.

This is worth dwelling on because it explains why the ordinary tools of engineering
judgement fail here rather than merely being inconvenient. Bisection requires an
ordered sequence of named states. Reproduction requires a nameable state. Neither
is available, so debugging at the system level is reduced to recollection.

---

## 4. Where the type checker went

Three things simultaneously have nowhere to live:

| Homeless information | The only remaining medium |
|---|---|
| The contract (L3 lost, Parts [1](/articles/scope-dissolution-checker-never-caught/)–[2](/articles/scope-dissolution-no-place-for-a-promise/)) | A verbal agreement, a wiki page, a chat message |
| Version compatibility | Someone's memory; a matrix in a wiki |
| Which combination is good | A coordination ticket |

> Chat and issue trackers are where the type checker went.

And as a medium they are **worse than YAML**: no schema, no evaluation, no
durability guarantee, and **no link to the artefact they describe**. YAML at least
sits in the same repository as the thing it configures.

### 4.1 A symptom catalogue, with attribution

| What you have experienced | What it actually is |
|---|---|
| "Is anyone still using this field?" → ask, wait a day | **No static knowability of consumers** ([Part 1 §6.2](/articles/scope-dissolution-checker-never-caught/#62-what-the-restored-idls-still-do-not-type): the topology was never typed) |
| "Can I release?" → check with three teams | No system-level version exists; the intersection must be computed by hand |
| Integration problems surface only in staging, and staging is a queue | A world is not a value, so the trunk and the shared environment become mutexes ([Part 2 §6.2](/articles/scope-dissolution-no-place-for-a-promise/#62-consequently-the-branch-degenerates-and-the-trunk-becomes-a-mutex)) |
| "It works in dev" | Dev is a **different unnamed combination** |
| A ticket entitled "coordinate the v2 rollout across services" | **That ticket is a type error that escaped to a human** |
| A breaking change announced in a channel; consumers on holiday break | A contract change with no compile-time obligated recipient |
| A hand-maintained compatibility matrix in a wiki | **Something a type system should have derived, transcribed by hand, and already stale** |
| Release trains; big-bang releases; change freezes | **Serialising everything in order to manufacture the missing system-level version** |

The last two rows deserve emphasis. **A release train is not a process best
practice; it is a manual reconstruction of a missing object.** So are compatibility
matrices, release-manifest repositories, and the sync waves of §2.3. Pinned-closure
approaches come closer, since they at least make the combination a nameable
artefact.

---

## 5. The monorepo counterexample

This symptom set is not a symptom of distributed systems. It is a symptom of
**multiple repositories with per-repository pipelines and no cross-repository
contract artefact.**

In a single repository most of it disappears: one commit **is** a system-level
version; the combination is declared and tested together. The price is merged
ownership, and therefore the loss of independent deployability — which was the
reason for splitting in the first place.

Both roads arrive at the same place:

> What is required is a compilation unit whose scope is **at least the set of all
> independently deployed units**. A monorepo achieves this by **eliminating the
> plurality of owners**. A shared published contract achieves it **without touching
> ownership**.

A monorepo is thus a brute-force solution to the right problem. It works, and it
costs independent deployment. This disposes of the most common objection to the
series — "why not just use a monorepo?" — by agreeing with it and locating it.

---

## 6. Organisational consequences

Everything in this section is stated as a mechanism. The versions that attribute
these outcomes to the character of the people involved are both unfair and
useless — unfair because the incentives are as described, useless because character
is not an intervention point.

### 6.1 Review becomes social rather than evidential

Code review has real value: it catches defects, distributes knowledge, and
normalises style. The mechanism of interest is narrower:

| What the reviewer can actually do | The nature of an approval |
|---|---|
| Run the change in an isolated world and observe it | **Evidential** |
| Read a diff and run tests that do not cover integration | **Trust-based** |

A trust-based approval is a social relation, and social relations have politics.
The cost appears in **disagreement**:

- Under an evidential regime, "I think this is wrong" is settled by running it.
- Under a trust-based regime, it is settled by seniority, or by who is willing to
  spend social capital.

> Technical disagreement is thereby delegated to hierarchy. Not because anyone
> has degraded, but because **the absence of an evaluable world converts a
> technical gate into a social one.**

**Falsification.** In repositories where a pull request receives a complete
ephemeral environment and contract tests, review discussion should shift from
approval-signalling towards substantive findings. If it does not, this mechanism is
wrong.

### 6.2 Better proposals cannot be made, because they cannot be shown

- To propose an alternative architecture, one must be able to **exhibit** it.
- Exhibiting requires instantiating a world containing the proposal.
- If worlds are not instantiable, an alternative can only be **argued**, never
  **demonstrated**.
- The cost of proposing therefore rises from "instantiate a world; here it is" to
  "write a design document, persuade N teams, obtain a slot in the shared
  environment, negotiate a freeze."

> The expected return on proposing a better design collapses, while the return on
> not proposing is unchanged.

The individually rational response is not to propose. The resulting passivity is
**structural selection, not a defect of character**; describing it as the latter
both misplaces the cause and forecloses the remedy.

Compactly:

> One cannot win an architectural argument one cannot instantiate.

Architectural decisions are therefore settled by **authority** rather than by
**demonstration**. Together with §6.1, the engineering culture shifts from
evidential to authoritative — not by anyone's decision.

### 6.3 Quality assurance's problem is not difficulty; the test matrix is not computable

Test surface = interface shapes × version combinations × flag combinations ×
environment differences. Under the conditions described, all four are
**unenumerable**:

| Factor | Why it cannot be enumerated |
|---|---|
| Interface shapes | Untyped ([Part 1 §6.2](/articles/scope-dissolution-checker-never-caught/#62-what-the-restored-idls-still-do-not-type)) |
| Version combinations | No system-level version exists (§2–§3) |
| Flag combinations | 2ⁿ, and no component knows which are legal ([Part 2 §6.3](/articles/scope-dissolution-no-place-for-a-promise/#63-alternative-trunk-based-development-relocated-the-branch-into-the-runtime)) |
| Environment differences | Conditionals on environment identity make environments behave differently ([Part 4](/articles/scope-dissolution-world-is-a-value/)) |

> Quality assurance cannot define its own test matrix. This is not "testing is
> harder"; **the matrix is not computable.**

Whence the degenerate practice: smoke-test in staging and hope.

The statement of risk must change accordingly. **It is not that risk is high; it is
that risk is unquantifiable** — the proportion of the state space ever exercised is
unknown and unknowable. That is worse than high risk, because one cannot decide how
much mitigation to buy.

### 6.4 The defect is structurally exempt from the organisation's diagnostics

Why would an organisation not attribute these problems to architecture? Not
through dullness:

- The diagnostic vocabulary of incident response concerns **states and events**:
  what broke, which node, which configuration value, which runbook.
- An architectural defect **does not present as an incident**. It presents as a
  *distribution of incidents over time*.
- Each individual incident has a **proximate cause**, and a proximate cause is
  always local and usually human: "someone changed the field without telling us",
  "the flag was set wrong", "staging was stale".
- Therefore the architectural cause is **never the proximate cause of anything**,
  and appears in no post-incident review.

> **It is invisible by construction.** The point is not that operations engineers
> cannot understand architecture. It is that **incident-driven diagnosis is
> structurally incapable of surfacing a cause that has no single incident.**

**Falsification.** Examine a corpus of post-incident reviews and classify the
recorded causes. If architectural causes appear at a rate comparable to proximate
ones, this mechanism is wrong.

---

## 7. Manual reconstruction, and its highest form

§4 listed manual reconstructions: release trains, compatibility matrices,
release-manifest repositories, sync waves. Their shape is identical — something a
checker should have derived, transcribed by a person.

> When the cost of reconstruction is high enough, it stops being a spreadsheet and
> becomes a team.

| Coping discipline | What it manually reconstructs | Where it would come from if the structure existed |
|---|---|---|
| **Chaos engineering** | The dependency graph and failure modes | Declaration plus analysis |
| **Cost attribution (the attribution half of cloud financial management)** | Cost ownership | Derived from ownership boundaries |
| Distributed tracing **as a discipline** | The call stack | A single object ([Part 1 §4](/articles/scope-dissolution-checker-never-caught/#4-the-dissolution)) |
| Platform engineering, internal developer platforms | An abstraction layer that should have existed | Correct layer fit ([Part 2 §5.6](/articles/scope-dissolution-no-place-for-a-promise/#56-layer-mismatch-is-systematic)) |

### 7.1 Each has a legitimate half, and the argument fails without saying so

**Chaos engineering's legitimate half.** Partial failure is L4, and L4 is
irreducible. Even with perfect contracts and a complete DAG, one **cannot**
analytically derive a distributed system's behaviour under arbitrary partial
failure; that is genuinely emergent. Empirical fault injection is therefore a
**necessary technique** for L4, not a substitute for anything.

The discriminating test is what an experiment **finds**:

| The finding of a chaos experiment | Its nature |
|---|---|
| "It turns out A depends on B, and we did not know" | **A surrogate for a missing L3 declaration** |
| "Under 200 ms of added latency, the retry storm saturates the connection pool" | **A legitimate L4 discovery**, not derivable statically |

**The legitimate half of cloud cost management.** Cloud pricing is genuinely
complex — reserved against spot against on-demand, egress, cross-zone traffic — and
optimising it is real engineering, independent of architecture. The symptom is the
other half:

> **Cost attribution requires an ownership boundary**, and the ownership boundary
> was dissolved by the axis rotation of §2.1. Attribution therefore changed from
> something **derived** into something **investigated**.

The test: **is ownership derived, or investigated?** When "whose is this forty
thousand a month" becomes a research project, that is the symptom.

And the mechanism is this series' central disease in another guise: attribution
runs on **resource tags** — untyped strings applied by convention, with nothing
checking that they are correct or complete. Tag coverage is reported as the
dominant practical problem (**unverified**). Cost information, too, flows into a
medium nothing checks.

(Dates: Chaos Monkey c. 2011 at Netflix; the cost-management professional body
c. 2019. Both **unverified**; no argument here depends on them.)

### 7.2 A terminological correction: this is not chaos

These systems are **not chaotic** in the dynamical sense; they do not exhibit
sensitive dependence on initial conditions. They are:

> **combinatorially opaque** — the configuration space is not enumerable (§6.3).

The distinction is not pedantry, and it cuts in a specific direction:

> **Chaos is a property of a system, and one can only adapt to it. Non-enumerability
> is a defect of a model, and one can repair it.**

Describing the second as the first is therefore the linguistic trace of having
given up. This yields an unusual but genuine diagnostic: when an organisation
begins describing its own system with the vocabulary of irreducible complexity,
that is not an observation it has made. It is a position it has adopted.

---

## 8. Cargo culting, with an operational definition

Practitioners reach for "cargo cult" to describe this condition. The term is worth
keeping and requires a definition first, or it is merely abuse:

> **Adopting the *form* of a practice while its *precondition* is absent, with
> nothing that checks the precondition.**

Under that definition the preceding parts are already full of instances — the term
is not a new claim but a **name for the symptom set**:

| Form adopted | Its precondition | Holds? | What checks the precondition |
|---|---|---|---|
| **Microservices** | **Independent deployability** | No: the artefact combination remains coupled (§2–§3) | **Nothing** |
| **"Git as single source of truth"** | A **validation gate before the write** | No: the checker is downstream of the gate ([Part 2 §6.1](/articles/scope-dissolution-no-place-for-a-promise/#61-world-gits-value-proposition-presupposes-a-compiler)) | **Nothing** |
| **Canary releases, A/B tests** | An **isolated control arm** | No: every confounder is shared ([Part 2 §6.3](/articles/scope-dissolution-no-place-for-a-promise/#63-alternative-trunk-based-development-relocated-the-branch-into-the-runtime)) | **Nothing** |
| **Namespaces as environments** | **Instantiability per ref** | No: named singletons ([Part 4](/articles/scope-dissolution-world-is-a-value/)) | **Nothing** |
| **Domain-driven design** (taking only bounded contexts) | **Context mapping** — what the relationship is once you have divided | No: degraded to chat ([Part 2 §2.2](/articles/scope-dissolution-no-place-for-a-promise/#22-the-diagnosis-in-domain-driven-designs-own-vocabulary)) | **Nothing** |
| **Trunk-based development** | Somewhere to put an **alternative world** | No: relocated into `if (flag)` ([Part 2 §6.3](/articles/scope-dissolution-no-place-for-a-promise/#63-alternative-trunk-based-development-relocated-the-branch-into-the-runtime)) | **Nothing** |
| **Portability as a reason to adopt Kubernetes** | **The whole system** is portable | No: manifests are portable; identity, networking, storage drivers and **managed services and data** are not — and the latter dominate migration cost | **Nothing, and more completely so: portability is never measured** |

The final column is uniformly "nothing". Therefore:

> Cargo culting is not a cause. It is the **observable consequence of there being
> no checker.**

This also explains its stability. **The form of a practice is visible** — one can
see a deployment, a pull request, a canary dashboard. **Its precondition is
invisible** — because making preconditions visible is precisely the work of the
checker that was discarded.

### 8.1 The portability row is the most complete instance

The other practices are occasionally punctured by reality: a failed release exposes
"microservices that cannot be deployed independently"; an incident exposes a canary
without an isolated control. **Portability is never punctured, because almost
nobody actually migrates.**

> It is not a neglected precondition. It is a **reason that is structurally
> unfalsifiable**, and it can therefore survive indefinitely without anyone
> deceiving themselves.

Which supplies the remedy: **make it falsifiable.** Ask for the list of managed
services that would require replacement, and an estimate in person-months. Nobody
needs to concede anything; the justification collapses on its own.

To be explicit, since this is a criticism of a *stated reason* and not of a system:
Kubernetes has several real justifications — a uniform declarative API across
heterogeneous workloads, an extension point, bin-packing economics under sustained
load, no execution-time limits. **Disposing of a false reason does not dispose of
the true ones.** [Part 2 §2](/articles/scope-dissolution-no-place-for-a-promise/#2-a-bounded-context-mistaken-for-a-global-model) makes the same point structurally.

### 8.2 The definition reaches the architecture itself

Applied to the reconcile model ([Part 2 §5.5](/articles/scope-dissolution-no-place-for-a-promise/#55-the-genealogy-of-the-mismatch)): the form adopted is declarative
management (`spec`, `status`); the precondition is a computable diff inspectable
before acting; the precondition is absent; nothing reports its absence.

The failure mode is invisible in exactly the predicted way:

> A controller stuck in backoff and a controller that is working but slow are
> externally indistinguishable. There is no "plan failed" — only "not yet
> converged, possibly forever."

And this is the most widely propagated instance, since the operator pattern is the
recommended extension path; Argo, Open Policy Agent and Istio all follow it
(verified, Wikipedia). It is fair to add that the complexity this produces is not
disputed by its authors: "A common criticism of Kubernetes is that it is too
complex. Google admitted this as well" ([Wikipedia, *Kubernetes*](https://en.wikipedia.org/wiki/Kubernetes)).

---

## 9. Vocabulary colonisation

The scale of the mismatch is best characterised not by breadth but by **direction**.

> The ubiquitous language of one infrastructure-layer bounded context has
> colonised the organising vocabulary of software architecture.

Everything in §2 is a trace of that colonisation: per-service pipelines, the
(service × environment) matrix, labels as topology, a version control system as the
source of architectural truth.

And it is measurable, which makes it the sharpest available form of the claim:

> Examine the vocabulary a team uses when discussing **architecture**. Count
> infrastructure terms (namespace, deployment, service, pod, label, sync wave,
> drain) against domain-modelling terms (bounded context, aggregate, invariant,
> published language, context map).

**Prediction.** The former dominates, and the ratio increases with depth of
platform adoption. **If the two classes appear in approximate balance in
architectural discussion, this prediction is refuted.**

---

## 10. Why it went unremarked for two decades

A paper claiming a twenty-year regression must explain the absence of an alarm, or
a reader is entitled to doubt the regression. Three mechanisms suffice.

**First: L2 was untouched.** Of the four layers, only L3 regressed. L1 improved,
L4 modestly improved, and **L2 — the daily work — did not change at all.** Business
logic is still written in typed languages with classes, interfaces, generics,
refactoring and unit tests.

> The daily loop of software engineering was left intact, so software engineers
> continued to feel like software engineers. **The layer that was lost was never in
> the daily loop: one does not miss a capability one never exercised.**

This is directly testable. Ask a microservices developer what their IDE did for
them the last time they renamed a cross-service endpoint. Most will find **the
question itself odd**. That oddness is the evidence: it shows that "there should be
a tool guarantee across the boundary" is no longer in the set of expectations.

**Second: of L3's two halves, the conspicuous one was solved.**

| The two halves of L3 | Status | Symptom when missing |
|---|---|---|
| **Discovery** — how do I find the peer? | **Solved**: a service gets a stable address and DNS name (verified) | **Immediate pain**: nothing connects, discovered in seconds |
| **Agreement** — what does the peer promise? | **Untouched**: the name is untyped | **Delayed by months**: shape mismatch, semantic drift, an unexercised branch |

Solving the half that hurts immediately produces the impression that cross-service
wiring is a solved problem.

**Third: the failures of the remaining half are attributed to people.** Each
instance is recorded as "someone changed an interface without telling anyone",
which is both true as a proximate cause and fatal to diagnosis (§6.4).

No one need have erred. These three conditions holding simultaneously are
sufficient.

---

## 11. The persistence mechanisms

[Part 2 §2.3](/articles/scope-dissolution-no-place-for-a-promise/#23-on-mindset-stated-fairly) granted that "mindset" names the difference correctly and cannot
explain its persistence. Four mechanisms explain the persistence, and only the last
is organisational in a way that resists technical remedy.

| Mechanism | Content | Dissolves if costs fall? |
|---|---|---|
| **The stated benefit is unfalsifiable** | Portability is never measured, so the justification cannot be shown wrong (§8.1) | **No** — but it can be made falsifiable, which is an intervention |
| **The trigger model of continuous integration** | A push can only start its own repository's pipeline; no push means "the system changed" (§2.2) | **No** — but it is a tooling property, therefore changeable |
| **Incident-driven diagnosis cannot see it** | An architectural cause is never a proximate cause (§6.4) | **No** — addressable by changing what post-incident review classifies |
| **Accountability is centralised** | One team on call for the whole estate; a central console is the dual of that responsibility | **No — and this one is genuinely organisational** |

The fourth is a real limit on this series, and it should be stated plainly: **if one
team is accountable for everything, it will rebuild a central console however clean
the model is.** Technical correctness does not overturn an accountability topology.

A tactical note on the first mechanism. The attribution "you are paying for a
constraint that no longer exists" is **checkable** — one can examine whether the
original justifications for these practices cited machine cost. The attribution
"you lack the right mindset" is not checkable and reliably produces defence. The
first is also simply more accurate: the cost structure changed when instantiation
became an API call, and the practices built around the old cost structure did not.

---

## 12. Stagnation is an equilibrium

```
symptoms are attributed to people
  ⇒ the remedy chosen is process (more review, more approval, more coordination)
  ⇒ process raises the cost of proposing change
  ⇒ greater passivity (§6.2)
  ⇒ fewer architectural proposals
  ⇒ the architecture does not change
  ⇒ the symptoms continue, and are attributed to people   ⟲
```

This is self-reinforcing. §10 explains why the defect is **invisible** — a static
property. This explains why it is **stable** — a dynamic one. Twenty years requires
no one to have erred; it requires only that this loop close.

It also identifies the intervention point, and there is only one that is available
from outside the loop: **worlds are not instantiable.** Make a world a value and:

- §6.2's cost structure changes — an alternative can be demonstrated rather than
  argued;
- §6.1's adjudication returns to evidence;
- §6.3's matrix acquires at least one enumerable dimension;
- §6.4 acquires an object that can be **exhibited** rather than only asserted.

> The prescription is therefore not a cultural appeal. **Culture is an output of
> that loop, not an input to it.**

[Part 4](/articles/scope-dissolution-world-is-a-value/) states what making a world a value requires, what it does not solve, and
where the irreducible boundaries are.

---

## 13. Falsification

1. **The chain (§2).** Exhibit an organisation with per-repository pipelines, no
   cross-repository contract artefact, and no system-level version, which
   nonetheless does not coordinate releases through human communication.
2. **The rotation's cause (§2.2).** Measure whether organisations with strong
   software-engineering cultures organise deployment around system-level units. If
   they do, the trigger-model explanation is wrong and a cultural explanation
   survives.
3. **Review (§6.1).** Compare review discussion in repositories with and without
   per-pull-request ephemeral environments and contract tests. No shift towards
   substantive findings refutes the mechanism.
4. **Diagnostic exemption (§6.4).** Classify causes recorded in a corpus of
   post-incident reviews. Architectural causes appearing at a rate comparable to
   proximate causes refutes the claim.
5. **Cost attribution (§7.1).** Find an organisation in which cost ownership is
   derived from a declared ownership structure rather than investigated. The
   prediction is that such organisations have the structure this series argues for.
6. **Vocabulary colonisation (§9).** Count infrastructure against domain-modelling
   vocabulary in architectural discussion. Approximate balance refutes the
   prediction.
7. **The unexercised capability (§10).** Ask practitioners what tooling assists a
   cross-service rename. Widespread expectation of tool support refutes the
   explanation of the missing alarm.
8. **The equilibrium (§12).** Find an organisation that made worlds instantiable
   and observe whether architectural proposal rates rose. A null result refutes the
   identification of the intervention point — and this is the measurement the series
   most needs, since it is the only one that tests the remedy rather than the
   diagnosis.

None of the measurements in this list have been performed here. The series offers
mechanisms and the means to test them; it does not offer data.

---

## References

Verified (quotations appear in Parts [1](/articles/scope-dissolution-checker-never-caught/)–[2](/articles/scope-dissolution-no-place-for-a-promise/)):

- [Wikipedia, *Kubernetes*](https://en.wikipedia.org/wiki/Kubernetes) — service discovery, namespaces, the operator
  pattern (Argo, Open Policy Agent, Istio), and the complexity criticism. Secondary
  source; primary sources preferred.

To be supplied before publication:

- Continuous-delivery sync-wave semantics; chaos-engineering and cloud-cost
  management institutional histories.
- Any empirical literature on per-repository pipeline prevalence, ephemeral
  environment adoption, and post-incident cause classification — §13 items 2, 3, 4
  and 8 may already have partial answers in the empirical software engineering
  literature, which this series has not yet surveyed.

---

### Series: Scope Dissolution in Distributed Software Engineering

- **Part 1: [The Checker That Was Never Caught](/articles/scope-dissolution-checker-never-caught/)** — Every verification guarantee software engineering acquired was intra-process. Distribution dissolved each checker's scope; the one checker that had crossed the boundary — the interface definition language — was discarded by software engineers themselves, and a second, worked-out formalism was never picked up at all.

- **Part 2: [No Place to Put a Promise](/articles/scope-dissolution-no-place-for-a-promise/)** — The prevailing model's primitive for relating things is a runtime query over mutable strings, which has no position in it for a promise. Four categories of information consequently degrade into media nothing checks — and the boundary at which typing dies is exactly the boundary along which loose coupling lives.

- **Part 3: [An Accident of Scheduling](/articles/scope-dissolution-accident-of-scheduling/)** — The symptom chain as seen from a desk: per-repository pipelines, review as social adjudication, rational passivity, an uncomputable test matrix, and coping disciplines that professionalise manual reconstruction. Why a defect of this shape is structurally exempt from the organisation's own diagnostics. *(this article)*

- **Part 4: [A World Is a Value](/articles/scope-dissolution-world-is-a-value/)** — The remedy: named singletons become a type with instantiation, cross-service wiring becomes a compile-time type, and the intent of a divergence becomes declarable. Stated with the quantifier argument that makes the cheap universal layer non-substitutable — and with an explicit list of what remains irreducible.
