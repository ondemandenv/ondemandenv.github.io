---
layout: article
title: "Embracing Application-Centric Infrastructure in the Cloud 1"
permalink: /articles/embracing-application-centric-infrastructure-cloud-1/
---



In the world of cloud computing, managing infrastructure and applications has often been a tale of two philosophies. On one side, we have tools like AWS CloudFormation, born from an engineering mindset focused on certainty and consistency. CloudFormation excels at defining infrastructure as code, ensuring predictable deployments and automated rollbacks. On the other side, Kubernetes emerged from the operations world, emphasizing ad-hoc operations and mitigation for dynamic, containerized applications. While Kubernetes is unparalleled in container orchestration, it traditionally lacked the broader infrastructure management capabilities of CloudFormation.

This divergence has led to toolchain sprawl, inconsistencies, and operational complexities. However, as the definition of "application" evolves to encompass a wider range of tightly coupled resources, a new paradigm is emerging: Application-Centric Infrastructure. This approach, enabled by tools like AWS Cloud Development Kit (CDK), aims to unify infrastructure and runtime management, bringing consistency, manageability, and a domain-driven perspective to cloud deployments.

## CloudFormation vs. Kubernetes: Two Philosophies in Action

To understand the shift towards application-centric infrastructure, it's crucial to appreciate the foundational differences between CloudFormation and Kubernetes:

### CloudFormation: Engineering Certainty and Automated Rollback
  * **Focus:** Infrastructure as Code (IaC), declarative provisioning of AWS resources.
  * **Philosophy:** Engineering certainty, consistency, and predictability.
  * **Rollback on Failure:** Automatic rollback for stack operations. If any resource creation or update fails, CloudFormation reverts all changes, ensuring a consistent state. This emphasizes "all-or-nothing" deployments, prioritizing stability and predictability.
  * **Dependency Management:** Built-in, declarative dependency support using `DependsOn`. CloudFormation understands and enforces resource creation and deletion order, simplifying complex infrastructure deployments.

### Kubernetes: Operational Flexibility and Resilience
  * **Focus:** Container orchestration, managing the lifecycle of containerized applications.
  * **Philosophy:** Operational flexibility, resilience, and ad-hoc mitigation in dynamic environments.
  * **Rollback on Failure:** No automatic rollback by default for general failures (except for Deployment updates). Kubernetes prioritizes operational control, allowing operators to investigate and apply targeted mitigations. Rollbacks are typically explicit actions.
  * **Dependency Management:** Implicit and controller-driven. Kubernetes manages dependencies within its ecosystem (e.g., Pods and Services), but lacks declarative, infrastructure-level dependency management akin to CloudFormation.

These contrasting approaches reflect their origins and primary use cases: CloudFormation for foundational infrastructure and Kubernetes for application runtime management.

## The Modern "Application": Vertical Slices as Bounded Contexts

> "Traditionally, an 'application' in the cloud might have been viewed as a set of containers orchestrated by Kubernetes. However, modern applications are vertical slices of business functionality, often comprising:
>
>   * Containers: Microservices, application logic packaged in containers.
>   * Databases: Managed databases like RDS or serverless options like DynamoDB.
>   * Storage: Object storage (S3 buckets), block storage (EBS).
>   * Networking: VPCs, load balancers, DNS, CDNs.
>   * Serverless Functions: Lambda functions for event-driven logic.
>   * API Gateways: For managing and securing APIs.
>   * Crucially, Security and Least Privilege: Modern applications demand robust security architectures built on the principle of least privilege. This means defining granular roles and permissions to ensure each component of the application only has access to the minimum resources necessary to perform its function. Security is not an afterthought, but a fundamental aspect of application design and deployment."
>

Defining an "application" narrowly as just containers ignores its domain-driven scope becomes limiting. A more accurate and useful definition encompasses all tightly coupled logical resources as a bounded context—a self-contained vertical slice with all resources needed to deliver a business capability, regardless of their physical location or type.

## Application-Centric Infrastructure: A Domain-Driven Approach

