---
layout: article
title: "No Place to Put a Promise: Four Categories the Prevailing Model Cannot Express"
description: "Part 2 of \"Scope Dissolution in Distributed Software Engineering.\" The dominant model's relation primitive is a runtime query over mutable strings — a good model of a different domain, with nowhere to put a cross-service promise. Expressiveness and cost are both refuted as explanations, and four categories of information are left to degrade into unchecked media. The keystone: typing dies exactly where loose coupling lives."
permalink: /articles/scope-dissolution-no-place-for-a-promise/
date: 2026-09-19
author: "Gary Yang"
tags: ["distributed-systems", "kubernetes", "domain-driven-design", "type-systems", "loose-coupling", "gitops", "contracts"]
---

# No Place to Put a Promise

### Four categories the prevailing model cannot express

*Part 2 of a series. [Part 1](/articles/scope-dissolution-checker-never-caught/) argued that software engineering's checkers were all
intra-process; that the one checker which crossed the boundary — the interface
definition language — was discarded by software engineers themselves; and that a
second, academic checker was never adopted, for a reason its own literature
states. This part asks what happens in a model that has nowhere to put such a
thing.*

---

## 1. The question

[Part 1](/articles/scope-dissolution-checker-never-caught/) ended on a specification rather than a complaint: what is missing is a
global artefact that remains versionable, incrementally adoptable, and
continuously machine-checkable under a participant set that is open and
independently growing.

Before designing such a thing it is worth establishing why the prevailing model
has no place for it. The answer is not that the model is poorly built. It is that
the model in question is a good model **of a different domain**, and that its
relation primitive cannot carry the kind of statement a contract is.

This part makes three moves. First, that the dominant model's primitive for
relating things is a runtime query over mutable strings, which has no position in
it for a promise (§2–§3). Second, that the two explanations usually offered for
this — insufficient expressiveness, and the cost of alternatives — are both
refuted, and that the refutations locate the real constraint (§4–§5). Third, that
four distinct categories of information consequently have nowhere to live, and
each degrades into a medium nothing checks (§6). §7 states the keystone that ties
the boundary of the failure to the boundary of loose coupling, and §8 says why any
of this matters.

---

## 2. A bounded context mistaken for a global model

It is tempting to characterise the difference between the two traditions as a
difference of mindset: operations thinks in terms of machine state, software
engineering in terms of interfaces. That characterisation is correct but, stated
that way, unfalsifiable and unactionable. It can be made precise, and once precise
it becomes a claim about a model rather than about people.

### 2.1 The label selector is an ontological commitment

In object-oriented and domain-driven modelling, set membership is determined by
identity and type: an object *is* an instance of a class, and the relation is
nominal and declared. In Kubernetes, membership is determined by a query over
mutable string key–value pairs — a `Service` selects `Pod`s by `selector: {app:
foo}`.

| | DDD / OOP | Kubernetes |
|---|---|---|
| What determines membership | **Identity and type**; the relation is nominal and declared | **A runtime query over mutable string pairs** |
| "this Pod belongs to this Service" | Declared | **Inferred by matching** — there is nowhere to declare it |
| Effect of editing one label | — | **Topology changes silently**: no type error, no version, no record of intent |
| A typo in a label | Compile error | **Zero matches, and zero matches is a legal state** |

The label selector is not an incidental convenience. It is the model's *primitive
for relating things*. And a relation primitive of that form has no position in it
for "what does this thing promise to whom".

The vocabulary points the same way. `drain`, `cordon`, `taint`, `toleration`,
`evict`, `pod`, `node`, `kubelet` — every one of these names an operation on
machines and processes. None of them names what a piece of software *does*.
Whereas the entire point of a ubiquitous language, in Evans's sense (Evans 2003,
**unverified**), is that the vocabulary of the model is the vocabulary of the
domain being modelled.

So the accurate statement is not that Kubernetes failed to supply L2 or L3
semantics. It is:

> Kubernetes rests on a relation primitive that structurally cannot carry
> semantics — **and that is the correct choice for a container orchestrator.**

### 2.2 The diagnosis, in domain-driven design's own vocabulary

This permits the whole situation to be stated in the vocabulary of the tradition
that was set aside:

> Kubernetes is a **bounded context** whose ubiquitous language is "running
> processes on machines". It is internally coherent and well designed. The error
> is in having taken one bounded context's model as the global model of the
> system.

And when two bounded contexts meet, domain-driven design prescribes a **context
map**, and specifically a **published language** or translation layer. That is the
item [Part 1](/articles/scope-dissolution-checker-never-caught/) listed as discarded. It is also, exactly, L3.

The argument of this series can therefore be restated in one sentence:

> We adopted one bounded context's model as the global model, and skipped the
> context map.

This version has two advantages over the mindset formulation. It blames no one —
Kubernetes is right about its own domain — and it carries its own remedy: what is
missing is a context map, not an attitude.

### 2.3 On "mindset", stated fairly

Having reframed it, the reframing should not be overstated. A ubiquitous language
*is*, literally, a mental model shared by a group of people. The bounded-context
framing does not deny that a difference of mindset exists; it gives that
difference a definition that can be pointed at, enumerated, and tested.

| | Is "mindset" the right word? |
|---|---|
| For **describing what the difference is** | **Yes** — and now with a definition: the ubiquitous language of a bounded context |
| For **explaining why it has persisted for twenty years** | **No** — that requires mechanisms, which [Part 3](/articles/scope-dissolution-accident-of-scheduling/) supplies |

Mindset names the difference; mechanisms explain its persistence. Without the
first the phenomenon cannot be described; without the second nothing can be done
about it.

### 2.4 What the label mechanism buys

Credit where it is due, and the official description states it plainly:

