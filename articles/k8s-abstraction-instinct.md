---
layout: article
title: "The Abstraction Instinct: What No Tool Can Provide"
description: "Part 3 of \"Why Kubernetes Infrastructure Rots.\" The problem was never YAML vs TypeScript or Helm vs CDK. It's that concrete artifacts and their missing classes look identical to the operator mind. No tool can inject the instinct to see the difference."
permalink: /articles/k8s-abstraction-instinct/
date: 2026-07-10
author: "Gary Yang"
tags: ["kubernetes", "abstraction", "domain-driven-design", "platform-engineering", "infrastructure"]
---

# The Abstraction Instinct: What No Tool Can Provide

*The problem was never YAML vs TypeScript, Helm vs CDK, or GitOps vs CI/CD. The problem is that YAML, shell commands, and API calls are the same thing to the operator mind — concrete artifacts to apply. To the software engineer's mind, they're instances missing their class. No tool can inject the instinct to see the difference.*

---

## CDK in the Hands of an Operator

Here's what CDK code looks like when written by someone with the operator mindset:

```typescript
const owaspDev = new wafv2.CfnRuleGroup(stack, 'OWASP-DEV-dev', {
  name: 'WAFRULES-RULEGROUP-DEV-dev',
  capacity: 1500,
  scope: 'REGIONAL',
  rules: [{
    name: 'SSI-Rule',
    priority: 1,
    statement: { byteMatchStatement: {
      searchString: '<!--#',
      fieldToMatch: { uriPath: {} },
      positionalConstraint: 'CONTAINS',
      textTransformations: [{ priority: 0, type: 'NONE' }]
    }},
    action: { block: {} },
    visibilityConfig: { sampledRequestsEnabled: true, cloudWatchMetricsEnabled: true,
      metricName: 'WAFRULES-SSI-DEV-dev' }
  },
  // ... 15 more rules, all inline
  ]
});

const owaspDevLt = new wafv2.CfnRuleGroup(stack, 'OWASP-DEV-lt', {
  name: 'WAFRULES-RULEGROUP-DEV-lt',
  capacity: 1500,
  scope: 'REGIONAL',
  rules: [{ /* exact same rules, copy-pasted, metric name changed */ }]
});
// Repeat for nop, prd. Repeat for every rule group type. Repeat for every environment.
```

This is CloudFormation translated character-by-character into TypeScript. CDK used as a YAML emitter. The type system exists but is unused — everything is inline literals, no variables, no shared structure.

Now the same problem through a software engineer's eyes:

```typescript
class OwaspRuleGroup extends Construct {
  constructor(scope: Construct, id: string, props: {
    environment: Environment,
    tier: EnvironmentTier,
    wafScope: WafScope
  }) {
    super(scope, id);
    const rules = OwaspRules.standard();
    const totalWcu = rules.reduce((sum, r) => sum + r.wcu, 0);
    if (totalWcu > 1500) {
      throw new Error(`${id}: WCU ${totalWcu} exceeds 1500 limit`);
    }
    new wafv2.CfnRuleGroup(this, 'RG', {
      name: NamingConvention.ruleGroup('WAFRULES', props.environment, props.tier),
      capacity: 1500,
      scope: props.wafScope,
      rules: rules.map(r => r.render(props.environment, props.tier)),
    });
  }
}

for (const env of Environment.all()) {
  for (const tier of env.tiers()) {
    new OwaspRuleGroup(stack, `OWASP-${env}-${tier}`, {
      environment: env, tier, wafScope: WafScope.REGIONAL
    });
  }
}
```

Same CDK. Same TypeScript. Same deployment target. Radically different code. The difference isn't the tool — it's whether the author sees "a rule group to create" or "a type of rule group parameterized by environment and tier."

---

## The Equivalence That Operators See

To the operator mind, these three things are fundamentally the same:

```yaml
# YAML manifest — here a Crossplane Managed Resource. The `spec.forProvider`
# block is Crossplane's convention: the reconciler translates it, field for
# field, into a cloud-provider API call. A CR that looks declarative but is,
# mechanically, a thin RPC to the provider.
kind: RuleGroup
spec:
  forProvider:
    capacity: 1500
    name: WAFRULES-RULEGROUP-DEV-dev
```

