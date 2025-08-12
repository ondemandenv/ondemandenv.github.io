---
layout: article
title: "Where Abstraction Lives — CDK vs Crossplane, Plan-Time vs Convergence-Time, and Why GitOps Is Order (Not Abstraction)"
description: "Clarifies plan-time vs convergence-time abstraction, compares CDK and Crossplane, and positions GitOps as the conductor of order aligned to the Domain DAG."
series: "X-OPS FLAT WORLDVIEW"
part: 3
permalink: /articles/root-cause-x-ops-flat-worldview-3
---

# Article 3: Where Abstraction Lives — CDK vs. Crossplane, Plan-Time vs. Convergence-Time, and Why GitOps Is About Order (Not Abstraction)

This third installment clarifies a source of chronic confusion: “unifying the Git working surface” with YAML isn’t abstraction; it’s declaration. Real abstraction must live either at plan-time (code that produces an executable, ordered, compensable plan) or at convergence-time (a control plane that exposes higher-level platform APIs and continuously reconciles toward them). This piece compares the two dominant paths—CDK-style plan-time abstraction and Crossplane-style convergence-time abstraction—and shows how to align each with the domain DAG as the unit of change.

### Key Concepts
- **Plan-Time Abstraction**: Code that builds an executable plan (e.g., CDK).
- **Convergence-Time**: Control plane that reconciles state (e.g., Crossplane).
- **GitOps**: Tool for ordered application, not core abstraction.

## The two places abstraction can live

- Plan-time abstraction (code → plan → execution)
  - What it is: Use a general-purpose language to model intent, compose patterns, and emit an ordered dependency plan that an engine can execute transactionally with compensations/rollbacks.
  - Typical stack: AWS CDK L1/L2/L3 constructs compiled to CloudFormation plans or Terraform plans executed as a DAG.
  - Strengths: Clear dependency order, transactional semantics, strong encapsulation and reuse in familiar languages, testable before apply.
  - Trade-offs: Plan accuracy matters; drift and long-running external reconciliation need explicit handling; “continuous convergence” is not intrinsic.

For more on plan-time abstraction with CDK, see our series: 
- <a href="/articles/embracing-application-centric-infrastructure-cloud-1">Embracing Application-Centric Infrastructure in the Cloud 1</a>
- <a href="/articles/embracing-application-centric-infrastructure-cloud-2">Embracing Application-Centric Infrastructure in the Cloud 2</a>
- <a href="/articles/implementing-application-centricity-declarative-contracts">Implementing Application-Centricity Part 3</a>

- Convergence-time abstraction (API → reconciliation → steady state)
  - What it is: Define higher-level platform APIs; a control plane composes underlying resources and continuously reconciles to the declared desired state.
  - Typical stack: Crossplane XRD + Composition (+ Composition Functions) exposing domain-level CRDs; GitOps tools apply and monitor them with ordered sync and health gates.
  - Strengths: Single control surface, lifecycle ownership, late-binding decisions, self-healing, multi-cloud provider unification.
  - Trade-offs: Semantics are “eventual convergence,” not stack-level transactions; rollback is compensatory and governance-heavy; debugging can straddle multiple controllers.

The key alignment remains: changes must be governed by a domain dependency graph (DAG) with explicit order, health gates, and compensations; the abstraction layer you choose should serve that goal rather than replace it.

## CDK’s layered abstractions: L1/L2/L3 at plan-time

- What the layers mean
  - L1 constructs map 1:1 to CloudFormation resources—minimal abstraction with full control.
  - L2 constructs provide intent-based, curated APIs with sensible defaults and helper methods for common patterns.
  - L3 constructs (patterns) bundle multiple resources into opinionated solutions that solve end-to-end use cases with very little code.

- Why this works well
  - Abstraction is explicit in code, reuse is natural, and the output is an executable plan—the dependency graph the engine can apply and roll back in order.
  - Teams can unit-test constructs, enforce policy in code, and gate promotion on plan diffs.

- Where it struggles
  - Cross-provider convergence and long-tail external side effects require careful compensations and idempotency beyond the plan engine.

### Example: L2 Construct for Versioned API