> "changing the labels of the pods or changing the label selectors on the service
> can be used to support various deployment patterns like **blue–green
> deployments or A/B testing**" ([Wikipedia, *Kubernetes*](https://en.wikipedia.org/wiki/Kubernetes))

That flexibility is real. Re-routing traffic by editing a label is genuinely
useful. The price is that the relation is unverifiable — and this is the same
transaction that recurs throughout both parts of this series: **flexibility
purchased by removing a check.**

---

## 3. The specimen: custom resource definitions

The obvious objection to §2 is that Kubernetes provides an extension point
precisely so that you can add your own vocabulary: custom resource definitions,
with OpenAPI validation and admission webhooks. The objection is correct as far as
it goes, and "the operations ecosystem rejects schemas" is false.

But the decisive limitation is not that CRDs are confined to one cluster. It is
sharper than that, and [the official documentation](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/) states it:

> "The custom resource created from a CRD object can be either namespaced or
> cluster-scoped, as specified in the CRD's `spec.scope` field. …
> **CustomResourceDefinitions themselves are non-namespaced and are available to
> all namespaces.**"

That is, `spec.scope` governs the scope of custom resource *instances*. The
**definition** is a cluster-wide singleton. Consequences:

- `foo.example.com/v1` cannot have schema A in one namespace and schema B in
  another.
- Two teams cannot version the same CRD independently within their own namespaces.
- A CRD is therefore not a per-tenant extension point. It is a **cluster-global
  type registry.**

The way a CRD achieves agreement about a type is thus by making the type a
cluster-global mutable singleton. That is the operations pattern —
centralisation — and not the software engineering pattern, which is a shared
compilation unit. The difference is the subject of §5:

| | Shared compilation unit (IDL, contract library) | Cluster-global singleton (CRD) |
|---|---|---|
| N independent owners | **Compile separately, check separately, do not block each other** | Must **agree on one version at the same moment** |
| Independent versioning | Possible (each pins a dependency version) | **Not possible** |
| Effect on L3 | **Solves it** | **Avoids it by removing independence** |

So a CRD is not a counterexample to this paper. It is a specimen of its
diagnosis: an instance of a type constraint being replaced by a runtime
enforcement point. Note also that the disease appears one level up — a CRD *is* a
type, and there is exactly one instance of that type definition per cluster; the
named-singleton problem recurs at the meta level.

### 3.1 The documentation says the wiring is not checked

That CRDs validate shape but not wiring does not need to be inferred. From [the
same page](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/):

> "**All validation rules are scoped to the current object: no cross-object or
> stateful validation rules are supported.**"

"Who consumes whom", "does the target exist", "is the type on each side the same
type" — all of these are cross-object constraints. So CRDs plus CEL cannot carry
L3, **not as an implementation shortfall but by specification**.

There is an instructive counterpoint on the same page. A compile-time checker does
exist; it simply checks the wrong object:

> "Validation rules are compiled when CRDs are created/updated. The request of
> CRDs create/update will fail if compilation of validation rules fail.
> **Compilation process includes type checking as well.**"

A compiler exists, compilation happens, type checking happens — and the scope of
what may be checked is bounded to a single object, while L3 is entirely about
relations between objects.

---

## 4. Expressiveness is not the constraint — except where it is

Two explanations are usually offered for why infrastructure descriptions are not
typed. The first is that the languages are not expressive enough. The second is
that instantiating alternatives was historically too expensive. Both are wrong as
stated, and both are instructive in how they are wrong.

### 4.1 Helm's ceiling is not limited abstraction; it is uncheckable abstraction

String substitution knows nothing about the structure of the target language.
It therefore cannot guarantee even the *syntactic* validity of its output, let
alone the semantic. A typed function, by contrast, guarantees well-typedness of
its result by construction.

The diagnostic is the command everyone runs (Helm's use of Go `text/template` is
**unverified** here but widely reported):

```
helm template … | kubectl apply --dry-run
```

You must **materialise the output and re-parse it** to discover whether it works
at all. That is the definition of having no abstraction: you cannot reason
compositionally; you can only evaluate.

### 4.2 Fairness to HCL

- **CloudFormation** is the pure case: `Fn::If`, `Fn::Sub` and `Conditions`
  smuggle a lambda calculus into JSON node positions. No variables, no
  abstraction, no recursion.
- **HCL** genuinely crossed into being a language: typed variables, modules,
  expressions — and, importantly, **references produce dependency edges**, so a
  real graph exists, and `terraform plan` emits precisely the semantic diff that
  YAML lacks.
- HCL's deliberate non-Turing-completeness is a **deliberate trade**: abstraction
  power given up in exchange for totality, hence a decidable plan, hence the
  existence of a semantic diff.

That trade is right for HCL's own domain — describing individual resources — and
wrong for another: describing a domain model and its invariants. Pushing business
or architectural semantics into HCL means using a total-but-inabstractable
language for work that requires abstraction, and **there** expressiveness really
is the binding constraint.

### 4.3 Which layer binds

"Is the language expressive enough" has no single answer, because it is bound to
different layers. Using [Part 1](/articles/scope-dissolution-checker-never-caught/)'s four-layer map:

| Layer | Is expressiveness the constraint? | HCL / CFN | TypeScript + types + generics |
|---|---|---|---|
| **L1** resource description | No | **Sufficient, and totality is a virtue** | Excessive |
| **L2** domain model and invariants | **Yes — hard constraint** | **Insufficient**: no user-defined types with behaviour, no interfaces, no composable generics, no encapsulation. `for_each` plus modules is parameterised copying, not abstraction | **Necessary** |
| **L3** cross-boundary agreement | **Necessary but not sufficient** | Impossible | **Does not follow automatically** — see §5 |
| **L4** failure and time | Not an expressiveness question | N/A | N/A |