This broader definition of "application" leads to Application-Centric Infrastructure Design. This paradigm shifts the focus from managing individual resources in isolation to organizing infrastructure around logical application boundaries. Key principles include:
  * **Application Stacks = Vertical Slices:** Each application is defined as a self-contained "stack" that includes all its necessary resources – infrastructure and runtime components as a vertical business capability. This stack becomes the single source of truth for the application's environment, mirroring the "bounded context" concept from Domain-Driven Design (DDD).
  * **Platform Stacks for Shared Modular or Services:** Shared infrastructure components, like a central EKS cluster, are placed in a separate "platform stack." sharing thru network as a service, Application stacks then depend on this platform stack, creating a clear separation of concerns and promoting reusability.
  * **Logical Cohesion Over Physicality:** Resources are grouped together based on their logical relationship to an application, not their physical location or service type. An S3 bucket, a DynamoDB table, and Kubernetes deployments, all belonging to the same application, are managed as a cohesive unit within the application stack.

### Benefits:
  * Improved Consistency: Managing all application resources in a single stack reduces configuration drift and ensures a consistent environment.
  * Enhanced Manageability: Application stacks simplify deployments, updates, and rollbacks, making application lifecycle management more streamlined.
  * Clear Application Ownership: Teams can own and manage their entire application stack, fostering autonomy and accountability.
  * Simplified Cost Attribution: Resource costs are easily attributed to specific applications through their dedicated stacks.
  * Alignment with Cloud-Native Principles: Promotes loosely coupled, independently deployable application units.
  * Enhanced Security Posture: Application stacks facilitate the implementation of least privilege access control by creating clear security boundaries and enabling granular permission management within each application's scope.

This application-centric approach resonates deeply with the philosophy of Domain-Driven Design (DDD). Just as DDD organizes software around bounded contexts and domain logic, application-centric infrastructure organizes cloud resources around logical application domains. This alignment brings clarity, consistency, and a stronger focus on business value to infrastructure management.

## AWS CDK: Unifying Infrastructure and Runtime Management

AWS Cloud Development Kit (CDK) emerges as a powerful enabler for application-centric infrastructure. CDK abstracts away the complexities of traditional Infrastructure as Code, allowing you to define both infrastructure and runtime orchestration in a single, unified codebase using familiar programming languages.
  * **Infrastructure-as-Code with Abstraction:** CDK provides high-level constructs for defining AWS resources (VPCs, S3, RDS, etc.) with best practices baked in, simplifying infrastructure definition and reducing boilerplate.
  * **Runtime Orchestration via cdk8s:** CDK integrates with cdk8s, allowing you to define Kubernetes manifests directly within your CDK code. This enables seamless management of Kubernetes resources (Deployments, Services, Custom Resources) as part of the application stack.
  * **Unified Tooling and Workflow:** CDK provides a single toolchain and a consistent developer experience for managing the entire application stack, from infrastructure to runtime.
  * **Simplified Dependency Management:** CDK simplifies dependency management, allowing you to define dependencies between AWS resources and Kubernetes resources within the same stack.
  * **Infrastructure as Secure Code:** CDK is not just about Infrastructure as Code, but also Infrastructure as Secure Code. CDK provides constructs for defining IAM roles, policies, and security groups, allowing you to embed security best practices directly into your infrastructure definitions. This is crucial for implementing least privilege and ensuring secure application deployments.
  * **Granular Permission Management:** CDK makes it easier to grant fine-grained permissions to resources within application stacks. You can define IAM roles and policies that precisely match the access requirements of each application component, minimizing the risk of over-permissioning.

By using CDK, teams can move beyond fragmented tools and hybrid approaches, embracing a truly unified stack definition for their applications.

## The Evolution of Deployment Tooling

The landscape of cloud infrastructure management has undergone a significant evolution, driven by the increasing complexity of modern applications and the need for more efficient and consistent deployment strategies. Initially, organizations navigated a fragmented ecosystem of specialized tools, leading to operational overhead and inconsistencies. The following below traces the evolution of cloud deployment tooling through three distinct phases, culminating in the emergence of unified stack approaches exemplified by AWS Cloud Development Kit (CDK).

### Phase 1: Fragmented Tools – The Era of Specialization, and Silos