To show plan-time abstraction in action, here's a CDK L2 construct creating a versioned API with canary routing—emitting an ordered CloudFormation plan:

```ts
// CDK L2/L3 example: opinionated construct emitting an ordered plan
import { Construct } from 'constructs';
import { Stack, Duration } from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export class ApiWithCanary extends Construct {
  public readonly api: apigw.RestApi;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const fnV1 = new lambda.Function(this, 'FnV1', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset('dist/v1'),
      handler: 'index.handler',
      timeout: Duration.seconds(5),
    });

    const fnV2 = new lambda.Function(this, 'FnV2', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset('dist/v2'),
      handler: 'index.handler',
      timeout: Duration.seconds(5),
    });

    this.api = new apigw.RestApi(this, 'Api');
    const resource = this.api.root.addResource('hello');

    // Version-aware routing (header based)
    resource.addMethod('GET', new apigw.LambdaIntegration(fnV1), {
      requestParameters: { 'method.request.header.X-Version': false },
      methodResponses: [{ statusCode: '200' }],
    });

    // Canary stage can direct small % to v2 via stage variables or a separate route
  }
}
```

This demonstrates how L2 constructs bundle resources with defaults, producing a transactional plan that aligns with a domain DAG—deploy V1 before routing, with rollback semantics.

## Crossplane’s layered abstractions: XRD/Composition at convergence-time

- Compositions and why PnT hit limits
  - Crossplane Compositions aggregate multiple resources behind a custom API; the classic “patch and transform” (PnT) model enabled templating but struggled with conditions, loops, and complex derivations at scale.
- Composition Functions: programmable pipelines
  - Functions are OCI containers (any language) implementing a defined interface; Crossplane invokes them to compute the composed resources for a composite API, enabling conditionals, loops, dynamic computation, and multi-step pipelines.
  - Pipelines can chain steps like patch-and-transform, Go templating, and auto-ready, materially reducing YAML repetition and enabling richer abstractions in the control plane.
- What this unlocks
  - Platform teams can export domain-level CRDs (XRDs) that encode enterprise patterns and policy; application teams declare intent against those APIs and get lifecycle management and reconciliation “for free.”
- Where it struggles
  - Semantics remain non-transactional; failures require governance (timeouts, retries, backoffs) and compensations defined at the platform API level; testing and debugging require good tooling discipline because logic spans functions and controllers.

These articles dive deeper into CDK for application-centric infra and contracts for domain abstraction.

### Example: Crossplane Composition Pipeline

For convergence-time abstraction, here's a conceptual Crossplane pipeline defining a domain CRD—continuously reconciling resources with functions for dynamic logic:

```yaml
# Crossplane Composition Function pipeline (conceptual)
apiVersion: apiextensions.crossplane.io/v1
kind: Composition
metadata:
  name: xapis.myorg.io
spec:
  compositeTypeRef:
    apiVersion: myorg.io/v1alpha1
    kind: XAPI
  mode: Pipeline
  pipeline:
    - step: derive-config
      functionRef:
        name: function-go-templating
    - step: render
      functionRef:
        name: function-kcl-render
    - step: auto-ready
      functionRef:
        name: function-auto-ready
```

This shows how functions enable programmatic composition, turning XRD declarations into reconciled infrastructure—governed by GitOps health gates for order.

## GitOps provides order, not abstraction

- What GitOps does well
  - Ensures declared state is applied with structured sequencing and health checks via sync phases and waves—pre-sync, sync, post-sync phases, and wave ordering, including reverse-wave pruning and configurable delays between waves to let controllers react.
- What it does not do
  - It doesn’t create semantic abstraction—no domains, contracts, versions, or compensations by itself; YAML is the carrier, not the model. Treating environments as branches or directories leads to drift and conflict because the abstraction is missing, not because Git needs more policy.

## Choosing the right place for your abstraction

- Use plan-time abstraction (CDK/CFN/TF) when
  - A single change needs transactional semantics and coherent rollback across heterogeneous resources.
  - You want strong code-level reuse (L2/L3) and compile-time policy; you need to test plans deterministically before execution.