```bash
# CLI command
aws wafv2 create-rule-group --name WAFRULES-RULEGROUP-DEV-dev --capacity 1500
```

```python
# API call
client.create_rule_group(Name='WAFRULES-RULEGROUP-DEV-dev', Capacity=1500)
```

All three are **the same concrete operation in different syntax.** A config to apply. A command to run. A procedure step to execute. The operator moves fluently between them because they're equivalent — all three say "make this thing exist with these properties."

To the software engineer, all three are **instances missing their class:**

- Where is the type that says capacity must be ≤ 1500?
- Where is the naming convention that generates the resource name?
- Where is the constraint that regional rule groups can only be referenced by regional policies?
- Where is the test?

YAML, CLI commands, and API calls describe **what** to create. None describe **why** (business rule: OWASP protection) or **how** it relates to other things (must pair with an FMS policy of matching scope). The why and how are the domain model. The operator keeps them in their head. The software engineer encodes them in types.

---

## The Head vs The Code

This is the crux of the entire series.

The operator's professional value is **knowing things that aren't written down:**

- "The FedRAMP variant uses different rules because compliance requirement X.Y.Z says..."
- "You can't deploy rule groups before IP sets because of export dependencies..."
- "The naming convention is `{TYPE}-RULEGROUP-{STAGE}-{tier}` because policies parse the name..."
- "High-traffic regions need more memory because..."

This knowledge is real, accurate, and essential. The operator earned it through experience. And they naturally guard it — not maliciously, but because it's their professional identity. It's what makes them the person you call when things break. (We'll return to this dynamic — it's more structural than it appears.)

The software engineer has the opposite instinct. Unwritten knowledge is a **liability** — it dies when the person leaves, can't be tested, can't be verified by CI, diverges silently between people, and doesn't scale beyond a conversation.

```typescript
// The operator's knowledge: "capacity must not exceed 1500 WCU"
// The software engineer's encoding:
class RuleGroup {
  constructor(rules: WafRule[]) {
    const totalWcu = rules.reduce((sum, r) => sum + r.wcu, 0);
    if (totalWcu > 1500) {
      throw new Error(`WCU limit exceeded: ${totalWcu}/1500`);
    }
    this.rules = rules;
  }
}

// The operator's knowledge: "regional policies can't reference global rule groups"
// The software engineer's encoding:
class FmsPolicy {
  addRuleGroup(rg: RuleGroup): void {
    if (rg.scope !== this.scope) {
      throw new Error(`Scope mismatch: policy is ${this.scope}, rule group is ${rg.scope}`);
    }
    this.ruleGroups.push(rg);
  }
}
```

After this code exists, the knowledge survives the person leaving. A new hire can't accidentally violate the constraints. The invariant is **protected by compilation** rather than by tribal memory.

The operator sees bureaucracy: "I know the limit is 1500. I don't need a class to tell me that." The software engineer sees the 6 repos of copy-pasted YAML and counts the cost of that confidence: silent drift, inconsistent naming, broken cross-repo dependencies discovered at deploy time.

---

## Why Tools Can't Fix This

The abstraction instinct isn't a skill like "learn TypeScript syntax." It's a **perceptual shift**.

When a software engineer looks at a CloudFormation template with 4 copies of a rule group (one per tier), they see **redundancy** — the same concept expressed four times with one parameter varying. The template is screaming "I'm a type parameterized by tier."

When an operator looks at the same template, they see **completeness** — all four tiers explicitly defined, nothing hidden behind an abstraction. Clear and honest.

Both perceptions are genuine. The conflict is about **what counts as understanding.** The operator understands by knowing what the system does (concrete). The software engineer understands by knowing what the system is (abstract). These are different cognitive orientations, not different skill levels.

This is why tool adoption doesn't change behavior. CDK in the hands of someone who sees concretely produces concrete code. The tool provides the capability to abstract. It can't provide the instinct.

---

