---
layout: article
title: "The Checker That Was Never Caught: Scope Dissolution in Distributed Software Engineering"
description: "Part 1 of \"Scope Dissolution in Distributed Software Engineering.\" Software engineering's power came from checkers, and every one of them was intra-process. Distribution dissolved each checker's scope, and the industry did not rebuild them at the new scope. The single checker that had crossed a process boundary — the IDL — was discarded by software engineers themselves; a second, with working compilers, was never adopted, for a reason its own literature states."
permalink: /articles/scope-dissolution-checker-never-caught/
date: 2026-09-19
author: "Gary Yang"
tags: ["distributed-systems", "type-systems", "session-types", "interface-definition-language", "software-engineering", "verification", "microservices"]
---

# The Checker That Was Never Caught

### Scope dissolution in distributed software engineering

*Part 1 of a series of four. This part establishes the mechanism: what the
monolithic era's checkers guaranteed, how distribution dissolved each one's
scope, and the two cross-boundary checkers the field had available — one
discarded by software engineers themselves, one never picked up. [Part 2](/articles/scope-dissolution-no-place-for-a-promise/) examines
a model with nowhere to put a shared contract; [Part 3](/articles/scope-dissolution-accident-of-scheduling/) the symptoms and
organisational consequences; [Part 4](/articles/scope-dissolution-world-is-a-value/) the prescription and its limits.*

---

## 1. The claim

Software engineering acquired its power from checkers: compilers, type systems,
refactoring engines, debuggers, transaction managers. Each of these is a machine
that rejects a program, or a change to a program, before a human has to reason
about it. And each of them has a **scope** — a region of the system inside which
it can make a guarantee, and outside which it says nothing.

For roughly two decades, one scope was almost never discussed because it was
almost never violated: the boundary of the checker coincided with the boundary of
the system. A single deployable artefact and a single schema meant that the
architecture of the system was expressed in a type system and a data definition
language, and both of those had automatic checkers.

Distribution dissolved that coincidence. Every checker's scope stopped at the
process boundary, and the industry did not rebuild the checkers at the new scope.

This paper makes a narrower claim than "distributed systems are badly
engineered". It claims the following:

> There was exactly one checker that had ever crossed a process boundary — the
> interface definition language — and software engineers discarded it themselves.
> A second such checker existed in the research literature, with working
> compilers, and was never picked up at all.

The second half of that sentence changes the question the field should be asking.
If a worked-out formalism with a compiler has been available for decades and was
not adopted, then "what formalism do we need?" is the wrong question. The right
question is why an available formalism was not *adoptable*, and what would make
it so. Section 8 gives a verified answer to the first half of that question; the
remainder of the series addresses the second.

---

## 2. What this is not

**It is not a claim that things used to be better.** The monolithic era did not
solve distributed systems; it avoided them. Comparing "guarantees over a small
scope" with "no guarantees over a large scope" is not a like-for-like comparison,
and an argument that depends on it is nostalgia.

The defensible form of the claim requires no absolute loss at all:

> The problem grew — distribution became the default deployment model, service
> counts and system sizes increased. Verification capability did not follow.
> Relative to the problem, capability declined, and this requires nobody to have
> become worse at anything.

This distinction matters for what the paper can and cannot establish. It can
establish a *direction* by argument. It cannot establish a *magnitude* without
measurement, and no measurement is offered here. Section 11 lists what would have
to be counted.

It is also worth noting, since it bears on the framing, that the argument is not
new. Waldo et al. made the scale-dependent version of it in 1994:

> "These failures have been **masked in the past by the small size** of the
> distributed systems that have been built. In the **enterprise-wide distributed
> systems** foreseen in the near future, however, such a **masking will be
> impossible**." ([Waldo et al. 1994](https://waldo.scholars.harvard.edu/publications/note-distributed-computing); [open PDF](https://sites.cc.gatech.edu/classes/AY2010/cs4210_fall/papers/smli_tr-94-29.pdf))

### 2.1 Four layers

The argument concerns one layer out of four, and conflating them produces most of
the bad arguments in this area. The layers are kinds of question, not levels of
abstraction:

| Layer | The question it asks | Last two decades |
|---|---|---|
| **L1** Resource description | What should this machine / bucket / volume look like? | Substantial progress |
| **L2** Domain modelling | What is this component, what does it promise, which compositions are legal? | **Not lost** — still done in Java, TypeScript, etc. |
| **L3** Cross-boundary agreement | Is the type on my side *the same type* as the one on yours? | **Regressed** |
| **L4** Failure and time | Partial failure, reordering, concurrency without a shared clock | Modest progress; irreducible |