L2 is where the craft of software engineering lives, and it is the layer at which
expressiveness binds hardest. Any argument that "expressiveness does not matter"
has omitted L2 entirely — an omission this paper made in an earlier draft.

A concrete instance of L2 requiring a real language, from the reference
implementation ([`odmd-contracts-base`](https://github.com/ondemandenv/odmd-contracts-base/blob/5068891923d0c857eada9dea196b8e9fa48db469/lib/model/odmd-build.ts), at pushed
commit `5068891923d0`):

```ts
// lib/model/odmd-build.ts:16
export abstract class OdmdBuild<T extends OdmdEnver<OdmdBuild<T>>> extends Construct
// lib/model/odmd-enver.ts:89
export abstract class OdmdEnver<T extends OdmdBuild<OdmdEnver<T>>> extends Construct
// lib/model/odmd-cross-refs.ts:86
export class OdmdCrossRefConsumer<C extends AnyOdmdEnVer, P extends AnyOdmdEnVer> extends Construct
```

Permalinks: [`odmd-build.ts#L16`](https://github.com/ondemandenv/odmd-contracts-base/blob/5068891923d0c857eada9dea196b8e9fa48db469/lib/model/odmd-build.ts#L16) ·
[`odmd-enver.ts#L89`](https://github.com/ondemandenv/odmd-contracts-base/blob/5068891923d0c857eada9dea196b8e9fa48db469/lib/model/odmd-enver.ts#L89) ·
[`odmd-cross-refs.ts#L86`](https://github.com/ondemandenv/odmd-contracts-base/blob/5068891923d0c857eada9dea196b8e9fa48db469/lib/model/odmd-cross-refs.ts#L86)

The first two are mutually recursive F-bounded generics. The third parameterises a
consumer by *both* the consuming and the producing component type, so that a
wiring relation is typed at both ends. HCL cannot express these constructs in
principle.

### 4.4 The operator objection, and the half of it that holds

Against any claim that the operations tradition rejects types, there is a
counterexample inside the Kubernetes ecosystem itself: the operator and controller
ecosystem consists of operations-side engineers writing compiled, typed Go, at
scale, for years. Alongside it: `terraform plan` produces a semantic diff, and CEL
validation rules are compiled and type-checked (§3.1).

**Half of that counterexample holds, and the half that fails is more
informative.**

What holds: this population accepts formalism and machine checking, and writes
compiled languages. "They reject types" is false.

What fails: the Go in a controller is not doing L2 modelling.

| What controller code actually does | What L2 modelling requires |
|---|---|
| **Consumes** generated API types (`corev1.Pod`) | **Authors** types expressing domain invariants |
| A flat reconcile loop over a **single resource kind** | Composable type hierarchies, generics, encapsulation |
| Controllers **do not compose** with one another | Construct-of-construct composition |

So this is L1-shaped work performed in a typed language. The precise statement:

> The capability exists at the level of the language. The practice does not exist
> at the level of modelling — **and the controller model itself generates no
> demand for it.**

That is a stronger claim than the one it replaces. If the unit of work is "one
loop per resource kind", one never needs a type hierarchy, generics, or
composition. An ecosystem can therefore be full of typed Go and produce no
modelling discipline. **Tools determine which skills get exercised.**

---

## 5. Why types do not cross, and where they die

### 5.1 The mechanism

A type is a purely compile-time artefact. It exists in the compiler's judgement,
not in the running program. Crossing a process, stack, or account boundary
serialises a *value*; the type does not travel with it.

Both sides therefore compile independently, both possess types, and nothing
guarantees the two types are the same. TypeScript can give
`getParam('/foo/bar'): string` a type; it cannot check that the key exists, that
anyone has declared they produce it, or that its shape matches.

This is why the natural inference — "these DSLs are too weak, so use a real
programming language" — has already been refuted experimentally. Pulumi and the
AWS CDK have the full expressiveness of TypeScript or Python, and references
across **app**, account and ownership boundaries still degrade to parameter-store
strings and exports. Expressiveness was never the binding constraint at L3; it is
merely necessary.

### 5.2 Essential and accidental

One objection must be handled here or the whole argument collapses: *late binding
across independently deployed units is essential complexity, not a regression.*

That is correct. **Independent deployment implies late binding.** If A is deployed
at T₁ and B at T₂, under separate ownership and versioning, B cannot have A's
concrete values compiled in. Something must be resolved late.

The components must therefore be separated (using Brooks's distinction;
his original formulation is **unverified** here):

| Component of the L3 problem | Essential? | Why |
|---|---|---|
| The value is unknown when the consumer compiles | **Essential** | Definitional to independent deployment |
| Resolution happens at deploy or run time | **Essential** | As above |
| The reference **may fail to resolve** (producer not yet deployed) | **Essential** | This is already L4 |
| Whether the **key** is declared and checked | **Accidental** | Can be compile-time |
| Whether the **shape** is declared and checked | **Accidental** | Can be compile-time |
| Whether "who produces this" is **statically knowable** | **Accidental** | Can be a typed graph |

Three necessary, three contingent. The regression therefore reduces to one
sentence:

> What is late-bound is the **value**, and that is irreducible. The regression is
> that we late-bound the **contract** along with it.

The string is not the problem. An *undeclared, unshaped, unchecked* string is. The
correct form is: key and shape judged at compile time by a single declaration,
with only the value resolved late.

### 5.3 Where typing actually dies, and what follows

Credit where due: within a single CDK application, cross-stack references *are*
typed —

```ts
new StackB(app, 'b', { vpc: stackA.vpc })
```

— and CDK synthesises the underlying export/import while the reference itself is
type-checked and the graph is derived from references, exactly as in HCL within a
single state. So "CDK does not express relations between units" is false.

The truth is more interesting. **Typing dies at the *application* boundary, not at
the stack boundary.** And an application boundary is one synthesis, one pipeline,
one owner:

| Boundary | Does typing survive? |
|---|---|
| Stack ↔ stack, same app | **Yes** |
| App ↔ app (different repository, pipeline, owner) | **No** — degrades to strings |

From which the remedy can be *derived* rather than asserted:

> The range over which typing survives equals the range of the compilation unit.
> The range of the compilation unit equals the range of single ownership.
> To make types cross a boundary of independent deployment therefore requires a
> compilation unit whose scope is **at least the set of all independently deployed
> units**. Without merging ownership, there is one way to achieve this: **a
> published artefact on which all parties depend.**

**A priority concession is owed here.** This derivation is not a discovery of this
paper; it is a rediscovery. The global-type-plus-endpoint-projection architecture
of multiparty session types ([Part 1, §7](/articles/scope-dissolution-checker-never-caught/#7-the-second-non-adoption)) is the formalised version of the same
thing and precedes this work by decades. What remains to claim is the level of
application: that architecture has been used for message protocols, and the
argument of this series is that it is needed for **deployment contracts and
topology**.

### 5.4 Cost is not the explanation either

A common account of why worlds are not instantiated is material: operations'
historical unit was a physical machine, machines were scarce and slow to procure,
and so a single shared environment was forced. That account is historically true
and **insufficient**, and there is a clean natural experiment against it.

A Kubernetes namespace costs approximately nothing to create, and the official
description of namespaces includes exactly this use:

> namespaces are "intended for use in environments with many users spread across
> multiple teams, or projects, or even **separating environments like development,
> test, and production**" ([Wikipedia, *Kubernetes*](https://en.wikipedia.org/wiki/Kubernetes))

And yet per-branch namespaces remain, in my observation, rare; where preview
environments exist they are typically fed by one central continuous-delivery
installation with overlays. **That second sentence is an observation, not data.**
No public measurement is known to me; §9 states it as a prediction to be tested
rather than a fact, and if per-branch namespaces turn out to be mainstream the
argument of this section fails.

If cost were the binding constraint, driving it to zero should have changed
behaviour. Three mechanisms explain the residue, and only the third is about
people:

| Mechanism | Content | Does it dissolve when cost falls? |
|---|---|---|
| **No encapsulation, so multiplicity is managed by aggregation** | Software engineering manages N things by **abstraction** — there is an interface and you do not look inside. Operations manages N things by **aggregation** — put them all in one console, state file or cluster and enumerate. Aggregation scales by buying a bigger console; abstraction scales by **not looking** | **No** — a missing syntactic category is unrelated to cost |
| **A central control plane is a runtime substitute for a type constraint** | Unable to express "every world satisfies P by construction", the only way to guarantee P is to route everything through one gate | **No** |
| **Accountability is centralised** | One team is on call for the whole estate; a central console is the *dual* of that responsibility, not an implementation preference | **No — and this one is organisational** |

The third is a real limit on this paper's thesis and should be stated as such: if
one team is accountable for everything, they will rebuild a central console
regardless of how clean the model is. Technical correctness does not overturn an
accountability topology.

### 5.5 The genealogy of the mismatch

There is a structural gap between the reconcile model and the
declared-state-plus-plan model:

| | Chef / Puppet agent loop | Terraform / CloudFormation desired state | **Kubernetes reconcile** |
|---|---|---|---|
| Continuously running loop | ✓ | ✗ (one-shot apply) | **✓ from the procedural line** |
| Separable representation of desired state | Chef ✗ / **Puppet ✓ (catalog)** | ✓ | **✓ from the declarative line** (`spec`) |
| Recorded observed state | ✗ | ✓ | **✓** (`status`) |
| **Dependency DAG** | Chef: order within a file; Puppet: a resource graph | **✓ derived from references** | **✗ from neither** |
| **A plan before acting** | Chef ✗ / **Puppet ✓ (`--noop`)** | **✓** | **✗** |
| **Failure semantics / rollback** | ✗ | CFN ✓ | **✗** |
| **Unit of ownership** | cookbook / node | **stack** | **✗** per-resource-kind controller |

**The Puppet row is verified, and it makes the argument stronger rather than
weaker.** From Puppet's own documentation on [catalog compilation](https://www.puppet.com/docs/puppet/7/subsystem_catalog_compilation.html):

> "the agent uses a document called a **catalog** … For each resource under
> management, **the catalog describes its desired state and can specify ordered
> dependency information**."

> "Simulate changes by running the agent in **no-op mode**, checking the agent's
> current state and reporting **what would have changed without making any
> changes**."

So Puppet has a separable desired-state document, dependency ordering, **and** a
preview of what would change. The widespread claim that "Chef and Puppet both
describe procedure" is therefore **false for Puppet**, and the table above is
corrected accordingly. (Chef and Ansible remain **unverified** here.)

The consequence for the genealogy is the opposite of a weakening: it is not that
the declarative line had a DAG and a plan while the procedural line did not.
**Even the configuration-management lineage had both.** The reconcile model
inherited the loop from that lineage and the desired-state document from the
other, and dropped the DAG and the plan that *both* of its ancestors possessed.

Read as a choice, this looks like someone picking the wrong tool. Read
genealogically it is more precise: **the loop was inherited from the procedural
line and `spec`/`status` from the declarative line, and the two things that made
the declarative line valuable — the DAG and the plan — fell into the gap between
them.** Even the within-file ordering that Chef had was not retained. A genealogical
account is preferable because it requires blaming no one and can be checked, by
asking what each line supplied.

Whence a sharper characterisation:

> `spec` and `status` without a plan is the **form** of declarative management
> without its **semantics**.

Declarative management is useful on the precondition that a computable diff exists
and can be inspected before acting. Remove that precondition and `spec` is a place
to keep a wish.

One qualification, or the point is refuted in a sentence: `kubectl diff`,
server-side apply dry-run and continuous-delivery diff views all exist. So "there
is no plan" is too strong. The accurate statement:

> Kubernetes has diff **tooling** but no plan **semantics**. No controller
> computes an ordered change set and then commits to executing it atomically. The
> diff is for humans, and it is after the fact.

This is the third appearance of one shape: **the checker exists, but it is
downstream of the gate.** The others are in §3.1 and §6.1.

### 5.6 Layer mismatch is systematic

| Layer | Tool it received | Tool it needed |
|---|---|---|
| **L1** ordered provisioning | **L4's reconcile loop** (operators used for orchestration) | DAG, plan, failure semantics |
| **L2** domain modelling | **No tool** | Types, generics, composition |
| **L3** cross-boundary agreement | **L1's tools** (cross-state strings, exports used as contracts) | A compilation unit spanning owners |
| **L4** failure and time | Split in half: sagas in code, timeouts in YAML | One place where total behaviour can be reasoned about |

Every layer received a tool built for an adjacent layer. The reason this persists
is the same reason as everywhere else in this series: **nothing checks layer fit.**

---

## 6. Four categories with nowhere to live

The unifying statement:

> When a model lacks a syntactic category, the information does not disappear. It
> flows into a medium that nothing checks.

| Missing category | Where the information goes |
|---|---|
| **Interface** — a cross-service promise | Strings in configuration: parameter-store keys, ARNs, URLs ([Part 1, §6.2](/articles/scope-dissolution-checker-never-caught/#62-what-the-restored-idls-still-do-not-type): the payload was typed, the topology was not) |
| **World** — an independently evaluable deployable environment | The trunk becomes a mutex; a queue for shared staging |
| **Alternative** — coexisting options | Runtime feature flags: 2ⁿ untyped booleans |
| **Intent of divergence** — why two worlds differ | Naming conventions and tribal knowledge |

### 6.1 World: git's value proposition presupposes a compiler

Git provides history and an **unsound** three-way merge heuristic. The heuristic is
acceptable for code only because its errors are caught downstream by a compiler
and a test suite. Take the compiler away and each of git's headline features
behaves differently:

| Feature | Why it works for code | On YAML |
|---|---|---|
| `diff` | Textual difference approximates behavioural difference | `replicas: 2→3` and `image: v1→v2` have equal diff weight; moving a block is a large diff with no semantic content (mappings are unordered, text is ordered) |
| `merge` | Unsound, but the compiler catches the errors | **There is nothing downstream.** Git will cheerfully merge an absurd cluster state and nothing reports it |
| `branch` | A branch is another world, independently buildable and verifiable | A configuration **cannot be evaluated in isolation** — its meaning depends on the cluster, the images, the secrets |
| `review` | Reading the diff is reading the behaviour | Once templates and overlays intervene, a reviewer cannot evaluate a patch's semantic effect and can only pattern-match. (A three-line change to a values file *is* readable; the failure scales with layers of templating, not with all configuration review) |

Hence: remove the compiler and version control degrades into a shared mutable file
store with an audit log.

**But the configuration database already existed.** For Kubernetes it is etcd plus
the API server, and the two stores are close to complementary:

| A database should provide | git as a config store | **etcd + API server** |
|---|---|---|
| Schema | None | **Yes** — every write passes OpenAPI validation; CRDs add v3 validation |
| Constraints | None | **Yes** — admission webhooks, policy engines |
| Transactions | Only within one commit of one repository; configuration repositories are usually separate from application repositories | Per-object compare-and-swap; **no multi-object transactions** |
| Query | None; grep over overlays | **Yes** — label and field selectors, watch |
| **History / provenance** | **Strong** | **Weak** — compaction; no object history |
| Scope across clusters and accounts | **Yes** | **No** |
| **A human decision point before the write** | **Yes** (a pull request) | **None** — etcd has no notion of "proposed" |

Verified for the middle column: etcd "reliably stores the configuration data of
the cluster, representing the overall state of the cluster at any given point of
time", and the API server "processes, **validates** REST requests, and updates the
state of the API objects in etcd".

So the practice did not introduce a configuration database; it **bolted git's
provenance onto a store that already had a schema.** And the three things git adds
— durable history, scope spanning clusters and accounts, and a review point before
the write — are structural, not ergonomic. Choosing git was not unreasonable.

**The defect is ordering.** The checker was present all along; it stands
downstream of the gate:

```
commit → merge → reconciler applies → API server validates → rejection
                                       ↑
                        checker here, while the gate is at merge
```

Rejection arrives after the merge, as an asynchronous error in a controller log.
Nothing about the architecture requires this: `kubectl apply --dry-run=server`,
schema validators and policy engines can all run as merge gates. Some teams do
this. The default does not.

And the reason the wiring ended up this way is a slogan:

> "Git as the single source of truth" is precisely the doctrine that forbids a
> gate. A gate implies a submission can be **rejected**; a truth cannot be
> rejected. If git is the truth, validation can only happen afterwards. If git is
> a submission queue with a gate, validation happens before.

Which yields the characterisation: the practice built exactly the right
architectural slot — a human decision point before the write, which etcd entirely
lacks — and then left it empty of machine checking.

### 6.2 Consequently the branch degenerates and the trunk becomes a mutex

```
configuration has no evaluator
  ⇒ a branch cannot be evaluated in isolation
  ⇒ a branch cannot denote a world
  ⇒ the only remaining use of a branch is as a staging area for a patch
  ⇒ the only way to test an integration is to merge it
  ⇒ the trunk is the only place the system is ever complete
  ⇒ the trunk is a mutex
  ⇒ feedback latency becomes an organisational rather than a technical property
```

Step five has a precondition that must be stated: "the only way to test an
integration is to merge it" holds only where there is neither a typed contract nor
an instantiable world. Consumer-driven contract testing and per-pull-request
preview environments are both counterexamples, and both work by rebuilding a
checker locally. **The chain is the common default, not a theorem.**

A correction is also owed to the doctrine that long-lived branches cause merge
pain, since that doctrine is usually invoked to close this discussion. "Merge
hell" is an observation about a cost, and the doctrine converts it into a
prohibition. The cost has two components:

| | Nature | Growth with divergence time | Information? |
|---|---|---|---|
| **(a) Semantic divergence** | Two worlds made incompatible decisions | **None** — the decision has to be made either way | **It is information**; resolving it *is* the work |
| **(b) Mechanical merge cost** | Three-way merge defeated by renames, moves, reformatting; the same conflict re-resolved across N branches | Superlinear | Noise |

The doctrine's empirical basis is (b); it is preached as though it were about (a).
For (a) it is a category error: calling "the business has two incompatible
answers" a tooling problem, and then resolving it by forbidding the branches —
that is, forbidding the *representation* of alternatives rather than resolving
them.

Even for (b) the inference does not hold, since (b) is a function of tool quality
rather than of branch lifetime. The Linux kernel maintains many long-lived topic
and subsystem branches with continuous merging (**scale unverified**), and it is
where git came from; multi-year release branches are universal and are rarely
offered as examples of merge hell.

Honesty requires the converse too: git's merge has **false negatives**. If A adds a
call site depending on an invariant and B removes that invariant elsewhere, git
merges cleanly. "It merged cleanly" is therefore not evidence of compatibility —
which is exactly why the arbiter must be a type checker and a test suite, and
exactly why branch-as-world is viable for **typed code** and fails for
**unschematised, unevaluated** configuration. Note the qualifier: the cause of
failure is the absence of an evaluator, not the fact of being configuration. Given
a typed configuration language checked in continuous integration, an evaluator
exists and branch-as-world becomes viable for configuration too. What this series
objects to is **untyped data**, not **declarative data** — a distinction that
determines whether the remedy is to add types or to rewrite in imperative code,
and the latter is wrong.

### 6.3 Alternative: trunk-based development relocated the branch into the runtime

The large monorepo trunk-based practices usually cited as evidence for the
doctrine are enabled by enormous investment in (b) plus a compiler that catches
semantic breakage. They still cannot hold two worlds at once, and the cost is paid
elsewhere:

> Trunk-based development did not eliminate branching. It moved the branch into
> `if (flag)`.

The alternative worlds still exist; they have been relocated into the least
verifiable medium available — untyped runtime booleans, a 2ⁿ combinatorial state
space, and no type checker anywhere that knows which combinations are legal.

**Scope first, or a legitimate use case refutes this.**

| Form of flag | Pathological? |
|---|---|
| Single service, short-lived, deleted after release | **No** — cheap and legitimate |
| **Kill switch** | **No, and not replaceable** — you need to act immediately in the one production world; instantiable worlds do not help |
| Percentage rollout within one service | **No** — this is a routing mechanism |
| **Flags read by multiple services** | **Yes** |
| **Long-lived flags that become de facto configuration dimensions** | **Yes** |

**First pathology: a cross-service flag re-welds independently deployable units
into one.** Independent deployability is the defining property of the
microservices claim. Consider `NEW_PRICING_V2` read by an order service, a pricing
service and a web client: all three must agree on its value at runtime; you cannot
deploy the order service with flag-on semantics while pricing is still flag-off
without an inconsistent system. The flag is a runtime coordination point between
independently deployed units — that is, **a distributed global mutable variable**,
and worse than a monolith's global variable:

| | Global variable in a monolith | Cross-service flag |
|---|---|---|
| Scope | One address space | The whole system |
| Type | **Present**, visible to the compiler | **Absent** — a string key in a flag service |
| Which combinations are legal | Compiler and tests can cover it | **No component knows** |

The full cost of distribution is paid — network, partial failure, operational
complexity — and then the coupling that motivated distributing in the first place
is reintroduced. Applying §5.2's test: that alternatives must coexist is
**essential**; that they must be expressed as runtime booleans in the business
logic of every participating service is **accidental**, forced by there being
nowhere to put an alternative world.

**Second pathology: the comparison is still performed, but it is no longer
valid.** This is a stronger claim than "you lose the ability to compare", and
harder to dismiss, because people do run flag-based A/B tests and do obtain
numbers. The numbers are confounded.

| Experimental requirement | Under flags |
|---|---|
| Treatment and control **isolated** | **Everything is shared**: process, cache, connection pool, garbage collector, database |
| A **clean** control arm | Not clean — if a shared library also reads the flag, control traffic executes flag-on paths |
| **Repeatable** | No — the two "worlds" never existed as addressable objects |
| Differences **attributable** | **Attribution collapses**: was it flag A, flag B, their interaction, or the deployment? The combinatorial space is not enumerable |

What is lost is therefore not the convenience of comparison but its **validity**:
treatment and control share every confounder. This is a methodological loss.

Finally, a flag has no field in which to record *why* two paths differ, whether
they should converge, or which one won. So two of the four missing categories —
**alternative** and **intent of divergence** — drain into the same unchecked
medium.

### 6.4 Intent of divergence: git records exactly one relation

A difference between two refs can mean quite different things:

| What the difference between A and B means | Should it converge? |
|---|---|
| Time: A is ahead of B | Yes, fast-forward |
| Alternative implementations, Pareto-incomparable (latency versus cost) | **No** — merging them is a category error; there is nothing to resolve |
| Contextual specialisation: they answer **different questions** (per region, per customer) | **Never** — the divergence is permanent and correct |
| Phase: what is correct in a mock is incorrect in production | No, but ordered |
| Experiment and control: correctness is *defined* by the comparison | Decided by the result |

Git records **one** relation: ancestry. `git diff` yields text, `git merge-base`
yields ancestry, and **no operation can state which of the five you meant.**

So the tool-dogmatism around merging is not a matter of habit: **the model has one
merge operation because it holds one theory of what divergence is — transient, and
to be reconciled.** The remaining four meanings can only be encoded in naming
conventions, continuous-integration configuration, a wiki, or somebody's head.

This also explains why canary deployments are *usually* same-lineage. Technically
they need not be: two divergent branches implementing the same interface are
equally comparable. The forcing function is the **linearity** of
`pipeline(ref) → stage` — artefact identity is tied to a commit on a mainline, and
to canary two *divergent* branches the pipeline would have to be a graph
containing two independently promotable paths that coexist. Most delivery tooling
cannot express that. So the same-lineage property and the undebuggability of
canary arms are artefacts; the *comparative* nature of the canary predicate and
its attachment to the single production world are not ([Part 4](/articles/scope-dissolution-world-is-a-value/) returns to this).

---

## 7. The keystone: the boundary where typing dies is where loose coupling lives

§5.3 treated "the multi-service dependency graph of an enterprise application
crosses stack boundaries" as an unfortunate limitation. That is the wrong reading.
That boundary is not where the failure happens to occur; **it is the locus of loose
coupling itself.**

| | Inside a stack | Between stacks |
|---|---|---|
| What it should be | **High cohesion**: one owner, one lifecycle, atomic rollback, a derived DAG | **Loose coupling**: independent ownership, deployment, lifecycle |
| Machine checking | **Present** — types and the DAG are both sound | **Absent entirely** |

> The line at which types and ordering die is exactly, and only, the line along
> which loose coupling lives.

And this is not an accident of tooling but a consequence:

> Independent deployability implies independent compilation, which implies types
> do not cross. Yet a type guarantee requires a shared compilation unit, and a
> shared compilation unit is itself a form of coupling.

Which produces an apparent paradox: one wants loose coupling *and* cross-boundary
type checking, and the latter appears to require coupling.

### 7.1 The resolution is a term domain-driven design already supplied

> Loose coupling never meant "no shared artefact". It meant **share the interface,
> not the implementation**.

That is a published language, and it is the whole content of an IDL. What was done
instead was:

> Loose coupling was implemented as **not declaring the coupling**. The coupling
> did not disappear — services still depend on one another — it merely became
> undeclared.

That is not loose coupling. It is **unspecified coupling**.

This also answers a question [Part 1](/articles/scope-dissolution-checker-never-caught/) left open: why did discarding WSDL feel like
progress? Because it looked like removing coupling. WSDL *was* the shared
interface — the only thing making the coupling explicit. Removing it did not
reduce coupling; it made the coupling invisible.

### 7.2 The real cost, stated, so this is not a silver bullet

A shared contract library is a genuine coupling with genuine costs: version skew,
bumping and propagation, fan-out. The honest framing is a choice between visible
and invisible:

| | Undeclared coupling | Declared coupling (shared contract) |
|---|---|---|
| Cost now | **Zero** | A versioning burden |
| Cost later | **Invisible, unquantifiable, amortised into future incidents** | **Visible and manageable** (pinned versions, staged propagation) |
| **Amount of coupling** | **Unchanged** | **Unchanged** |

The choice is not between coupling and no coupling. It is between **visible
coupling and invisible coupling.** The quantity of coupling does not decrease
because one declines to declare it.

### 7.3 The second axis

[Part 1](/articles/scope-dissolution-checker-never-caught/) introduced the temporal axis of coupling: synchrony binds the caller's
liveness to the callee's, and the network is physically asynchronous. Both axes
are needed, and they fail independently:

| | Temporal axis | Declarative axis |
|---|---|---|
| Distributed objects | ✗ synchronous | ✓ IDL present |
| REST/JSON | ✗ still request/response | ✗ IDL discarded |
| Event-driven with typed schemas | ✓ | ✓ |

"We are already event-driven" therefore answers the temporal axis, and the
subject here is the declarative one.

---

## 8. Why any of this matters: modularity is for evolvability

The principles being invoked — high cohesion, loose coupling — are older and
harder than software engineering, and taking their strongest form matters more
than noting that nature is also modular.

Verified, from [Simon (1962)](https://faculty.sites.iastate.edu/tesfatsi/archive/tesfatsi/ArchitectureOfComplexity.HSimon1962.pdf):

> "it argues that **hierarchic systems will evolve far more quickly than
> non-hierarchic systems of comparable size**."

That modularity accelerates *evolution* is the 1962 claim, not an analogy. And
near-decomposability, in the same paper, is high cohesion and loose coupling
formalised:

> "In hierarchic systems, we can distinguish between the interactions **among**
> subsystems, on the one hand, and the interactions **within** subsystems … The
> interactions at the different levels may be, and often will be, of **different
> orders of [magnitude]**."

Interactions within a subsystem exceed interactions between subsystems by orders
of magnitude. Simon also notes the catalytic effect of **stable intermediate
forms** on the evolution of complex forms — viable intermediates are what allow
variation to accumulate. (Related biological work on modularity and evolvability —
Kirschner and Gerhart on facilitated variation, Wagner — is **unverified** here and
is reinforcement rather than requirement.)

One necessary limitation, or a ready counterexample applies: **modularity is not
necessary for a complex system to work.** End-to-end trained non-modular neural
networks outperform hand-built modular pipelines in several domains; highly
pleiotropic gene networks and price-coordinated markets do not depend on modular
boundaries. The defensible and more useful statement is:

> Modularity is necessary for a complex system to be **incrementally modifiable,
> locally comprehensible, and safely variable by bounded agents.**

Software's binding constraint is precisely that it must be repeatedly modified by
bounded agents, so the claim holds for software, and neural networks are not a
counterexample — nobody needs to locally modify one.

Which gives the frame for everything above:

| Precondition for evolvability | Corresponding section | Current state |
|---|---|---|
| **Modular boundaries** make variation local rather than fatal | L3 contracts (§5–§6) | Enforced by no machine |
| **Variation is cheap** | Worlds as values ([Part 4](/articles/scope-dissolution-world-is-a-value/)) | Expensive; alternatives can be argued but not demonstrated |
| **Selection can compare variants** | The canary predicate (§6.3, [Part 4](/articles/scope-dissolution-world-is-a-value/)) | Invalidated — treatment and control share every confounder |

All three are compromised. The consequence is not that the work is harder. It is
that the system has lost the preconditions of evolution — which is [Part 3](/articles/scope-dissolution-accident-of-scheduling/)'s
subject.

---

## 9. Falsification

1. **The relation primitive (§2).** Show that Kubernetes provides a declarative,
   checked mechanism for expressing "this component promises X to that component",
   and §2–§3 fail.
2. **CRD scope (§3).** The quoted documentation is the claim; if
   CustomResourceDefinitions can be scoped per namespace with independent
   versioning, the specimen argument fails.
3. **L2 expressiveness (§4.3).** Express the mutually recursive F-bounded generic
   constraint of §4.3 in HCL or CloudFormation.
4. **Where typing dies (§5.3).** Exhibit a typed, compile-time-checked reference
   across an ownership boundary that does not rely on a shared published artefact.
5. **Cost (§5.4).** Measure the proportion of Kubernetes-adopting teams that run
   per-branch namespaces. If per-branch environments are mainstream, §5.4's
   argument fails. **No such measurement is offered here.**
6. **Flags and validity (§6.3).** Demonstrate a flag-based A/B comparison in which
   treatment and control do not share process-level confounders.
7. **The keystone (§7).** Show a case where cross-ownership type checking was
   achieved without any shared artefact, and the paradox dissolves without the
   published-language resolution.
8. **Evolvability (§8).** Show a software system that remains incrementally
   modifiable by bounded agents while lacking enforced modular boundaries.

---

## References

Verified:

- Simon, H. A. (1962). [The Architecture of Complexity](https://faculty.sites.iastate.edu/tesfatsi/archive/tesfatsi/ArchitectureOfComplexity.HSimon1962.pdf). *Proceedings of
  the American Philosophical Society*, 106(6), 467–482.
- Kubernetes documentation, [*Extend the Kubernetes API with
  CustomResourceDefinitions*](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/), retrieved 2026-09-19.
- [Wikipedia, *Kubernetes*](https://en.wikipedia.org/wiki/Kubernetes) (secondary source; primary sources preferred
  for etcd, API server, namespace and label-selector descriptions).
- Puppet documentation, [*Catalog compilation*](https://www.puppet.com/docs/puppet/7/subsystem_catalog_compilation.html), retrieved 2026-09-19 —
  quoted in §5.5.
- Honda, K., Yoshida, N., Carbone, M. (2008). [Multiparty Asynchronous Session
  Types](https://doi.org/10.1145/1328438.1328472). *POPL '08*; [*JACM* version](https://doi.org/10.1145/2827695); [PDF](https://www.doc.ic.ac.uk/~yoshida/multiparty/multiparty.pdf).
- This series' reference implementation: [`ondemandenv/odmd-contracts-base`](https://github.com/ondemandenv/odmd-contracts-base/blob/5068891923d0c857eada9dea196b8e9fa48db469/lib/model/odmd-build.ts#L16)
  (source excerpts in §4.3 are permalinked at commit 5068891923d0).

To be supplied before publication:

- Brooks on essential versus accidental complexity.
- Parnas (1972) on information hiding; Evans (2003) on domain-driven design,
  bounded contexts, context mapping and published language.
- Primary sources for Chef, Puppet and Ansible desired-state semantics; Helm's
  templating engine; continuous-delivery sync-wave annotations.
- Kirschner and Gerhart; Wagner, on modularity and evolvability.

---

### Series: Scope Dissolution in Distributed Software Engineering

- **Part 1: [The Checker That Was Never Caught](/articles/scope-dissolution-checker-never-caught/)** — Every verification guarantee software engineering acquired was intra-process. Distribution dissolved each checker's scope; the one checker that had crossed the boundary — the interface definition language — was discarded by software engineers themselves, and a second, worked-out formalism was never picked up at all.

- **Part 2: [No Place to Put a Promise](/articles/scope-dissolution-no-place-for-a-promise/)** — The prevailing model's primitive for relating things is a runtime query over mutable strings, which has no position in it for a promise. Four categories of information consequently degrade into media nothing checks — and the boundary at which typing dies is exactly the boundary along which loose coupling lives. *(this article)*

- **Part 3: [An Accident of Scheduling](/articles/scope-dissolution-accident-of-scheduling/)** — The symptom chain as seen from a desk: per-repository pipelines, review as social adjudication, rational passivity, an uncomputable test matrix, and coping disciplines that professionalise manual reconstruction. Why a defect of this shape is structurally exempt from the organisation's own diagnostics.

- **Part 4: [A World Is a Value](/articles/scope-dissolution-world-is-a-value/)** — The remedy: named singletons become a type with instantiation, cross-service wiring becomes a compile-time type, and the intent of a divergence becomes declarable. Stated with the quantifier argument that makes the cheap universal layer non-substitutable — and with an explicit list of what remains irreducible.