## Why the Gap Persists: The Benefit Distribution System

If the cognitive gap were merely a skill gap, organizations would close it through hiring, training, or painful experience. They mostly don't. The following is an *incentives argument*, not a measured one — a lens for why the gap is stickier than a skill gap should be: the ecosystem surrounding Kubernetes infrastructure behaves less like an evolving technical community and more like a **benefit distribution system**, where most participants' incentives are served by the status quo.

### How the network works

Consider the lifecycle of a platform engineer in this ecosystem:

1. **Entry:** They earn a CKA or Terraform Associate certification, which tests procedural knowledge — "write a Pod manifest," "configure a backend." Domain modeling doesn't appear on the exam.
2. **Hiring:** Job postings filter for Helm, Terraform, and ArgoCD experience. Recruiters keyword-match against tool names, not design skills. Candidates who think in domain models self-select into application engineering roles instead.
3. **Promotion:** Career advancement rewards "deployed X to production across 200 clusters," not "modeled X so variants are a parameter." The operator who manually managed 6 repos is more visible than the one who consolidated them into 1, because the first person touched more systems and handled more incidents.
4. **Reputation:** Conference talks celebrate "how we operate 500 clusters with GitOps," not "how we identified 3 aggregate boundaries and eliminated 80% of our repos." Community credibility accrues to scale stories, not modeling stories.
5. **Vendor relationships:** Tool vendors sell to operators. HashiCorp, the GitOps ecosystem, the service mesh vendors — their revenue depends on the operator layer existing and growing. A domain model that eliminates 5 of 6 repos also eliminates 5 of 6 Helm releases, 5 of 6 pipelines, 5 of 6 monitoring dashboards. The vendors' incentive is to make each repo easier to operate, never to question whether 6 repos should be 1.

This isn't a conspiracy. Nobody sits in a room deciding to block abstraction. It's a **self-reinforcing incentive loop:**

```
Tool vendors sell to operators
  → Certifications validate operator skills
    → Recruiters filter for certified operators
      → Operators build operator-style solutions
        → Solutions create operational complexity
          → Complexity justifies more operators and more tools
            → Tool vendors sell more
```

Every participant acts rationally within their incentives. The aggregate effect is that **nobody in the loop benefits from abstraction.** The software engineer who models the domain is threatening everyone's economics simultaneously — the tool vendor's addressable market, the certified operator's credential value, the consulting firm's engagement length, the conference organizer's speaker pipeline, the recruiter's candidate pool.

### How the network rejects abstraction

The rejection isn't passive. It has specific, observable mechanisms:

**Code review as antibody.** An engineer submits a PR that replaces 4 copy-pasted Helm charts with a typed CDK construct. The reviewers — operators — reject it: "too complex," "over-engineered," "nobody else can maintain this." The rejection is sincere. To the operator eye, 4 explicit charts ARE simpler than 1 parameterized construct, because simplicity means "I can read every line" not "the invariants are enforced." The PR is either rewritten as YAML or abandoned.

**Hiring as selection pressure.** Even if one team adopts domain modeling, the next hire replaces the modeling advocate with someone whose resume says "Helm, Kustomize, ArgoCD." Within one turnover cycle, the team reverts to operator-style solutions — not because someone decided to revert, but because the new hire builds what they know.

**Tribal knowledge as career capital.** This is the deepest lock-in. The operator who keeps domain knowledge in their head — "you can't deploy rule groups before IP sets because of export dependencies" — is irreplaceable. The moment that knowledge is encoded in a type system, the operator becomes interchangeable. No one consciously guards knowledge to protect their position. But the instinct to keep expertise personal rather than encoded is indistinguishable in practice from deliberate gatekeeping. The operator who says "I'll just handle it" instead of "let me encode it" is simultaneously being helpful and being irreplaceable.

**Complexity as headcount justification.** 6 repos for one domain require 6 pipelines, 6 sets of alerts, 6 review rotations. This is operational surface area, and operational surface area justifies team size. The person who consolidates 6 repos into 1 has just argued for their team to shrink. Organizations don't reward self-shrinking. The operator who maintains complexity is not cynically empire-building — they're responding to the same incentive structure that rewards "scale of responsibility" in every performance review.

