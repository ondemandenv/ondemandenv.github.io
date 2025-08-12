---
layout: article
title: "Critical Practices and Decision Criteria — From Domain DAGs to Version and Event Governance"
description: "Operationalizes the series with concrete practices: domain DAG as unit of change, plan-time vs convergence-time roles, version and event governance, and decision checklists."
series: "X-OPS FLAT WORLDVIEW"
part: 5
permalink: /articles/root-cause-x-ops-flat-worldview-5
---

# Article 5: Critical Practices and Decision Criteria — From Domain DAGs to Version and Event Governance

In the fifth article of our series, we pivot back from metaphor to concrete practice.  
If the “first cut” must be semantic—domain boundaries before tooling—then every change has to reinforce that cut.  
This requires **codifying critical practices and decision criteria** so that planning, execution, and rollback preserve the domain-first shape.  
Here we outline what those are, why they matter, and how to apply them.

***

## 1. The Domain Dependency Graph (DAG) as the unit of change

**Definition**: A domain DAG explicitly expresses the order and dependencies between resources, steps, and data flows *within a bounded context*, including extra‑cluster and external cloud resources.

**Why**:
- Ensures every change is ordered and atomic at the domain level.
- Makes rollback/completion semantics explicit.
- Allows health gates and compensations to be attached at the right edges.

**Minimum viable DAG details**:
- Nodes = resources/actions with lifecycle hooks
- Edges = dependency order, with attributes for timeouts, retry budgets, and compensating actions
- Health gates per node: SLO probes, contract tests, data consistency sentinels

**Key rule**: *Nothing ships* without being in a domain DAG and surviving simulation/rollback in a controlled environment.

***

## 2. Tooling roles in the DAG

- **Transactional / plan‑time stack**:
  - CloudFormation / Terraform + custom resources.
  - Use when you need “one change, one rollback” semantics across heterogeneous resources.
  - External actions must be idempotent and have compensating logic.

- **Platform API / convergence‑time stack**:
  - Crossplane with XRD + Compositions (+ Composition Functions).
  - Use to expose domain‑level CRDs that productize patterns.
  - Govern via sync ordering and health checks; accept eventual convergence semantics.

- **Delivery conductor**:
  - Argo CD (or equivalent) for ordered delivery — phases, waves, readiness checks, reverse‑wave pruning.
  - It enforces order, **not abstraction**.

Decision fork:

| Situation | Choice |
|-----------|--------|
| Cross‑resource transaction needed? | Plan‑time (CFN/TF + CRs) |
| Continuous convergence with reusable platform APIs? | Convergence‑time (Crossplane + Functions) |

***

## 3. Version governance

**Goal**: Versions must be parallel, routable, measurable, and decommissionable.

**Rules**:
- No “two versions in one container”
- Always deploy independent instances per version
- Route requests by version metadata (URL, header, service discovery)
- Compatibility testing in CI gates promotion
- Usage telemetry drives deprecation schedule
- Maintain a published “sunset calendar” for old versions

**Why**: Supports safe parallel evolution; rollback is “route flipping” instead of full redeploy.

### Example: Version-Aware Routing

To implement parallel versions, use header-based routing in an ingress controller—deploy V1 and V2 independently and route at the edge:

```yaml
# Version-aware routing (NGINX ingress example; route by header)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-by-header: "X-Version"
    nginx.ingress.kubernetes.io/canary-by-header-value: "v2"
spec:
  rules:
  - http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: api-v1
            port:
              number: 80
```

This enables traffic splitting without shared deployments, aligning with domain DAG rollback (flip header rules to revert).

***

## 4. Event and schema evolution

**Best practices**:
- Prefer additive changes (add fields + defaults)
- Design consumers as tolerant readers
- Use schema registry and compatibility checks in CI
- For breaking changes: run dual streams (v1/v2) with explicit migration and reconciliation plans

**Why**: Avoids the Friday‑afternoon surprise of breaking every consumer with one unannounced schema tweak.

### Example: Schema Compatibility Check in CI

To enforce additive evolution, add a CI step that checks schema compatibility before merge—preventing breaking changes:

```yaml
# Schema compatibility in CI (Kafka + Avro + Redpanda/Confluent style)
steps:
  - name: schema-compat
    image: ghcr.io/org/schema-checker:latest
    script: |
      schema-check \
        --registry $SCHEMA_REGISTRY \
        --subject order-created-value \
        --schema file://schemas/order-created-v2.avsc \
        --compatibility BACKWARD
```

This gates PRs on BACKWARD compatibility, ensuring tolerant readers can handle additive fields without disruption.