Only L3 is the subject of this paper. L4 is not reducible — no type discipline
prevents a network partition, and Waldo et al.'s four obstacles (latency, memory
access model, concurrency, partial failure) live there. L1 has improved. L2 was
never lost. **L3 is the one layer for which a solution existed and was
abandoned**, which is why it is the only one this paper treats as a regression.

### 2.2 Dating

Two dates are verified. Kubernetes was announced on 6 June 2014 and reached v1.0
in July 2015. The term "microservices" is considerably older than usually
assumed: Peter Rodgers presented "Micro-Web-Services" at the Web Services Edge
conference in 2005 ([Wikipedia, *Microservices*](https://en.wikipedia.org/wiki/Microservices)), describing composition "using Unix-like pipelines (the Web
meets Unix = **true loose-coupling**)". The 2014 popularisation is not the
coinage.

Two consequences follow. First, the cause under discussion is roughly twenty
years old, not ten; the last decade is when its consequences became universal,
because Kubernetes made distribution the default deployment substrate even for
systems that did not require it. Second — and this matters for [Part 2](/articles/scope-dissolution-no-place-for-a-promise/) — *loose
coupling was named as the goal at the moment of coinage*. The goal was written
down. The mechanism for declaring the coupling was never built.

Remaining dates in this paper (SOA c. 2004; the REST/JSON turn c. 2005–2010) are
approximate and unverified; no argument here depends on them.

---

## 3. What the monolithic era actually had

The relevant property of the Tomcat-and-Oracle era was not simplicity. It was
this: **the entire system fell inside the scope of every checker.**

| Guarantee relied upon | Enforced by | Scope |
|---|---|---|
| Type correctness | Compiler | One compilation unit |
| Rename updates all callers | IDE / refactoring engine | One compilation unit |
| A call stack exists; single-stepping works | Debugger | **One address space** |
| Encapsulation (`private`, package) | Compiler | One artefact |
| Atomicity, consistency | Transaction manager | **One database** |
| A unit can be instantiated and tested | Test runner | One process |
| A developer holds a complete instance of the system | "my machine" | One machine |

One deployable and one schema. The architecture was therefore expressible in a
type system plus a data definition language, and both had automatic checkers.

This coincidence appears to have been accidental, and it was rarely named. As far
as I have been able to establish, no design document of the period states "our
architecture is verifiable because the system boundary happens to equal the
compilation unit boundary." The interpretation that it went unnamed and therefore
unmourned is mine and is not established fact; a falsifiable version of it
appears in [Part 3](/articles/scope-dissolution-accident-of-scheduling/).

---

## 4. The dissolution

Distribution dissolved each checker's scope. What remains at the process boundary:

| Original guarantee | What is left across the boundary |
|---|---|
| The compiler's type guarantee | Stops at the process edge; outside it there are bytes |
| Rename updates callers | Renaming an endpoint updates **nothing** — unless both sides are generated from one IDL, which is the artefact this paper is about |
| The call stack is an object | It is not; it is reconstructed after the fact by distributed tracing |
| ACID | In mainstream practice, replaced by sagas: the guarantee is given up and compensation is hand-written. (2PC/XA and systems such as Spanner do provide cross-node ACID, at a cost in coupling, latency and price. So this is abandonment, not impossibility.) |
| Encapsulation | Anyone may call your endpoint; encapsulation becomes an aspiration |
| Unit tests | Upstreams are mocked, and a mock is an assumption about the other side. Consumer-driven contract testing can verify that assumption — one of the few cases where a checker *was* rebuilt at the new scope, and still a minority practice |
| I hold a complete instance of the system | A queue for shared staging |

There is a single pattern underneath this table, and it is the technical core of
the paper:

> **Every constructive guarantee was replaced by an observational
> reconstruction.**

| Constructive | Replaced by | Change in kind |
|---|---|---|
| Type checking | Integration tests, canary releases | From *proving absence* to *sampling for presence* |
| The call stack | Distributed tracing | From *structure* to *samples stitched together afterwards* |
| Transactions | Sagas and compensation | From *system guarantee* to *hand-written business logic* |
| Refactoring | Grep and a coordination meeting | From *tool guarantee* to *human discipline* |

Constructive guarantees are universally quantified, and — given a language that
already has a type system — carry marginal cost near zero. Observational
reconstructions are existentially quantified and expensive. The field exchanged
the former for the latter and described the exchange as progress.

---

## 5. Two axes of coupling

Before the historical argument, one distinction is needed, because without it the
history reads as a single decline rather than as two independent failures.

Coupling has at least two axes:

| Axis | Tight | Loose |
|---|---|---|
| **Declarative** — is the dependency explicit? | Undeclared | Declared in a shared contract |
| **Temporal** — does the caller's liveness depend on the callee's? | **Synchronous** | **Asynchronous / message-based** |

Synchrony is not a performance property. A synchronous call binds the caller's
ability to proceed to the callee's availability; that is *temporal* coupling. The
network is physically asynchronous and lossy. The method-call abstraction is
synchronous and total.

This is the unifying root of Waldo et al.'s four obstacles, and it lets the
history be stated in two dimensions rather than one:

| | Temporal axis | Declarative axis |
|---|---|---|
| **CORBA / RMI / DCOM** | ✗ synchronous | **✓ IDL present** |
| **REST / JSON over HTTP** | ✗ still request/response | ✗ **IDL discarded** |
| Event-driven with typed schemas | **✓** | **✓** |

The field went from one axis right to neither, then recovered part of the
temporal axis — queues, event-driven designs, eventual consistency — while the
declarative axis remains empty. This explains why event-driven architecture felt
like real progress: it *was* real progress, on an axis that had also been wrong.
It also disposes of one objection in advance: "we are already event-driven" is an
answer about the temporal axis, and this paper is about the declarative one.

---

## 6. The datable decision

The field did once possess a cross-boundary checker. The following list and its
dates are from my own knowledge and are **not verified**: CORBA IDL, DCE, Java
RMI, WSDL/SOAP, Thrift, Protocol Buffers.

WSDL in particular was a machine-checkable definition of a cross-process
interface, with code generation, from which both endpoints were derived. It did
the thing that gRPC and OpenAPI are now used to do.

It was traded for a human-readable, untyped convention: JSON over HTTP.

**The reasons were good, and pretending otherwise makes this section a
complaint.** XML was painful; the WS-\* specification family was baroque; the
tooling was heavy; there was vendor lock-in and the political cost of enterprise
middleware. REST's victory was a genuine and deserved ergonomic victory.

What went out with it was the machine-checkable cross-process interface. This was
a decision taken by software engineers, about their own tools. It was not imposed
by anyone else.

### 6.1 Convergence, not response

A first draft of this section argued that gRPC, GraphQL and OpenAPI were "three
independent re-inventions in response to the loss," and offered that as evidence
that the loss was felt. That argument attributes a motive to three projects, and
the attribution is wrong. Their stated origins differ (the following are
unverified in detail, but the direction is sufficient to withdraw the original
claim):

| Project | Origin, as best I understand it | "Response to the loss of the IDL"? |
|---|---|---|
| gRPC / Protocol Buffers | Google's internal Stubby; Google **never abandoned the IDL** | **No** — this is the export of something never lost |
| GraphQL | Facebook's mobile data-fetching problem: over-fetching, round trips | **No** — the schema is a means, not the goal |
| OpenAPI / Swagger | API documentation and exploration, later a specification | Closest, but still not "we miss WSDL" |

A weaker and more interesting claim survives, and it is better evidence than the
one it replaces:

> Three paths with unrelated motives all ended up delivering the same artefact: a
> machine-readable schema.

That is convergence, not response — and convergence is the stronger argument. If
three teams set out towards three unrelated goals and all found themselves
obliged to produce a schema, the schema is a requirement of the task, not an
artefact of anyone's nostalgia.

The gRPC row also supplies an incidental observation worth stating plainly: **the
one organisation that never discarded the IDL was Google, and it subsequently
handed the practice back to the industry.** That is not a re-invention.

To refute this section, one would have to show that these three do not in fact
deliver machine-readable schemas, or that those schemas carry no contractual
role. Motive is no longer part of the argument and cannot be used against it.

### 6.2 What the restored IDLs still do not type

All three share one gap:

> The restored IDLs type the **payload**. None of them types the **topology**.

`Message → Message` is type-safe. *Which service, in which environment, at which
address* remains an untyped string in configuration. Each also has individual
gaps — OpenAPI is commonly generated from, or drifts from, the code and is rarely
a build-time gate; GraphQL checks shape but not wiring; gRPC gives a typed call
but resolves its target through untyped configuration (these three are
**unverified** and should be checked individually).

Contract typing was therefore completed by half. The content was typed. The
wiring was not.

---

## 7. The second non-adoption

The three instances above concern the industry discarding something it had. There
is a fourth instance, and it is the hardest to excuse, because the artefact was
never taken up in the first place.

The primary reference for the multiparty case is now supplied: Honda, Yoshida and
Carbone, [**Multiparty *Asynchronous* Session Types**](https://doi.org/10.1145/1328438.1328472), POPL '08
(journal version in [*JACM*](https://doi.org/10.1145/2827695); [author's PDF](https://www.doc.ic.ac.uk/~yoshida/multiparty/multiparty.pdf)). Note the
title: this line of work is asynchronous by construction, which matters in §8.
The compact definitions below are quoted from Wikipedia, a **secondary** source;
the binary-session-type origin and Scribble still require primary references.

**[Session types](https://en.wikipedia.org/wiki/Session_type):** "used to ensure correctness in concurrent programs. They
guarantee that messages sent and received between concurrent programs are **in
the expected order and of the expected type**." They provide "absence of
communication errors or deadlocks, and **protocol conformance**."

**Multiparty session types:** "interactions between all participants are
described using a **global type**, which is then **projected into local types**
that describe communication from the local view of each participant. Importantly,
the **global type encodes the sequencing information** of the communication."

**[Choreographic programming](https://en.wikipedia.org/wiki/Choreographic_programming):** "A key feature … is the capability of **compiling
choreographies to distributed implementations**." The translation is called
**endpoint projection**, and "returns a program for each role described in the
source choreography."

So: *write one artefact describing the whole interaction; have a compiler derive
each participant's implementation; obtain static guarantees of ordering, typing
and deadlock-freedom.* This exists. It is formalised. It has compilers.

What the industry built during the same period, for the same purpose, was
coordination by human message-passing in chat channels.

The consequence for this paper's thesis is that it reaches its strongest form:

> A machine-checkable formalism for cross-process contracts existed not only in
> industry (WSDL, IDL) but simultaneously in the research literature (session
> types, MPST, choreographies). **Neither was taken up.**

It also disposes of a claim I should not make. The architecture I would otherwise
have proposed — a single artefact, spanning all participants, from which each
participant's view is derived and checked — is **not novel**. It is the global
type plus endpoint projection, and it precedes this paper by decades. What
remains available to claim is a matter of *application*: the formalism has been
used for message protocols; the argument of this series is that the same
architecture is needed for **deployment contracts and topology** — who produces
what, who consumes it, in which world. The architecture is not mine. Moving it to
that layer, and dealing with what breaks when it is moved, is the contribution.

---

## 8. Why the formalism was not adoptable

If the position above is taken seriously, the interesting question is no longer
which formalism to use. It is why an available and worked-out one was not
adoptable. Speculating about that would be poor practice in a paper whose subject
is verification discipline, so: there is a primary source, and it both confirms
and refutes parts of what one would naturally guess.

From the abstract of [*Comprehensive Multiparty Session Types*](https://arxiv.org/abs/1902.00544)
(arXiv:1902.00544), quoted verbatim:

> "Multiparty session types (MST) … describes the interactive structure of **a
> fixed number of components** from a global point of view and type-checks the
> components through **projection of the global type** onto the participants…"

> "the population of the considered variants follows from only one ancestor …
> there are **overlapping traits** between features of the considered variants
> and the original. **These hamper evolution of session types and languages and
> their adoption in practice.**"

Three findings:

| Candidate barrier | Verdict |
|---|---|
| That, like distributed objects, this work imposes synchrony on an asynchronous medium | **Refuted.** Asynchronous session types exist, and work on exceptions and failure handling exists. This line of research did not repeat the remote-object error. |
| That an assumption is unrealistic | **Confirmed, and specifically:** "a fixed number of components". An enterprise system's participant set is open and grows independently, team by team. A global type cannot be written for a fixed participant set. |
| Fragmentation of the theory itself | **The paper's own stated barrier**: variants proliferating from a single ancestor with overlapping features and no consolidated core. |

The second finding and the governance question are the same problem seen from two
sides. When the participant set changes, the global type must be revised. *Who
owns that revision, and how do N independently-owned teams adopt it without a
flag day*, is a question the formalism does not address.

The third finding deserves note for a different reason: it is the same disease
this paper attributes to industry, occurring inside the research literature. In
the absence of a consolidated canonical core, everyone uses their own variant and
the variants do not compose.

The target can therefore be stated as a specification rather than an
exhortation:

> What is missing is a **global artefact that remains versionable, incrementally
> adoptable, and continuously machine-checkable under a participant set that is
> open and independently growing.**

Each of those three qualifiers is a distinct engineering requirement, and the
remainder of the series is about the machinery that satisfies them.

---

## 9. The same shape, four times

A single instance can be an accident. The same shape occurs four times:

| Dimension | Machine-checkable formalism discarded (or never adopted) | Ergonomic informalism adopted instead | The check |
|---|---|---|---|
| Service contracts | WSDL / CORBA IDL | REST + JSON | **Gone** |
| Design notation | UML | Freehand boxes and arrows in diagramming tools | **Gone** |
| Boundary relationships | DDD Context Mapping | Chat messages; compatibility matrices in wikis | **Gone** |
| **Cross-process protocol** | **Session types / MPST / choreographies** | Human coordination | **Never present** |

In each case the reasons were sound. XML and WS-\* were painful. UML had fourteen
diagram types, round-trip engineering that never worked, an over-promising
model-driven-architecture programme, and heavy vendor-locked tooling. Context
mapping requires continuous maintenance. Behavioural types are, by the admission
of their own literature, fragmented. **Abandoning these was not stupidity.**

The omission is the same every time:

> The field systematically exchanged machine-checkable formalisms for ergonomic
> informalisms, and did not rebuild the check in any instance.

The way UML partially survived supplies a testable diagnostic:

> A notation survives only where something checks it.

What survived: class structure, which moved into type systems and is checked by
compilers; parts of sequence diagrams, which moved into distributed tracing. What
died: everything that required a **separate artefact** to exist. Survival
correlates with the existence of a checker that consumes the notation, not with
expressiveness, elegance, or pedagogical value.

Successors exist in the notation dimension — C4, arc42, Structurizr and other
diagrams-as-code approaches. Consistent with §6.1, I make no claim about their
motives. The observable commonality is formal: they move diagrams towards text,
into repositories, and into a form that can be diffed — that is, towards being
checkable by something.

---

## 10. The reframed question

The mechanism of the regression, stated once:

> Software engineering's guarantees were, with a single exception, intra-process.
> Distribution dissolved every checker's scope. The exception was the interface
> definition language — the one checker that had genuinely crossed the boundary —
> and it was discarded by software engineers themselves. A second cross-boundary
> checker existed in the research literature, with compilers, and was never
> adopted; its own literature reports why. Nothing was rebuilt at the new scope.

Two things follow for the rest of this series.

The first is a constraint on the shape of any solution. The reason the guarantee
does not cross the boundary is not a defect of any particular tool:

> A type is a purely compile-time artefact. It exists in the compiler's judgement,
> not in the running program. Crossing a process boundary serialises a *value*;
> the type does not travel with it.

Both sides therefore compile independently, both have types, and nothing
guarantees the two types are the same. TypeScript can give `getParam('/foo/bar')`
a type; it cannot check that the key exists, that anyone has declared they
produce it, or that its shape matches. The remedy is accordingly not a more
expressive language — full-strength languages have been applied to this problem
and the boundary still degrades to strings — but to **bring the boundary back
inside a single compilation unit**. That is what an IDL does, and what endpoint
projection does.

The second is the question this series exists to answer. Since the formalism is
not what is missing, and since its own literature identifies the barrier as an
assumption of a fixed participant set, the question is:

> **How does a shared global artefact survive independent ownership?**

[Part 2](/articles/scope-dissolution-no-place-for-a-promise/) examines what happens in a model that has no place to put such an artefact
— four categories of information that the prevailing model cannot express, and
the unchecked media each of them degrades into. [Part 3](/articles/scope-dissolution-accident-of-scheduling/) turns to symptoms and
organisational consequences, and to why a defect of this shape is structurally
exempt from an organisation's own diagnostic apparatus. [Part 4](/articles/scope-dissolution-world-is-a-value/) states the
prescription and its limits.

---

## 11. Falsification

The claims above are not offered as interpretation. Each can be attacked as
follows.

1. **The double non-adoption (§6, §7).** Show that WSDL and its relatives did not
   provide machine-checkable cross-process interfaces, or that session types and
   choreographies do not deliver the static guarantees quoted, and the central
   claim fails.
2. **Convergence (§6.1).** Show that gRPC, GraphQL and OpenAPI do not in fact
   deliver machine-readable schemas, or that those schemas carry no contractual
   role.
3. **Payload-but-not-topology (§6.2).** In repositories that use gRPC or OpenAPI,
   count cross-service references and classify each as a typed payload or as an
   untyped target address (URL, ARN, parameter-store key). The prediction is that
   the latter is almost entirely untyped. A balanced result refutes the claim.
4. **Rename propagation (§4).** Propagation should correlate exactly with whether
   both sides derive from one compilation unit, and not at all with whether the
   system is distributed. In a repository with no shared IDL, renaming a
   cross-service endpoint should update zero callers; where both sides are
   generated from one schema, changing the schema and regenerating should update
   both, with breaking changes caught in CI. If the second case also fails to
   propagate, the mechanism offered here is wrong.
5. **Notation survival (§9).** Identify a notation that persisted in practice with
   no checker consuming it.
6. **Magnitude.** Nothing in this paper establishes the size of the effect. The
   counts in (3) are the minimum required to do so, and they have not been
   performed here.

---

## References

Verified:

- Waldo, J., Wyant, G., Wollrath, A., Kendall, S. (1994). [*A Note on Distributed
  Computing*](https://waldo.scholars.harvard.edu/publications/note-distributed-computing). Sun Microsystems Laboratories, SMLI TR-94-29.
  ([Open PDF](https://sites.cc.gatech.edu/classes/AY2010/cs4210_fall/papers/smli_tr-94-29.pdf). The author's own page serves 403 to automated
  clients but loads in a browser.)
- Simon, H. A. (1962). [The Architecture of
  Complexity](https://faculty.sites.iastate.edu/tesfatsi/archive/tesfatsi/ArchitectureOfComplexity.HSimon1962.pdf).
  *Proceedings of the American Philosophical Society*, 106(6), 467–482. (Quoted in
  [Part 2 §8](/articles/scope-dissolution-no-place-for-a-promise/#8-why-any-of-this-matters-modularity-is-for-evolvability).)
- [*Comprehensive Multiparty Session Types*](https://arxiv.org/abs/1902.00544). arXiv:1902.00544.
- Deutsch, L. P. (1994). [The fallacies of distributed
  computing](https://en.wikipedia.org/wiki/Fallacies_of_distributed_computing);
  eighth fallacy added by J. Gosling c. 1997. (No established causal relation to
  Waldo et al. — see §7.)
- Honda, K., Yoshida, N., Carbone, M. (2008). [Multiparty Asynchronous Session
  Types](https://doi.org/10.1145/1328438.1328472). *POPL '08*, DOI
  10.1145/1328438.1328472; [*JACM* version](https://doi.org/10.1145/2827695), DOI
  10.1145/2827695; [PDF](https://www.doc.ic.ac.uk/~yoshida/multiparty/multiparty.pdf).

To be supplied before publication:

- The binary session type origin (Honda and successors); Scribble; a
  behavioural-types survey.
- Primary sources for CORBA IDL, DCE, RMI, WSDL, Thrift, Protocol Buffers.
- Parnas (1972) on information hiding; Evans (2003) on domain-driven design.
- Kubernetes and microservices dating currently rests on Wikipedia; primary
  sources preferred.

---

### Series: Scope Dissolution in Distributed Software Engineering

- **Part 1: [The Checker That Was Never Caught](/articles/scope-dissolution-checker-never-caught/)** — Every verification guarantee software engineering acquired was intra-process. Distribution dissolved each checker's scope; the one checker that had crossed the boundary — the interface definition language — was discarded by software engineers themselves, and a second, worked-out formalism was never picked up at all. *(this article)*

- **Part 2: [No Place to Put a Promise](/articles/scope-dissolution-no-place-for-a-promise/)** — The prevailing model's primitive for relating things is a runtime query over mutable strings, which has no position in it for a promise. Four categories of information consequently degrade into media nothing checks — and the boundary at which typing dies is exactly the boundary along which loose coupling lives.

- **Part 3: [An Accident of Scheduling](/articles/scope-dissolution-accident-of-scheduling/)** — The symptom chain as seen from a desk: per-repository pipelines, review as social adjudication, rational passivity, an uncomputable test matrix, and coping disciplines that professionalise manual reconstruction. Why a defect of this shape is structurally exempt from the organisation's own diagnostics.

- **Part 4: [A World Is a Value](/articles/scope-dissolution-world-is-a-value/)** — The remedy: named singletons become a type with instantiation, cross-service wiring becomes a compile-time type, and the intent of a divergence becomes declarable. Stated with the quantifier argument that makes the cheap universal layer non-substitutable — and with an explicit list of what remains irreducible.
