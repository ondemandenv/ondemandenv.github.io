---
layout: article
title: "A World Is a Value: What the Remedy Requires, and What It Cannot Do"
description: "Part 4 of \"Scope Dissolution in Distributed Software Engineering.\" What the remedy requires: a compile-time layer that nothing downstream can substitute (a quantifier argument), the move from named singletons to a type with instantiation, three functions rather than one, and the self-destruct to avoid — conditionals on environment identity. Bounded deliberately: the limits section is load-bearing, not a disclaimer."
permalink: /articles/scope-dissolution-world-is-a-value/
date: 2026-09-19
author: "Gary Yang"
tags: ["distributed-systems", "type-systems", "contracts", "on-demand-environments", "ondemandenv", "session-types", "evolvability"]
---

# A World Is a Value

### What the remedy requires, and what it cannot do

*Part 4 of a series, and the last. [Part 1](/articles/scope-dissolution-checker-never-caught/) argued that the one checker which crossed
a process boundary was discarded and a second never adopted. [Part 2](/articles/scope-dissolution-no-place-for-a-promise/) argued that the
prevailing model has no syntactic category for a cross-service promise, and that the
boundary at which typing dies is exactly the boundary along which loose coupling
lives. [Part 3](/articles/scope-dissolution-accident-of-scheduling/) descended to symptoms, showed that the defect is structurally exempt
from the diagnostics organisations use, and identified a single intervention point
available from outside the resulting equilibrium: worlds are not instantiable. This
part states what making a world a value requires, and — at greater length than is
customary — what it does not achieve.*

---

## 1. What this part claims, and what it does not

[Part 3](/articles/scope-dissolution-accident-of-scheduling/) ended by naming one intervention point. That is a narrow claim and it will be
kept narrow. In particular:

- **No new formalism is proposed.** [Part 1](/articles/scope-dissolution-checker-never-caught/) conceded that the architecture required —
  one artefact spanning all participants, from which each participant's view is
  derived and checked — is the global type plus endpoint projection of multiparty
  session types, and precedes this series by decades.
- **The contribution is the machinery**, not the formalism: what it takes for such a
  shared artefact to survive **independent, open, and independently growing
  ownership**, which is the barrier that formalism's own literature identifies.
- **The remedy is bounded, and the bounds are the point.** §8 lists what remains
  irreducible. A reader who takes only one section should take that one.

§2 establishes why a compile-time layer cannot be substituted by anything
downstream, since without that the rest is merely a preference. §3 disposes of the
obvious historical objection. §4–§6 state the move and its failure mode. §7 states
what is contributed. §8 states the limits, §9 the reason any of it matters.

---

## 2. Correctness is multi-valued, but the quantifiers differ

An objection has to be settled first, because it is correct as far as it goes and
fatal if left: *"compiles" is only one kind of correctness; do not treat it as the
whole.*

Agreed. But these layers are not peers offering alternatives. **Their quantifiers
differ.**

| Layer | Quantifier | Cost | When |
|---|---|---|---|
| Type checking | **∀ over all executions** — proves the absence of a *class* of error | ≈0 given a language that already has types | Before merge |
| Tests | **∃ over sampled inputs** — exhibits correct behaviour on some inputs | Moderate | Before merge |
| Canary, production observation | **Statistical**, over live traffic | High | **After deployment** |

The asymmetry is the whole point: **no amount of canary establishes a universal
property.** A code path that live traffic did not reach is not thereby shown
correct. Conversely, no type establishes business value.

So the conclusion is not "compilation is one option among several and may be
substituted". It is:

> It is the only layer that supplies a universal guarantee at marginal cost near
> zero, and **nothing downstream shares its quantifier.**

Applied to the subject of this series: **a canary cannot catch "this consumer reads
the wrong parameter key"** if that path is not exercised. Contracts must be typed
not because types are the only correctness, but because the other layers are
quantified too weakly for this particular question.

### 2.1 Some correctness predicates have arity greater than one

The canary predicate is not "does v2 satisfy P". It is:

> v2 is correct **iff**, on live traffic, its error rate and latency are **not worse
> than v1's**.

That is a comparison. Its **arity is two**. Therefore:

> A model that can hold only one world **has nowhere to write this predicate down.**