### Why only external pain breaks it

Internal advocacy can't overcome a benefit distribution system because the advocate is always outnumbered. Every person who says "we should model this domain" faces pushback from:
- The operators who maintain the current repos ("this works fine")
- The team lead who measures output in deployments, not design quality
- The vendor rep who just sold a dashboard for all 6 pipelines
- The recruiter who has 40 Helm-experienced candidates and 0 CDK-experienced ones
- The certification body that just released a new exam for the current toolchain

The only force strong enough to override the network is **pain that the network can't absorb:**

- A cross-cutting change that takes 3 weeks across 6 repos when a customer escalation demands 3 days
- A production outage caused by cross-repo naming inconsistency that nobody's mental model caught
- An audit failure because the governance-by-filesystem approach has no enforcement
- Onboarding that takes 4 months because all domain knowledge is tribal and undocumented

At that point, the cost of concrete exceeds the cost of abstracting. But even then, the response is usually Stage 2 — centralize the data, create another shared repo — because the operators doing the fixing still lack the instinct to model. The pain has to recur, escalate, and be explicitly traced to the structural cause before an organization reaches for a real domain model.

This is a large part of why the Kubernetes infrastructure landscape looks the way it does: not because better solutions don't exist, but because the incentives of the surrounding network — hiring, certification, vendor economics, promotion criteria — mostly point away from them. This is an argument about incentives, not a measured claim; read it as a lens on why the gap is sticky, not a proof that every actor consciously resists abstraction.

---

## The Three Levels of Infrastructure Maturity

In Part 2, I described three **stages of degradation** — how infrastructure rots from copy-paste through cargo-cult centralization to resignation. Here are three **levels of maturity** — where you can be:

### Level 1: Concrete — "Artifacts to apply"

```
Reuse: Copy-paste
Knowledge: In people's heads
Failure mode: Drift, inconsistency, tribal knowledge loss
```

Works at small scale. Produces Stage 1 rot (Part 1) when complexity grows.

### Level 2: Centralized — "Shared files that everyone uses"

```
Reuse: Git submodules, monolithic JSON, governance directories
Knowledge: Partially written down, partially in heads
Failure mode: Coordination bottlenecks, coupling without contracts
```

The cargo-cult phase (Part 2). Adds coupling without adding understanding.

### Level 3: Modeled — "Types that encode the domain"

```
Reuse: Versioned packages with declared interfaces
Knowledge: In the type system and tests
Failure mode: Over-engineering, abstraction for its own sake
```

The key marker isn't the tool — it's whether the why and how are encoded in codebase or in heads. You can achieve Level 3 with Terraform modules. You can fail to achieve it with CDK written like YAML.

Note: Level 3 has its own failure mode. A software engineer who builds a generic WAF framework for a team managing 3 rule groups has over-abstracted. Operators are often right that a simple problem doesn't need a type system. The pathology is when the problem IS complex and the response is still concrete.

---

## What the Domain Model Looks Like

Throughout this series, we've used WAF management as the running example — 6 repos for one domain. Here's what a software engineer would build instead:

**The aggregates:**

- **RuleGroup**: Collection of WAF rules with a capacity constraint (≤1500 WCU). Scoped to REGIONAL or CLOUDFRONT. Naming convention must match FMS policy parsing logic.
- **FMSPolicy**: Binds rule groups to target accounts and resource types. Must reference only rule groups of matching scope.
- **ComplianceVariant** (value object): Parameterizes the above — which accounts, which regions, which rule overrides for FedRAMP vs commercial.

**The invariants:**

- Rule group WCU must not exceed 1500
- FMS policy scope must match referenced rule groups
- Export names must be consistent between producers and consumers
- Compliance variants must deploy to all regions in their set — partial is invalid

**The bounded context:**