- Use convergence-time abstraction (Crossplane) when
  - You want a platform API surface that productizes domain patterns and continuously reconciles them; you want teams to consume higher-level CRDs, not build stacks from primitives; you can accept non-transactional semantics and govern with health gates and compensations.

In both cases, keep GitOps as the ordered delivery mechanism—phases, waves, and health—not as the abstraction layer.

## Making it work together: a pragmatic blueprint

- Domain DAG as the unit of change
  - Model order, dependencies, health gates, timeouts, retries, and compensations explicitly; include extra-cluster resources as first-class edges.
- Plan-time for transactional stacks
  - Use CDK L2/L3 constructs to encode patterns and produce plans for engines that execute DAGs with rollback; extend with custom resources for non-native steps, ensuring idempotency and compensating actions.
- Convergence-time for platform APIs
  - Publish domain CRDs via XRD + Compositions + Composition Functions; organize logic as pipelines with clear step responsibilities (derive, render, ready); govern with ordered sync and health checks.
- GitOps as the conductor
  - Use sync phases/waves to enforce ordering and allow controllers to stabilize; rely on reverse-wave pruning; never treat “retry until green” as a strategy—failure budgets and exit criteria must be explicit.

## The bottom line

Abstraction isn’t “more YAML” or a “unified Git surface.” It’s a conscious choice of where semantics live: in code that emits a transactional plan, or in a control plane that reconciles domain APIs. Pick deliberately, align everything to the domain DAG, and let GitOps orchestrate order and health—nothing more, nothing less. Crossplane’s Composition Functions have meaningfully expanded convergence-time abstraction, while CDK’s L1/L2/L3 layers remain the gold standard for plan-time modeling; the two can—and often should—coexist when the unit of change is a domain, not a file.

**Diagram**

<div id="plan-vs-convergence-abstraction" 
     class="mermaid-diagram-simple" 
     data-external-diagram="/diagrams/plan-vs-convergence-abstraction.mmd">
</div>

<div style="text-align: center; margin: 0.75rem 0 1.25rem;">
  <a href="/mmd-render.html?mmd=diagrams/plan-vs-convergence-abstraction.mmd&back=/articles.html" 
     target="_blank" 
     style="display: inline-flex; align-items: center; gap: 0.5rem; background: #0366d6; color: white; padding: 0.4rem 0.9rem; border-radius: 4px; text-decoration: none; font-size: 0.9rem;">
    🔍 View Fullscreen
  </a>
  <div style="font-size: 0.85rem; color: #6a737d; margin-top: 0.5rem;">
    Fits width and natural height; click to open interactive viewer if needed.
  </div>
</div>

**Code examples**

```ts
// CDK L2/L3 example: opinionated construct emitting an ordered plan
import { Construct } from 'constructs';
import { Stack, Duration } from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export class ApiWithCanary extends Construct {
  public readonly api: apigw.RestApi;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const fnV1 = new lambda.Function(this, 'FnV1', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset('dist/v1'),
      handler: 'index.handler',
      timeout: Duration.seconds(5),
    });

    const fnV2 = new lambda.Function(this, 'FnV2', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset('dist/v2'),
      handler: 'index.handler',
      timeout: Duration.seconds(5),
    });

    this.api = new apigw.RestApi(this, 'Api');
    const resource = this.api.root.addResource('hello');

    // Version-aware routing (header based)
    resource.addMethod('GET', new apigw.LambdaIntegration(fnV1), {
      requestParameters: { 'method.request.header.X-Version': false },
      methodResponses: [{ statusCode: '200' }],
    });

    // Canary stage can direct small % to v2 via stage variables or a separate route
  }
}
```

```yaml
# Crossplane Composition Function pipeline (conceptual)
apiVersion: apiextensions.crossplane.io/v1
kind: Composition
metadata:
  name: xapis.myorg.io
spec:
  compositeTypeRef:
    apiVersion: myorg.io/v1alpha1
    kind: XAPI
  mode: Pipeline
  pipeline:
    - step: derive-config
      functionRef:
        name: function-go-templating
    - step: render
      functionRef:
        name: function-kcl-render
    - step: auto-ready
      functionRef:
        name: function-auto-ready
```