In the early days of cloud adoption, organizations often relied on disparate, specialized tools, each addressing a specific aspect of the cloud environment. Two prominent examples were AWS CloudFormation and Kubernetes, each originating from different operational philosophies:
  * **AWS CloudFormation: Infrastructure Provisioning in Isolation:** CloudFormation emerged from an engineering-centric world, focused on certainty and consistency in infrastructure provisioning. It excelled at defining and deploying a wide range of AWS resources through declarative templates. However, its approach to Kubernetes resources was often limited, treating them as static YAML definitions rather than dynamically managed entities.
  * **Kubernetes: Container Orchestration, Infrastructure Agnostic:** Kubernetes, born from the operations world, prioritized ad-hoc operations and mitigation in dynamic environments. It revolutionized container orchestration, abstracting away the underlying infrastructure complexities to manage containerized applications at scale. However, Kubernetes, in its native form, lacked the capability to directly provision and manage cloud resources outside its cluster, such as storage buckets or databases.

#### The Result: Toolchain Sprawl and Operational Friction

This fragmented approach led to several challenges:
  * **Toolchain Sprawl:** Organizations accumulated a diverse set of tools, requiring specialized expertise for each. This complexity increased training costs and hindered holistic management.
  * **Configuration Drift:** Managing infrastructure and application configurations in separate systems inevitably led to configuration drift. Inconsistencies arose as changes in one system were not automatically reflected in the other, creating "snowflake" environments that were difficult to reproduce and troubleshoot.
  * **Operational Overhead:** Operating distinct toolchains increased operational complexity. Coordinating deployments, updates, and monitoring across disparate systems demanded significant manual effort and custom scripting, increasing the potential for errors and operational overhead.
  * **Limited Holistic View:** The lack of integration made it challenging to gain a unified, holistic view of the entire application stack. Monitoring and troubleshooting often involved navigating between different tool interfaces and correlating data across silos.

### Phase 2: Hybrid Approaches – Bridging the Divide with Complexity

Recognizing the limitations of fragmented tooling, organizations began adopting hybrid approaches to bridge the gap between infrastructure and application management. A common pattern involved combining:
  * **CloudFormation for Infrastructure Foundation:** CloudFormation continued to be used for provisioning the underlying infrastructure, including Virtual Private Clouds (VPCs), compute resources, managed services, and even the foundational EKS (Elastic Kubernetes Service) clusters.
  * **Kubernetes-Native Tools for Application Deployment:** Within the Kubernetes clusters provisioned by CloudFormation, organizations adopted Kubernetes-native tools for application lifecycle management:
    * Helm: For packaging, templating, and deploying applications as charts within Kubernetes.
    * GitOps Tools (Argo CD, Flux): For implementing continuous delivery and declarative application configuration management within Kubernetes, using Git as the source of truth.

#### The Limitations of Hybrid Approaches:

While hybrid approaches offered improvements over fully fragmented tooling, they introduced new complexities:
  * **Inconsistency in Paradigms (IaC vs. GitOps):** Hybrid models often juxtaposed Infrastructure-as-Code (IaC) principles with GitOps practices. CloudFormation templates embodied a declarative, infrastructure-centric approach, while GitOps introduced a separate declarative model focused on application deployments within Kubernetes. Managing and reconciling these distinct declarative systems added a layer of abstraction and potential confusion.
  * **Continued Need for Multi-System Expertise:** Despite integration efforts, teams still required expertise in both CloudFormation and the Kubernetes ecosystem. This demanded broader skill sets and could lead to knowledge silos within organizations.
  * **Complex Rollbacks and Audits:** Performing comprehensive rollbacks or conducting thorough audits became more intricate. Rolling back an entire application stack might necessitate coordinated rollbacks across both CloudFormation (for infrastructure changes) and Kubernetes tools (for application deployments), often requiring custom scripting and manual orchestration. Auditing changes across these disparate systems remained a challenge.

### Phase 3: Unified Stacks with CDK – The Convergence of Infrastructure and Runtime

The current evolution points towards unified stack approaches, where infrastructure and runtime management converge into a single, cohesive codebase. AWS Cloud Development Kit (CDK) exemplifies this Phase 3, offering a powerful framework for defining and managing entire application stacks, from foundational infrastructure to runtime orchestration, within a single, developer-friendly environment.

#### AWS CDK: Unifying Infrastructure and Runtime Management

