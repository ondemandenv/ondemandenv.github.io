---
layout: article
title: "ONDEMANDENV Architecture Deep Dive"
permalink: /articles/odmd-arc/
---

The ONDEMANDENV platform aims to solve challenges in the Software Development Lifecycle (SDLC) for distributed systems like microservices, particularly focusing on dependencies between services and collaboration across teams using different repositories.

Here's a breakdown of the core architectural concepts:

## Builds, Envers, and ContractsLib

Each repository (`repo`) can have different `builds`. Each build can have multiple `envers` (Environment Versions) associated with different Git branches or tags. An `enver` represents a holistic, logical environment for a specific version of a service or component.

A special repository, `contractsLib`, defines the dependencies between different envers. An enver can consume `products` (outputs) from other envers. For example, a networking enver might produce an IPAM reference (its product), and an EKS cluster enver consumes this reference, forming a dependency.

A build can output several types of products:

  1. A Docker image, producing an image repository URI and image SHA.
  2. A CDK (Cloud Development Kit) deployment, which implements the enver's products and consumes products from other envers.
  3. General resources with URIs, managed via customized scripts.

## Enver Types: Branch vs. Tag

Envers correspond to source repository branches or tags:
  * **Branch Envers (Incremental):** Associated with a Git branch. When the source code changes, the enver is incrementally deployed.
  * **Tag Envers (Immutable):** Built from a specific Git tag. These envers can only depend on other immutable (tag) envers, ensuring stability and reproducibility.

The platform automatically deploys envers to their designated target accounts based on definitions in the `contractsLib`.

## On-Demand Cloning

A key feature is the ability to create on-demand environments through cloning. By creating a new branch/tag in the `contractsLib` and referencing an existing enver's branch/tag, the platform automatically creates a clone. This clone reuses the original enver's dependency definitions but deploys resources with different names, maintaining the same logic/functionality. This allows developers to test and experiment with high consistency in isolated environments.

The CDK code is designed to take the branch/tag name as a parameter to load configurations. This ensures that the code defining envers can be identical across branches/tags, while the generated CloudFormation/HCL differs in resource names/URIs to avoid conflicts, yet maintains logical consistency.

## Configuration Store and Dependency Management

When an enver is deployed, it outputs the concrete values of its products to a configuration store (e.g., AWS SSM Parameter Store). Consumers can calculate the URI to retrieve these values. The config store versions all values and dispatches events (e.g., via EventBridge) upon changes.

Dependency cycles are permitted but require placeholder values during initialization. For instance, if networking provides a hosted zone but requires central logging, and central logging requires the hosted zone:

  1. Initialize networking, providing the hosted zone but using a placeholder for central logging.
  2. Set up central logging using the hosted zone provided by networking.
  3. Update the networking enver to use the actual central logging product.

How consumers react to product changes is configurable. Consumers can also be defined with initial placeholder values.

Envers can deterministically define their stack names. For globally unique resources, the platform relies on CloudFormation's physical name generation or allows user definition based on branch/tag names.

Cloning an enver doesn't pin dependency versions by default. However, immutable (tag) envers enforce that their dependencies must also be immutable when created.

There's a limit on the number of clones per enver (e.g., 20), and developers manage deletion, which is largely automated. Cloned envers are fully isolated but share the same dependency definitions.

## ContractsLib as "Architecture as Code"

All definitions reside in code. The `contractsLib` provides built-in interfaces and typing for build and enver definitions. It acts like a "congress" where teams owning envers negotiate the web of producers and consumers through Pull Requests. Deployments only occur upon agreement, removing the need for complex access control on products themselves.

Upstream dependency changes can potentially break downstream envers; developers must manage this. The `contractsLib` itself uses semantic versioning and is also treated as an enver, built with custom scripts. Its TypeScript code includes typing and unit tests to ensure integrity (e.g., enforcing that immutable envers cannot depend on mutable ones).

Since the `contractsLib` code defines the contracts between services, it essentially represents the architecture of the entire system – "Architecture as Code". Changes are expected to be deliberate and well-reasoned.

