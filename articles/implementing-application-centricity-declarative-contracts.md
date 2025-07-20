---
layout: article
title: "Implementing Application-Centricity Part 3: The Power of Declarative Contracts and Platform Abstraction"
permalink: /articles/implementing-application-centricity-declarative-contracts/
---


# Implementing Application-Centricity Part 3: The Power of Declarative Contracts and Platform Abstraction

Continuing our series on Application-Centric Infrastructure (ACI)

In [Part 1](https://ondemandenv.dev/articles/embracing-application-centric-infrastructure-cloud-1/), we introduced the concept of Application-Centric Infrastructure (ACI) and why it's crucial for managing modern distributed systems. In [Part 2](https://ondemandenv.dev/articles/aws-cdk-eks-falling-short-multi-account-kubernetes/), we explored the common pitfalls of traditional, infrastructure-centric approaches and the limitations of simplistic GitOps models. Now, in Part 3, we dive into the "how": How does ONDEMANDENV enable true ACI through its core components, specifically `contractsLib` and the concept of independent, comparable environments (`Envers`)?

## The Traditional Gridlock: Silos, Static Environments, and Scope Blindness

Before understanding ONDEMANDENV's solution, let's revisit the typical challenges in conventional setups:
  * **Siloed Teams & Scope Localization:** Development teams often focus solely on their specific microservice or application. They may lack visibility into, or even disregard, the requirements and impacts of their changes on downstream or upstream services. As discussed in "[The Entanglement of Complexity](https://ondemandenv.dev/articles/scope-localization-ambiguity/)," this "scope localization" means crucial dependencies and integration points are often discovered late, leading to friction and instability.
  * **Monolithic, Static Environments:** Systems are typically deployed into a few shared, long-lived environments (e.g., dev, QA, staging, prod). Within each environment, a service usually exists as a single instance, tightly coupled with all other services deployed there. Updating a single service often requires complex coordination or risks destabilizing the entire shared environment.
  * **Operational Distance:** These shared environments are frequently managed by separate operations or DevOps teams. While skilled, these teams may not have deep context into the specific application interdependencies or the immediate stakes of a particular development team's changes.
  * **Inability to Compare:** Debugging complex, intermittent issues that span multiple services becomes a nightmare. Why? Because there's no practical way to create and compare slightly different, isolated running states of the system or its sub-components. You're stuck analyzing logs and metrics from the monolithic deployment, trying to infer causality across service boundaries.

## `contractsLib`: The Codified Congress for Distributed Systems

ONDEMANDENV introduces `contractsLib` as the cornerstone of its ACI implementation. Think of it not just as configuration, but as a **codified, declarative congress** where every application and service must explicitly state its needs, dependencies, and provided interfaces.

#### Contrast this with traditional approaches:

In traditional setups, dependencies are often implicit, discovered through runtime errors, tribal knowledge, or digging through disparate configuration files and infrastructure code. There's no single, enforced source of truth that compels teams to declare their interactions upfront.

Key aspects of `contractsLib`:
  * **Declarative Source of Truth:** An application contract defines *what* the application needs, not *how* to provision it. This includes:
    * Dependencies on specific versions of other services (Consumers).
    * Required platform capabilities (e.g., database type, message queue, caching layer).
    * Specific configurations or environment variables.
    * Resource requirements (CPU, memory).
    * Exposed interfaces or endpoints (Products).
  * **Forcing Early Visibility:** By requiring explicit declaration in code, `contractsLib` surfaces potential conflicts, incompatibilities, and integration challenges *early* in the development cycle. Siloed teams can no longer remain blind to their impact on the wider system; their "true colors" and assumptions are exposed in the contract.
  * **Architecture as Code:** `contractsLib` provides a high-level, version-controlled representation of the system's architecture and component interactions. It's not just infrastructure code; it's a living blueprint of how services relate to each other and the platform.
  * **Platform Maintained/Enforced:** These contracts aren't just documentation; they are integral to the ONDEMANDENV platform. The platform reads, validates, and uses these contracts to orchestrate deployments and enforce constraints. A contract declared outside the platform's purview doesn't count.



    # Conceptual Example of a contractLib definition (syntax illustrative)
    AppContract(appName='order-service', version='1.2.0') {
      dependencies: [
        ServiceDependency(name='payment-service', version='~>2.1'), # Consumes payment-service v2.1.x
        ServiceDependency(name='inventory-service', tag='stable'),   # Consumes inventory-service marked 'stable'
      ],
      platformNeeds: [
        Database(type='postgres', size='medium'),
        MessageQueue(name='order-events'),
      ],
      configuration: {
        API_TIMEOUT_MS: 500,
        FEATURE_FLAG_X: true,
      },
      provides: [
        ApiEndpoint(path='/orders', port=8080), # Product for others
      ]
    }


## Breaking Free: On-Demand, Isolated `Envers`

Building upon `contractsLib`, ONDEMANDENV revolutionizes environment management. Instead of forcing all services into a few monolithic environments, it allows **each application/service team to create multiple, independent, on-demand `Envers`** (Environment Versions).

An `Enver` is a fully provisioned, runnable instance of an application, based on a specific version of its code and its declared contract from `contractsLib`, including its precise dependencies. Crucially:
  * **Isolation:** Each `Enver` runs in isolation, unaffected by other `Envers` or traditional shared environments.
  * **Independence:** Teams can create `Envers` based on feature branches, specific commits, or different dependency versions without waiting for environment slots or coordinating complex shared deployments.
  * **True ACI:** The environment *belongs* to the application version defined in the contract, not the other way around.

## The Debugging Superpower: Comparing Isolated Environments

This independence unlocks a critical capability missing in traditional setups: **the ability to directly compare different running environments.** This is immensely powerful for debugging complex problems in distributed systems:
  * **Code Differences:** Is a bug caused by your latest code changes? Spin up an `Enver` for your feature branch (`feature-xyz`) and another `Enver` for the `main` branch. Deploy them, run the same tests against both, and directly compare behavior, logs, and resource usage in complete isolation. The difference *must* be related to the code change.
  * **Dependency Issues:** Does upgrading a dependency (e.g., `payment-service` from v2.1 to v2.2) cause problems? Create two `Envers` for your `order-service`: one contracting `payment-service v2.1` and another contracting `v2.2`. Compare their behavior side-by-side to pinpoint integration issues caused by the dependency change.
  * **Configuration Drift:** Suspect a configuration difference is causing issues? Create two `Envers` with slightly different configurations defined in their contracts. Compare them to isolate the impact of specific settings.
  * **Reproducing Bugs:** Easily recreate the exact conditions (code version, dependencies, configuration) under which a bug occurred by spinning up a corresponding `Enver`, drastically speeding up diagnosis.

This ability to compare isolated, fully-functional environments transforms debugging from guesswork based on fragmented logs in shared environments to a deterministic process of elimination.

## The Platform Abstraction: Making It Real

How does a declarative contract in `contractsLib` become a running, isolated `Enver`? This is the role of the **Platform Abstraction Layer** within ONDEMANDENV.
  * **Interpretation & Orchestration:** The platform reads the application contract, understands the declared dependencies and platform needs, and orchestrates the underlying infrastructure provisioning (using tools like AWS CDK in the current implementation).
  * **Handling Complexity:** It manages the cross-cutting concerns – setting up networking, security boundaries, service discovery, secrets management, basic observability – based on the contract and platform policies, shielding the application developer from this complexity.
  * **Ensuring Consistency:** By driving provisioning from the contract, the platform ensures that the resulting `Enver` faithfully represents the application's declared state.
  * **Portability:** While the current implementation might use AWS CDK, the `contractsLib` definition itself is tool-agnostic. The platform abstraction layer allows the underlying implementation to evolve without forcing changes to the application contracts.

## Conclusion: Achieving True Agility through ACI

Implementing Application-Centric Infrastructure isn't just about adopting new tools; it requires a shift in perspective. ONDEMANDENV facilitates this shift by providing:

  1. **`contractsLib`:** A codified congress forcing explicit declaration of dependencies and needs, enabling Architecture as Code and early integration visibility.**
  2. **Independent `Envers`:** Isolated, on-demand environments tied to specific application contract versions, freeing teams from monolithic environment constraints.**
  3. **Comparability:** The crucial ability to spin up and compare different environment states side-by-side, revolutionizing debugging and validation.**
  4. **Platform Abstraction:** An intelligent layer that translates declarative contracts into running reality, managing underlying complexity.**

By combining these elements, ONDEMANDENV moves beyond the limitations of traditional approaches, finally delivering on the promise of microservice agility and taming the complexity of distributed systems.