AWS CDK acts as an abstraction layer on top of AWS CloudFormation, but fundamentally changes the development experience by:
  * **Infrastructure-as-Code with Programming Languages:** CDK empowers developers to define AWS infrastructure using familiar programming languages like TypeScript, Python, Java, and Go. This moves away from verbose JSON/YAML templates and unlocks the power of programming constructs, including loops, conditionals, functions, and object-oriented principles for infrastructure definition.
  * **High-Level Abstractions (Constructs):** CDK provides a rich library of Constructs, pre-built, reusable components that represent cloud resources with best practices embedded. These constructs simplify the definition of complex resources like VPCs, S3 buckets, databases, and even EKS clusters, reducing boilerplate and promoting consistency.
  * **Runtime Orchestration with cdk8s Integration:** CDK seamlessly integrates with cdk8s (Cloud Development Kit for Kubernetes), enabling developers to define Kubernetes manifests directly within their CDK code, using the same programming languages and abstractions. This allows for unified management of both AWS cloud resources and Kubernetes resources within a single stack definition.
  * **Unified Tooling and Workflow:** CDK provides a unified command-line interface (CDK CLI) and workflow for developing, deploying, and managing entire application stacks. Developers can use a single toolchain and programming language to handle both infrastructure provisioning and application runtime orchestration.

#### The Advantages of Unified Stacks with CDK:
  * Simplified Operations: Managing a single, unified codebase simplifies operations. Deployments, updates, and rollbacks become more streamlined and atomic, as infrastructure and application configurations are managed together.
  * Improved Consistency and Reduced Drift: Defining both infrastructure and runtime configurations within the same codebase inherently promotes consistency and minimizes configuration drift. Changes to infrastructure and applications are versioned and deployed together, ensuring a more cohesive and predictable environment.
  * Enhanced Developer Experience and Productivity: Using familiar programming languages, high-level constructs, and a unified toolchain significantly improves the developer experience. CDK makes infrastructure definition more accessible, enjoyable, and efficient, boosting developer productivity and reducing errors.
  * Robust Dependency Management: CDK, built upon CloudFormation, inherits its robust dependency management capabilities. Developers can define dependencies between all resources within a stack – both AWS infrastructure and Kubernetes resources – ensuring proper creation and update ordering.
  * Streamlined Audits and Rollbacks: Unified stacks simplify audits and rollbacks. Changes are tracked in version control for the CDK code, providing a clear audit trail. Rollbacks can be performed at the stack level, reverting both infrastructure and application configurations in a coordinated manner.
  * Towards Application-Centric Infrastructure: CDK facilitates an application-centric infrastructure design. By defining an application as a holistic unit encompassing all its tightly coupled resources (infrastructure and runtime components), organizations can achieve better application ownership, isolation, and manageability.

(Note: The following seems like specific implementation notes or links)

[https://github.com/ondemandenv/odmd-eks/.../simple-k8s-manifest.ts#L10](https://github.com/ondemandenv/odmd-eks/blob/5f67a7ec01f2effe4302c4a00a33adb0eedca0da/lib/simple-k8s-manifest.ts#L10)

This single stack will manage the lifecycle and dependencies of all resources inside and out of the EKS cluster, making it a self-contained "stack" that includes all its necessary resources – infrastructure and runtime components. This stack becomes the single source of truth for the application's environment, mirroring the "bounded context" concept from Domain-Driven Design (DDD).

AWS CloudFormation will maintain the dependencies among all resources in the stack, making sure they are deployed and rolled back in order/sequence to be in a transaction.

THIS IS REAL CODE, With little coding abstraction by parameterization like:


    //what branch I am on
    const br = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    //configuration based on branch
    const imgAndVer = StringParameter.valueForStringParameter(this, '/my-app/' + br );

you can have IDENTICAL CODE on different branches generate and deploy to multiple environments (IDENTICAL LOGIC/FUNCTION manifests with branch specified configure values) for further experimentation, discovery, testing or production with HIGH CONSISTENCY, code comparison by branching, and unit testing, which knocks GitOps out of space!

Above is the root philosophy for <https://ondemandenv.dev>, which support one more layer abstraction: connecting VPCs across multiple accounts so that each account can deploy k8s manifest thru private subnets with dynamic value/token resolution.