## Platform Implementation Details

The platform leverages IAM/STS to assume roles across multiple AWS accounts. A central account runs the platform implementation/deployment. Other accounts might exist for specific concerns like networking, logging, security, and multiple `workspace` accounts run the actual application workloads.

Currently, the config store uses AWS SSM Parameter Store, EventBridge acts as the event bus triggering Lambda functions, and secrets are stored in AWS Secrets Manager.

## CI/CD and Testing

All envers have their own CI/CD pipelines for unit tests. Integration and End-to-End (E2E) tests, which depend on deployed resources, can be part of the application enver itself or defined as separate envers that depend on the target enver.

The platform can integrate with various CI/CD tools like CodePipeline, GitHub Actions, or Step Functions. For AWS CDK deployments, CloudFormation handles automatic rollbacks.

## Enver Definition and Isolation

An "Enver" is a versioned, logical deployment unit containing all resources (infrastructure to container) for at least one vertical slice of business functionality. It represents a "what-if" version of code.

Envers from the same repo/build should generally be unaware of each other but can share dependencies from envers of different repos/builds.

Enver configurations are securely isolated, enabling different teams (even offshore/outsourced) to work on separate branches collaboratively without exposing sensitive configuration data.

Products are versioned configuration values (URIs, JSON, endpoints, etc.), potentially including URIs to traditional build artifacts.

Ideally, all inputs/contexts an Enver uses for contracting with other services are defined in `contractsLib`, ensuring consistent and predictable behavior.

## Built-in Builds

The platform includes several optional, pre-defined builds:
  * **ContractsLib Build:** Compiles and deploys the `contractsLib` repo itself (runs in workspace0).
  * **Networking Build:** Deploys networking resources (IPAM, VPCs, TGW, NAT) across networking and workspace accounts.
  * **User Auth Build:** Deploys a user authentication service and potentially a web console for visualizing contracts (runs in workspace0).
  * **EKS Cluster Build:** Deploys EKS clusters, using shared networking resources, allowing workload envers to deploy applications into isolated namespaces within the cluster (runs in workspace0, deploys manifests via central account VPC). IAM mapping uses OIDC federation.

## Platform Automation and Visualization

The central account uses a GitHub App to:

  1. Generate identical GitHub Actions workflow files for each enver across all branches.
  2. Monitor the config store for changes and react based on consumer configurations (e.g., trigger downstream CI/CD, send alarms).

A web graph GUI, powered by AppSync syncing from the config store, provides an interactive visualization of enver dependencies – an interactive architecture diagram.

## Contracts Base and Extensibility

A base repository ([`ondemandenv/odmd-contracts-base`](https://github.com/ondemandenv/odmd-contracts-base)) defines core types and interfaces (Build, Enver, Producer, Consumer) and contracts with the central account. Each organization creates its own specific `contractsLib` extending this base, defining their concrete services, builds, enver targets (account/region), etc. The ONDEMANDENV platform team maintains the central account deployment and the base library.

## Workflow Summary
  * **Adding a Service:** Define the service (as a build/enver) in the organization's `contractsLib`. Once published, services use this library to retrieve dependencies and publish their own products.
  * **Cloning an Enver:** Add a comment like `odmd: create@<target_branch>` to a commit on the source branch. The platform detects this and creates the clone. Use `odmd: delete ...` to remove clones.
  * **Updating ContractsLib:** Pushing code to the `contractsLib` repo triggers its CI/CD, publishing a new package version. This update is detected by the platform, which syncs build/enver infrastructure (CI/CD pipelines, etc.). Downstream envers consuming the library are also triggered based on their configuration.

The platform enforces explicitness: if it's not defined in `contractsLib`, it won't be deployed, resolving ambiguity.

## Key Innovations Recap
  * **Enver:** Incremental/Immutable environment-as-code units with versioned dependencies.
  * **ContractsLib:** Codified service contracts for dependency resolution (architecture-as-code).
  * **On-Demand Cloning:** Branch-based environment replication with dependency isolation.