Which is why it ends up in feature flags and dashboards — once again outside every
type system ([Part 2 §6.3](/articles/scope-dissolution-no-place-for-a-promise/#63-alternative-trunk-based-development-relocated-the-branch-into-the-runtime)). This also means the remedy in §5 does not dissolve the
canary; it makes both arms independently instantiable, which is a different and
lesser claim than solving it.

### 2.2 Multi-valued correctness requires a machine-checkable index

If correctness is genuinely multi-valued, the kinds must be distinguished, because
they have opposite implications for whether convergence is even meaningful:

| Kind | Should the variants converge? |
|---|---|
| **Underdetermined** — the specification does not pin an implementation | Immaterial |
| **Pareto-incomparable** — latency against cost against consistency | **No** — merging them is a category error; there is nothing to resolve |
| **Contextual specialisation** — they answer *different questions* (per region, per customer) | **Never** — the divergence is permanent and correct |
| **Phase** — what is correct in a mock is incorrect in production | No, but ordered |

And a discipline follows, without which the position becomes unfalsifiable:

> If correctness is indexed by context, then every world must carry a
> **machine-checkable statement of which correctness it claims.** Otherwise "it is
> correct for its context" becomes a universal defence and any divergence can be
> justified after the fact.

**Multi-valued correctness without an index is not correctness.** This is the real
cost of the position, and it is a cost the remedy must pay rather than avoid.

---

## 3. This is not distributed objects

What follows applies object-oriented and type-theoretic machinery to distributed
systems. That sentence is nearly word-for-word the programme of the most famous
failure in the field's history, and a reader who remembers it is entitled to stop
here unless the difference is stated.

The programme of **distributed objects** — CORBA, Java RMI, DCOM, remote enterprise
bean interfaces — was to make a remote object *look like* a local one. [Waldo et al.
(1994)](https://waldo.scholars.harvard.edu/publications/note-distributed-computing) is the canonical refutation, and its abstract is explicit that systems which
"**paper over the distinction between local and remote objects**" thereby "**fail to
support basic requirements of robustness and reliability**".

[Part 1](/articles/scope-dissolution-checker-never-caught/) added the unifying reason: a method call is synchronous and total, while the
medium is asynchronous and lossy. Distributed objects did not merely conceal
failure; **they manufactured a coupling the medium forbids.**

The distinction that separates the present proposal from that one:

| | Distributed objects | Typed deployment descriptions |
|---|---|---|
| Where the abstraction lives | **At runtime** — a method call is secretly a network call | **At synthesis time** — classes generate topology, then are **erased** |
| Is the boundary concealed? | **Yes** (fatally) | **No.** Nobody pretends a remote call is local |
| Use of the type system | A **distribution mechanism** | **Metaprogramming**: types *describe* the system; they do not *cross* the network |
| Partial failure | Abstracted away, therefore misrepresented | Left outside the abstraction, at L4, where it belongs |

One sentence:

> **The classes exist in the system's *description*, not in its *execution*.**

That is the entire difference, and the only reason the approach is admissible.

### 3.1 A criterion used twice

From which a criterion that this part uses in two places:

> **Synthesis or instantiation time — a parameter, a description — is legitimate.
> Runtime — a conditional, a transparent proxy — is a misrepresentation.**

Here it distinguishes the present proposal from CORBA. In §6 it distinguishes
legitimate per-world configuration from the self-destruct.

---

## 4. The move: from named singletons to a type with instantiation

### 4.1 The missing concept is not plurality

It is tempting to say that operations thinks in terms of one world. That is
inaccurate: operations runs several — development, staging, production, disaster
recovery, multiple regions. The difference is not in **number**:

> Those worlds are **named singletons**, not **instances of a type**.

One says "**the** staging environment", not "**a** staging environment". Operations
has instances without a type. Instances must therefore be named, maintained and
patched individually — which is a complete explanation of why overlays are
inevitable, and it is not a criticism of anyone's diligence.

So the content of the software-engineering move can be stated in one line:

> **From named singletons to a type with instantiation.**

This is the transition from global variables to classes and functions, applied
without modification to environments.

### 4.2 The same move at three scales

It is not a single insight but one move applicable repeatedly:

| Scale | The type | The instances | Expressed today by |
|---|---|---|---|
| Workload | An image; a construct class | Containers, replicas | **CDK-style construct composition does this well** |
| Environment | A declared environment type | A world | The platform layer |
| Account, region | A topology type | Concrete accounts | The platform layer |

### 4.3 The types of the two models

Compare what the two models actually are, as functions:

```
pipeline : Ref → Stage → ()      -- side effects written into globally mutable slots
enver    : Ref → World           -- World is a value; there can be many
```

The pipeline's state is a scalar position on a line. Its only composition operator
is **promotion**, from stage N to stage N+1. There is no operator for "instantiate a
world", "compare two worlds", or "retire a world". Environments are **fixed, named,
shared slots** — slots, not instances, and a slot holds one thing.

> Therefore *N worlds where N exceeds the number of slots* is **inexpressible** in
> that type.

And the essential consequence, which is what makes this more than terminology:

> **Determinism and isolation are not additional features. They are consequences.**

A value can be instantiated in isolation and re-instantiated identically; a shared
slot cannot. "The two versions cannot be debugged independently" is a direct
consequence of slot semantics: debugging degenerates from **executable** (run it,
step it, replay it) to **observational** (dashboards, sampled traces).

Shadow traffic, session affinity and request replay are, in this light,
**observational reconstructions of what a genuinely isolated instance would have
supplied for free** — which is the same pattern [Part 1](/articles/scope-dissolution-checker-never-caught/) identified at every other
layer. They are evidence of the absence, not counterexamples to it.

---

## 5. Three functions, not one

A frequent and correct objection is that instantiable worlds do not solve
everything. The remedy decomposes into three functions, and only the first is fully
solvable:

| # | Function | Supplied by | Status |
|---|---|---|---|
| 1 | `Ref → World` — instantiation | Branch-as-environment, with a typed contract | **Fully solvable** |
| 2 | `Request → World` — routing, partitioning | Edge routing, service mesh | **Becomes expressible** — there are now named worlds to route to; the canary comparison lives here |
| 3 | `World → Data` — tenancy, state partitioning | — | **Unsolved; this is the ceiling** |

(2) is mechanically tractable; meshes and edge routers already do it. (3) meets
physics: **one cannot instantiate real customer money**, and if two worlds share a
data store they have been recoupled and isolation is void.

**A warning about (2).** If the second dimension is not typed, **YAML regrows at the
routing layer.** A routing rule that names its target world by string is the same
disease as a consumer that names its upstream by parameter key. (Service-mesh
routing resources are commonly of this form; **unverified** here and worth
checking.) The second function must be a typed producer–consumer relation like the
first, or the problem reappears one layer up.

---

## 6. The self-destruct: conditionals on environment identity

There is one line of code that undoes all of this, and it is extremely common:

```
if (env === 'dev') { … }
```

The damage has three layers.

**(a) It voids the entire promotion ladder.** The whole point of separate
environments is that **the artefact is identical and only its context differs** —
that is what makes staging *evidence about* production. A conditional on environment
identity makes the artefact behave differently per environment, so staging tests **a
different program**, and the ladder's evidential value collapses.

**(b) It leaks world identity into the code.** What should be `Ref → World` becomes
**`World → behaviour`, decided by the artefact at runtime.** The world's identity
becomes a runtime value read by business logic — the same disease as a feature flag,
with the branch variable being the environment name.

**(c) Worst: it turns the set of worlds into a closed enumeration in source.**

> Once `if env == dev/staging/prod` exists, **creating a new world requires a code
> change.**

The type/instance distinction is destroyed from the inside: worlds are no longer
instances of a type but enumerated cases in a switch. The named-singleton model has
been hard-coded into the artefact, which makes it unfalsifiable from within — one
cannot demonstrate that worlds are instantiable without modifying code.

### 6.1 But the underlying need is real

Log verbosity, mocked against real upstreams, rate limits, whether to send real
email — these genuinely do differ per world. The error is not in wanting the
difference. It is in **how the difference is encoded**:

| | Does world identity leak? | Does a new world require a code change? |
|---|---|---|
| `if (env === X) { … }` — a conditional on world identity | Yes | **Yes** |
| The difference as **a parameter injected at instantiation**, or a substituted implementation of an interface | No — the artefact never learns which world it is in | No |

### 6.2 A criterion, and a self-audit

This yields a test applicable to any codebase, and it is §3.1's criterion again at a
different scale:

> **Is the per-world difference read at synthesis or instantiation time (a
> parameter), or inside runtime business logic (a conditional)?**

The former is legitimate — it is an argument to `f`. The latter is `if env == dev`
under another name.

Honesty requires applying this to the reference implementation. That system carries
a phase flag on its environment type, used — according to its documentation — to
break a bootstrap dependency cycle by supplying validly shaped defaults. **Which
side of the criterion it falls on has not been verified here.** If the flag is read
at synthesis time to select which typed producer to wire, it is an instantiation
parameter and legitimate. If it is read inside request-handling logic to branch
business behaviour, it is the same fault under a better name. This is a genuine open
item, and stating it is cheaper than discovering it later.

---

## 7. What is contributed

### 7.1 The concession, restated plainly

The architecture is not novel. Multiparty session types describe interactions among
participants with a **global type**, "projected into local types"; choreographic
programming compiles such a description into per-role implementations by **endpoint
projection**. The global type, per [Part 1](/articles/scope-dissolution-checker-never-caught/)'s verified quotation, "encodes the
sequencing information" — which is precisely the deployment ordering that [Part 3 §2](/articles/scope-dissolution-accident-of-scheduling/#2-the-chain)
found to have no representation.

So the object [Part 3](/articles/scope-dissolution-accident-of-scheduling/) identified as missing already has a name, and the mechanism for
deriving per-participant views from it already has a name and a compiler.

### 7.2 What the formalism does not supply

From the verified abstract of [*Comprehensive Multiparty Session Types*](https://arxiv.org/abs/1902.00544)
(arXiv:1902.00544), the formalism "describes the interactive structure of **a fixed
number of components**". An enterprise system's participant set is open and grows
independently, team by team; a global type cannot be written for a fixed participant
set. The same paper reports a second barrier in its own field: proliferating variants
with overlapping features and no consolidated core.

The remaining gap can therefore be stated as a specification rather than an
aspiration:

> What is required is a **global artefact that remains versionable, incrementally
> adoptable, and continuously machine-checkable under a participant set that is open
> and independently growing.**

Each qualifier is a distinct engineering requirement:

| Qualifier | What it demands |
|---|---|
| **Versionable** | The artefact is a published dependency with a version, not a cluster-global singleton ([Part 2 §3](/articles/scope-dissolution-no-place-for-a-promise/#3-the-specimen-custom-resource-definitions)) |
| **Incrementally adoptable** | Consumers take up a new version **on their own next deployment**, not at a synchronised flag day. Pinned versions are what make this possible |
| **Continuously machine-checkable** | Producer and consumer are typed **at both ends** by one compilation unit, so that a mismatch is a compile error rather than an incident |

The third is what the mutually recursive generic constraints of [Part 2 §4.3](/articles/scope-dissolution-no-place-for-a-promise/#43-which-layer-binds) exist to
do: a consumer parameterised by both the consuming and the producing component type
makes a wiring relation checkable at both ends.

### 7.3 Where the coupling goes

[Part 2 §7](/articles/scope-dissolution-no-place-for-a-promise/#7-the-keystone-the-boundary-where-typing-dies-is-where-loose-coupling-lives) established that loose coupling never meant "no shared artefact" but
"share the interface, not the implementation", and that the industry implemented it
as *not declaring the coupling* — which is unspecified coupling, not loose coupling.

The consequence for this prescription is that it does not reduce coupling and should
not claim to:

| | Undeclared coupling | Declared coupling (shared contract) |
|---|---|---|
| Cost now | **Zero** | A versioning burden |
| Cost later | Invisible, unquantifiable, amortised into incidents | **Visible and manageable** |
| **Quantity of coupling** | **Unchanged** | **Unchanged** |

The choice is between **visible and invisible coupling**. The amount does not fall
because one declines to declare it. And the price of visibility is the fan-out cost
in §8.

---

## 8. Honest boundaries

This section is not a disclaimer. The series' claim to be an engineering argument
rather than advocacy rests on it.

**1. `World → Data` is irreducible.** Real state and a real traffic distribution
cannot be instantiated. The practical reach of the whole approach is therefore
bounded by **the least instantiable dependency**: a data store holding
production-volume data, a rate-limited third-party sandbox, a mainframe. This
predicts where the approach will meet the most resistance — data-intensive systems
and those heavily bound to third parties — and that prediction is not hedged.

**2. Accountability topology does not yield to technique.** If one team is on call
for the entire estate, a central control plane will be rebuilt regardless of how
clean the model is, because such a console is the dual of that responsibility
([Part 3 §11](/articles/scope-dissolution-accident-of-scheduling/#11-the-persistence-mechanisms)). This is an organisational limit, not a technical one, and nothing here
addresses it.

**3. `Request → World` remains a runtime mechanism, and properly so.** The canary
predicate is statistical and has arity two (§2.1); it cannot be moved to compile
time. The remedy makes both arms independently instantiable and debuggable. It does
not make the comparison static.

**4. Fan-out is a real cost.** N worlds means a security patch must be applied N
times. This — not merge difficulty — is the true name of the pressure to converge
([Part 2 §6.2](/articles/scope-dissolution-no-place-for-a-promise/#62-consequently-the-branch-degenerates-and-the-trunk-becomes-a-mutex)). It is addressable, by a shared tip with fast-forwarding rather than N
divergent commits, and by version-pinned staged propagation. But it requires
**machinery**; in the absence of that machinery the pressure to converge is rational
and should not be argued against.

**5. A world as a first-class value is a *conditional* requirement.** If one
genuinely needs a single production world, ambient environment input is entirely
sufficient and promoting the world to a value inside the type system is unnecessary
complexity. The requirement arises when **N worlds must coexist**: per customer, per
region, per-branch development, long-lived experiments. **Establish that N is needed
before paying.** Arguing the converse is selling.

**6. L4 — failure and time — is outside this and irreducible.** Type agreement does
not address partitions, reordering or partial failure. Any reading of this series as
"typed contracts make distributed systems simple" is a misreading; the claim is only
that **L3 is the one layer of four that was abandoned without necessity.**

**7. The series is orthogonal to container orchestration versus serverless
functions.** Replacing one with the other does not change a word of the argument:
functions plus queues plus managed tables are wired together by resource
identifiers in infrastructure code — equally untyped, undeclared and unchecked. Not
taking a side here is both honest and strategic, since attaching a structural
argument to a contestable platform preference hands critics a target; and the fact
that the conclusion is invariant along that axis is itself evidence that the defect
lies elsewhere.

**8. No data is offered.** Nothing in four parts establishes the magnitude of any
effect. §10 lists what would have to be counted.

---

## 9. Why any of it matters

[Part 2](/articles/scope-dissolution-no-place-for-a-promise/) gave modularity its strongest justification, from [Simon (1962)](https://faculty.sites.iastate.edu/tesfatsi/archive/tesfatsi/ArchitectureOfComplexity.HSimon1962.pdf): "hierarchic
systems will **evolve far more quickly** than non-hierarchic systems of comparable
size", with near-decomposability — interactions within subsystems exceeding
interactions between them by orders of magnitude — as high cohesion and loose
coupling formalised.

Modularity, in that account, is not tidiness. It is **the precondition of evolution
by variation and selection**. Evolution requires three things simultaneously:

| Precondition of evolvability | Where it was lost | Current state |
|---|---|---|
| **Modular boundaries**, so that variation is local rather than fatal | L3 contracts (Parts [1](/articles/scope-dissolution-checker-never-caught/)–[2](/articles/scope-dissolution-no-place-for-a-promise/)) | Enforced by no machine |
| **Variation is cheap** | `Ref → World` (§4–§5) | Expensive: an alternative can be argued but not demonstrated ([Part 3 §6.2](/articles/scope-dissolution-accident-of-scheduling/#62-better-proposals-cannot-be-made-because-they-cannot-be-shown)) |
| **Selection can compare variants** | The canary predicate (§2.1) | Invalidated: treatment and control share every confounder |

All three are compromised. Hence the final form of the diagnosis:

> The terminal condition is not inefficiency, and not a high incident rate. **It is
> that the system has lost the preconditions of evolution.**

And [Part 3 §12](/articles/scope-dissolution-accident-of-scheduling/#12-stagnation-is-an-equilibrium) explains why that condition is **stable**: variation cannot be
demonstrated, so architecture is settled by authority rather than demonstration, so
the remedy chosen is process, so variation becomes more expensive still. Stagnation
is not negligence. It is an equilibrium.

There is one piece of evidence that bears on the attribution, and it is available
without any new measurement:

> **Open-source forking flourishes. Architectural alternatives inside enterprises
> are close to extinct. Same people, same tools, same languages.** The difference is
> whether, having forked, you can instantiate the result yourself.

Open-source projects are self-contained and independently buildable by the forker,
so trying another path is an action one can take. Enterprise deployment depends on
shared environments one does not control, so an alternative can only be argued.

This locates the problem somewhere actionable: not in will, not in language, not in
degree of process discipline, but in **a specific and changeable property — whether
a world can be instantiated.**

A final note on vocabulary, since [Part 3 §7.2](/articles/scope-dissolution-accident-of-scheduling/#72-a-terminological-correction-this-is-not-chaos) raised it. Two distinct uses of
"branch" have been conflated throughout the industry's discussion of this, and the
conflation does real damage: **short-lived pull-request branches are alive and
well; what is extinct is the long-lived branch that denotes a deployable
alternative world** — a branch as *a variant to be selected* rather than *a patch in
flight*.

---

## 10. What would have to be measured

The series offers mechanisms and the means to test them. It offers no data. In order
of value:

1. **The remedy, not the diagnosis.** In an organisation that made worlds
   instantiable, did the rate of architectural proposals rise ([Part 3 §13](/articles/scope-dissolution-accident-of-scheduling/#13-falsification), item 8)? This is
   the only measurement that tests the prescription, and **it has not been
   performed.** A null result refutes the identification of the intervention point.
2. **Typed against untyped cross-service references.** In repositories using
   schema-based interface definitions, classify each cross-service reference as a
   typed payload or an untyped target address. The prediction ([Part 1 §11](/articles/scope-dissolution-checker-never-caught/#11-falsification), item 3) is that
   the latter is almost entirely untyped.
3. **Rename propagation** correlating with shared compilation units and not with
   distribution ([Part 1 §11](/articles/scope-dissolution-checker-never-caught/#11-falsification), item 4).
4. **Per-branch environment prevalence**, which would settle whether cost was ever
   the binding constraint ([Part 2 §9](/articles/scope-dissolution-no-place-for-a-promise/#9-falsification), item 5).
5. **Vocabulary colonisation** in architectural discussion ([Part 3 §13](/articles/scope-dissolution-accident-of-scheduling/#13-falsification), item 6).
6. **Post-incident cause classification**, to test whether architectural causes are
   structurally absent ([Part 3 §13](/articles/scope-dissolution-accident-of-scheduling/#13-falsification), item 4).

Items 2–6 test the diagnosis and could be answered with existing corpora. Item 1
requires a longitudinal study and is the one that matters.

---

## 11. Summary

The mechanism, once:

> Software engineering's guarantees were, with a single exception, intra-process.
> Distribution dissolved every checker's scope. The exception was the interface
> definition language, and software engineers discarded it themselves. A second
> cross-boundary checker existed in the research literature, with compilers, and was
> never adopted — for a reason that literature states: it assumes a fixed participant
> set. Nothing was rebuilt at the new scope, and the vacuum was filled by a model
> whose relation primitive is a runtime query over mutable strings, which has no
> position in it for a promise.

The diagnosis, in the vocabulary of the tradition that was set aside:

> **We adopted one bounded context's model as the global model, and skipped the
> context map.**

The prescription, bounded as in §8:

- Make cross-service wiring a **compile-time type** rather than a string resolved at
  reconciliation — that is, place the wiring in a compilation unit on which both
  sides depend. This does not violate loose coupling: loose coupling means sharing
  the interface, not the implementation. What is practised today is *not declaring
  the coupling*, which is a different thing.
- Make an environment a **value indexed by a ref** rather than a globally mutable
  slot. Determinism and isolation follow; they are not separate features.
- Make **the intent of a divergence** a declarable first-class citizen rather than a
  naming convention.

The first two are a return to the discipline's own instruments — types and
functions — and they require a language with genuine abstractive power, which is not
negotiable. The third is the one this generation has not yet built.

And the reason to bother, which is neither efficiency nor reliability:

> Modularity exists so that variation may be local, cheap, and survivable. It is the
> precondition of evolution. Three preconditions, all compromised, is not a system
> that is harder to work in. It is a system that can no longer evolve.

---

## References

Verified across the series:

- Waldo, J., Wyant, G., Wollrath, A., Kendall, S. (1994). [*A Note on Distributed
  Computing*](https://waldo.scholars.harvard.edu/publications/note-distributed-computing). Sun Microsystems Laboratories, SMLI TR-94-29; [open
  PDF](https://sites.cc.gatech.edu/classes/AY2010/cs4210_fall/papers/smli_tr-94-29.pdf).
- Simon, H. A. (1962). [The Architecture of Complexity](https://faculty.sites.iastate.edu/tesfatsi/archive/tesfatsi/ArchitectureOfComplexity.HSimon1962.pdf). *Proceedings of the
  American Philosophical Society*, 106(6), 467–482.
- [*Comprehensive Multiparty Session Types*](https://arxiv.org/abs/1902.00544). arXiv:1902.00544.
- Kubernetes documentation, [*Extend the Kubernetes API with
  CustomResourceDefinitions*](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/).
- Wikipedia (secondary sources; primary references preferred throughout):
  [*Kubernetes*](https://en.wikipedia.org/wiki/Kubernetes) ·
  [*Session type*](https://en.wikipedia.org/wiki/Session_type) ·
  [*Choreographic programming*](https://en.wikipedia.org/wiki/Choreographic_programming) ·
  [*Fallacies of distributed computing*](https://en.wikipedia.org/wiki/Fallacies_of_distributed_computing) ·
  [*Microservices*](https://en.wikipedia.org/wiki/Microservices).
- Reference implementation: `ondemandenv/odmd-contracts-base` at commit
  [`5068891923d0`](https://github.com/ondemandenv/odmd-contracts-base/blob/5068891923d0c857eada9dea196b8e9fa48db469/lib/model/odmd-build.ts#L16); the excerpts used in [Part 2 §4.3](/articles/scope-dissolution-no-place-for-a-promise/#43-which-layer-binds)
  are permalinked there.
- Honda, K., Yoshida, N., Carbone, M. (2008). [Multiparty Asynchronous Session
  Types](https://doi.org/10.1145/1328438.1328472). *POPL '08*; [*JACM*](https://doi.org/10.1145/2827695); [PDF](https://www.doc.ic.ac.uk/~yoshida/multiparty/multiparty.pdf).
- Puppet documentation, [*Catalog compilation*](https://www.puppet.com/docs/puppet/7/subsystem_catalog_compilation.html).

To be supplied before publication:

- The binary session type origin (Honda and successors); Scribble; a
  behavioural-types survey.
- Brooks on essential and accidental complexity; Parnas (1972) on information
  hiding; Evans (2003) on domain-driven design.
- Primary sources for CORBA IDL, DCE, RMI, WSDL, Thrift, Protocol Buffers; for
  Chef and Ansible desired-state semantics (Puppet verified); for service-mesh routing
  resources; for chaos-engineering and cloud-cost-management institutional
  histories.
- Any empirical software engineering literature bearing on §10 items 2–6, which this
  series has not surveyed.

---

### Series: Scope Dissolution in Distributed Software Engineering

- **Part 1: [The Checker That Was Never Caught](/articles/scope-dissolution-checker-never-caught/)** — Every verification guarantee software engineering acquired was intra-process. Distribution dissolved each checker's scope; the one checker that had crossed the boundary — the interface definition language — was discarded by software engineers themselves, and a second, worked-out formalism was never picked up at all.

- **Part 2: [No Place to Put a Promise](/articles/scope-dissolution-no-place-for-a-promise/)** — The prevailing model's primitive for relating things is a runtime query over mutable strings, which has no position in it for a promise. Four categories of information consequently degrade into media nothing checks — and the boundary at which typing dies is exactly the boundary along which loose coupling lives.

- **Part 3: [An Accident of Scheduling](/articles/scope-dissolution-accident-of-scheduling/)** — The symptom chain as seen from a desk: per-repository pipelines, review as social adjudication, rational passivity, an uncomputable test matrix, and coping disciplines that professionalise manual reconstruction. Why a defect of this shape is structurally exempt from the organisation's own diagnostics.

- **Part 4: [A World Is a Value](/articles/scope-dissolution-world-is-a-value/)** — The remedy: named singletons become a type with instantiation, cross-service wiring becomes a compile-time type, and the intent of a divergence becomes declarable. Stated with the quantifier argument that makes the cheap universal layer non-substitutable — and with an explicit list of what remains irreducible. *(this article)*