```
waf-management/
  ├── domain/
  │   ├── rule_group.py       ← Aggregate with WCU validation
  │   ├── fms_policy.py       ← Aggregate with scope validation
  │   └── variant.py          ← Value object
  ├── infrastructure/
  │   ├── cloudformation/     ← Templates generated from domain objects
  │   └── deployer.py         ← One script, parameterized by variant
  ├── config/
  │   ├── commercial.yaml
  │   ├── fedramp.yaml
  │   └── saas.yaml
  └── tests/
      ├── test_wcu_limits.py
      └── test_scope_consistency.py
```

One repo. One pipeline. Variant is a parameter, not a code fork. Invariants are tested. Export name consistency validated at CI time. Not more code than 6 repos — arguably less. But it requires seeing WAF management as a domain with rules, not as a set of procedures to execute.

---

## Recognizing the Instinct in Yourself

**You might have the operator instinct if:**

- Your first thought for a new variant is "which repo do I copy?"
- You feel uncomfortable when logic is "hidden" behind a class
- You keep mental notes about which values must match across repos
- You feel abstraction adds complexity rather than removing it

**You might have the software engineer instinct if:**

- Your first thought for a new variant is "what parameter do I add?"
- You see copy-pasted YAML and feel the same discomfort as copy-pasted code
- You feel that unencoded knowledge is a risk, not an asset
- Your reaction to a bug in copied code is "why was this copied?"

Most people are a mix. The point isn't to categorize — it's to recognize what's driving your decisions.

---

## The Constructive Takeaway

**1. Start with the domain, not the tool.** Before creating a repo: What are the entities? The invariants? Who owns what? This takes an afternoon and saves months.

**2. Encode invariants in code.** If a constraint exists, validate it automatically. If two values must match, derive them from the same source. If a naming convention exists, make it a function.

**3. Version and contract shared code.** Libraries have versions, interfaces, and release notes. Git submodules at HEAD are not a library. A 78KB JSON file is not a library.

**4. Centralize policies, distribute data.** The security team owns "exceptions expire in 90 days." Product teams own their exceptions. The pipeline enforces scan requirements. Teams manage their image lists.

**5. Hire for the instinct.** Not "can you write CDK" but "given these 4 YAML files, what's the type they share?" The tooling is learnable. The instinct is the hard part.

**6. Pair across the gap.** Let the operator narrate what the system does. Let the engineer narrate what the system is. The gap between those narratives is your domain model.

---

## The Series in One Sentence

Infrastructure at scale is a software engineering problem, and YAML, shell scripts, and API calls — no matter how well organized — are no more a solution to it than concatenating SQL strings is a solution to data modeling.

The operators who build the infrastructure don't see this because their tools don't show it, their training didn't teach it, and their instinct says concrete artifacts you can read line-by-line are more trustworthy than types you have to reason about.

They're right about the trust. They're wrong about the scalability. And the ecosystem surrounding Kubernetes — the certifications, the hiring pipelines, the vendor economics, the conference culture, the promotion criteria — doesn't just fail to correct the error. It actively rewards it. Every participant profits from operational complexity persisting. No one profits from a domain model that makes 5 of 6 repos unnecessary.

The ecosystem won't evolve past this from within. It changes only when the cost of concrete — the 3-week cross-cutting changes, the outages from unvalidated cross-repo invariants, the 4-month onboarding — exceeds what the network can absorb. Even then, the first response is usually another shared repo, another centralized registry, another layer of scripts. The real shift happens only when someone finally asks the question that no certification teaches and no tool prompts: *What is this a domain of?*

---

*This is Part 3 of "Why Kubernetes Infrastructure Rots."*

---

### Series: Why Kubernetes Infrastructure Rots

- **Part 1: [The Operator Mindset](/articles/k8s-operator-mindset-vs-domain-modeling/)** — Why one domain becomes six repositories. The repo-per-problem anti-pattern as a consequence of thinking in procedures instead of models.

- **Part 2: [The Cargo Cult](/articles/k8s-cargo-cult-centralization/)** — Why shared repos and better tools don't fix it. The failed abstraction phase.

- **Part 3: [The Abstraction Instinct](/articles/k8s-abstraction-instinct/)** — What no tool can provide. CDK in the hands of an operator is still operator thinking. *(this article)*

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