***

## 5. Feature delivery and branching discipline (branches as environments/evolution paths)

- **Single‑track evolution (for stable products)**:  
  Trunk‑based development — small steps, short‑lived branches, always‑releasable mainline, feature flags for WIP, CI exercises flag combinations, clean up stale flags rapidly.

- **Exploratory branches as environments**:  
  Branch = environment = evolution path — independent builds, deployments, budgets, telemetry.
  Use traffic routing (A/B, canary, shadow) to evaluate in production‑like conditions.  
  Winners promote via contract‑aware rollout; losers retire per deprecation plan.

**Rule of thumb**: Branches are for exploration with their own environments, not for serial environment promotion.

### Load-Bearing Contract and Branch Ecology (from "Walking on Many Feet")

- **Load-Bearing Contract**: Production stability rests on one immutable contract version (the platform’s “theOne” enver). Exploration never mutates this load-bearing unit.
- **Branch = Environment = Evolution Path**: Each branch gets its own full environment (e.g., `SRC_Rev_REF('b', 'feature-x')`), making evaluation evidence-based, not political.
- **Promotion as Enver Switch**: Winners promote by changing the load-bearing enver (tag or branch) rather than forcing code merges that break consumers.
- **Losers Are Archived with Learnings**: Retire unfit branches with explicit archival notes, preserving organizational learning.

See also: <a href="/articles/walking-on-many-feet-contract-branches/">Walking on Many Feet: Contract Branches</a>

For deeper dives on branch conflicts as architectural signals and transforming them into innovation, see our MERGE HELL SCANDAL SERIES:
- <a href="/articles/merge-hell-myth-x-ops-contamination">The 'Merge Hell' myth</a>
- <a href="/articles/branch-conflicts-architectural-signals">Branch Conflicts as Signals</a>
- <a href="/articles/business-logic-branch-conflicts-political-warfare">Branch Diversity and Innovation</a>

***

## 6. Gateway/Mesh stance

- **Allowed**:
  - Mesh: In‑domain reliability (mTLS, scoped retries), observability, fine‑grained traffic shaping inside domain.
  - Gateway: In‑domain ingress, BFFs for single domain, protocol/security termination.

- **Forbidden**:
  - Cross‑domain orchestration, data aggregation, or “central brain” routing in either.
  - Network‑layer workarounds for missing contracts.

***

## 7. Decision criteria checklist

Use this at design/review time:

1. **Does this change live entirely within one domain’s DAG?**  
   If cross‑domain, are contracts + async boundaries in place?
2. **Are all external resources in the DAG?**  
   If not, create CRDs or plan‑time steps to include them.
3. **Is rollback defined and tested for each node?**  
   Timeouts, retry budgets, compensations declared?
4. **Versioning plan?**  
   Parallel deployable, routeable versions, compatibility tests, telemetry, sunset.
5. **Event evolution plan?**  
   Additive first, tolerant reads, schema registry, migration sequencing.
6. **Feature delivery path?**  
   Trunk discipline or isolated fork with eval plan?
7. **Tool posture?**  
   Mesh/gateway in composite/serving posture; no overriding.

***

## 8. Embedding into governance

- **Artifacts**: Each change request must include DAG diagram + health gate definitions + rollback plan + version/event plan.
- **Review gates**: Architecture review rejects changes that don’t pass the checklist.
- **Automation**: CI/CD pipelines enforce phase/wave order, health checks, and block merges if impacts cross domain boundaries without contracts.
- **Metrics**: Track rollback MTTR, parallel version counts, cross‑domain edge density, schema‑compat coverage.

***

## Coming up

In Article 6, we’ll combine everything into the **methodology for complex‑system navigation**:  
**Semantic abstraction → simulation/rollback drills → parallel experiments → selection and promotion**.  
This is how you de‑risk the “first cut” in complex systems and keep complexity growing linearly, not exponentially.

## Practitioner snippets

```yaml
# Version-aware routing (NGINX ingress example; route by header)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-by-header: "X-Version"
    nginx.ingress.kubernetes.io/canary-by-header-value: "v2"
spec:
  rules:
  - http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: api-v1
            port:
              number: 80
```

```yaml
# Schema compatibility in CI (Kafka + Avro + Redpanda/Confluent style)
steps:
  - name: schema-compat
    image: ghcr.io/org/schema-checker:latest
    script: |
      schema-check \
        --registry $SCHEMA_REGISTRY \
        --subject order-created-value \
        --schema file://schemas/order-created-v2.avsc \
        --compatibility BACKWARD
```



