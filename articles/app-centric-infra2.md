---
layout: article
title: "AWS CDK for EKS: Falling Short in Real-World, Multi-Account Kubernetes Deployments"
permalink: /articles/app-centric-infra2/
---


# AWS CDK for EKS: Falling Short in Real-World, Multi-Account Kubernetes Deployments

AWS Cloud Development Kit (CDK) aims to simplify cloud infrastructure provisioning using familiar programming languages. While its EKS module promises to streamline Kubernetes cluster creation and management, a closer look reveals significant shortcomings, especially when considering practical, multi-account EKS deployments. This article will delve into these limitations, arguing that AWS CDK's current EKS implementation, particularly the `Cluster.addManifest` function, is not truly useful for organizations adopting a shared, multi-account EKS strategy.

## The Illusion of Simplicity: Cluster.addManifest and its Account Boundaries

The `Cluster.addManifest(id: string, ...manifest: Record<string, any>[]): KubernetesManifest` function in CDK appears to offer a straightforward way to deploy Kubernetes manifests to an EKS cluster. However, this simplicity is deceptive when considering real-world scenarios where EKS clusters are designed to be shared across multiple AWS accounts.

In practice, a central EKS cluster is often shared by various teams or applications residing in separate AWS accounts. This multi-account approach is crucial for security, isolation, and cost management. However, `Cluster.addManifest` operates under the implicit assumption of a single account and region deployment.

### Evidence of this Limitation:
  * **Implicit Same-Account Assumption in CDK Design:** AWS CDK's core constructs and IAM role management are inherently designed for deployments within a single AWS account. While the CDK documentation for `KubernetesManifest` does not explicitly forbid cross-account deployments, its examples and underlying mechanisms are geared towards single-account use cases.
  * **Cross-Account IAM Complexity:** Deploying manifests to an EKS cluster in a different account necessitates complex cross-account IAM role configurations. As highlighted in Stack Overflow discussions on cross-account resource access in CDK, CDK, relying on CloudFormation, faces inherent challenges in managing resources across accounts. `Cluster.addManifest` does not automatically handle the necessary cross-account IAM role assumptions, making it cumbersome to use in shared EKS environments.
  * **AWS Best Practices Advocate Multi-Account EKS:** AWS itself recommends a multi-account strategy for EKS, as outlined in their official documentation on Multi Account Strategy for Amazon EKS. This document details how to share VPC subnets and leverage IAM Roles for Service Accounts (IRSA) for secure cross-account access. The stark contrast between these best practices and the limitations of `Cluster.addManifest` underscores the tool's inadequacy for real-world EKS deployments.

## Ignoring the Network Foundation: A House Without Proper Plumbing

A truly practical EKS solution, especially in multi-account setups, hinges on a robust network foundation. This typically involves:
  * **Transit Gateways:** To establish secure and scalable connectivity between VPCs across different accounts.
  * **VPC Sharing:** To allow multiple accounts to share a central VPC and its subnets, often hosting the EKS cluster.
  * **Private Subnets:** For enhanced security, ensuring that manifest deployments and application workloads operate within private network segments.

However, AWS CDK's EKS implementation, including blueprints like `aws-quickstart/cdk-eks-blueprints`, often overlooks or simplifies this critical network layer. While these tools may automate EKS cluster creation and even VPC provisioning, they frequently fall short of providing comprehensive, automated solutions for setting up Transit Gateways or VPC sharing as an integral part of the EKS deployment process.

In real-world EKS architectures, the network layer is not an afterthought; it is the foundation upon which a secure, scalable, and multi-account Kubernetes environment is built. CDK's focus on simplifying cluster creation while abstracting away network complexities leads to solutions that are ill-equipped for production-grade, shared EKS deployments.

## Token Resolution Failures: CDK's Promise Undermined

CDK's strength lies in its use of tokens – placeholders that are resolved during deployment, allowing for dynamic configurations and resource references. However, `Cluster.addManifest` fails to properly resolve these tokens, further hindering its practicality.

CDK tokens are designed to be resolved within the scope of a single CDK application and CloudFormation stack. When attempting to use a token from a resource within a manifest deployed to a cluster using `Cluster.addManifest`, token resolution often breaks down. CDK's default token resolution mechanisms are simply not designed to traverse account boundaries.

This limitation forces users to abandon CDK's elegant token-based approach and resort to manually passing concrete values – such as VPC IDs, subnet IDs, and security group IDs – as context parameters or environment variables to their CDK applications. This manual value passing is not only less elegant but also introduces more opportunities for errors and reduces the overall benefits of using CDK in the first place.

## Solution begin with networking:

Prerequisite: Embracing Application-Centric Infrastructure in the Cloud 1
  * **Environment:** All tightly coupled logical resources as a bounded context—a self-contained vertical slice with all resources needed to deliver a business capability, regardless of their physical location or type.
  * **Enver:** Environment Version, Different envers are logical/function consistent with different config values. An enver will deploy and rollback as a unit.
  * **Networking as service:** network team owns all VPC related resources (marked red in original text/diagram) by managing thru code and lib. The networking account running multiple networking envers, each networking enver contains and shares IPAM, VPC with transit gateway and NAT to workspace accounts, that will get a range of CIDR from shared IPAM and share NAT and internal naming system when deploying vpcs in workload envers. Each VPC can only connect to one Transit Gateway, so VPCs and their resources inside are connected thru TGW, but different TGW's connected VPCs are physically disconnected.
  * **RDS as service:** DB team owns DB cluster hosting DB for other envers that define/own/control DB/Schema/Role/User.
  * **EKS as service:** k8s team own Eks cluster host container orchestration for other envers that define/own/control k8s manifests and service account to IAM role mappings.
  * Same for EC2, MSK, Opensearch, ECS, ElasticCache, Redshift, private link ...

### In this diagram:

(Original text refers to a diagram not present here)

AWS Account Networking running two isolated envers, NT Enver LE and NT Enver Prod, take NT Enver Prod as example:

  1. One transit gateway connecting multiple VPCs across multiple accounts (same region);
  2. One NAT to share internet with all connected VPCs;
  3. One IPAM and CIDR pool for all connected VPCs' subnet to avoid IP conflicts;
  4. Not showing: subnet, routing, SG, DNS, hostedzone, Org, admin delegation, cert, ...

### Central VPC as proxy to deploy resources cross VPCs:

  1. Running Lambdas to deploy k8s manifest to different EKS clusters from different envers
  2. Running Lambdas to deploy DB/Schema/Role/User to different RDS clusters from different envers

### Central VPC as proxy/hub to connect cross VPCs: pods in EKS, tasks in ECS connecting to different databases in different RDS clusters from different envers:

#### Enver 1:

Declare/control all resources (marked green) inside logically, including k8s manifests and database's related resources (db, schema, role … ), deploy or roll back in transaction.

  1. Manifest deployed to EKS Enver1's cluster, pod assuming Iam role 1 (thru SA/oidc) to access dynamoDB.
  2. Database, schema, role/user deployed to RDS Enver Prod, ECS task inside assuming iam role 2 to access DB hosted thru TGW

#### Enver 2:

Declare/control all resources (marked purple) inside logically too, after Manifest deployed to EKS Enver1' cluster, pod will:

  1. Assume IAM role A to access DB thru transit gateway (no vpc needed in Enver 2!)
  2. Assume IAM role B to access S3bucket for files.

### The platform takes care of the deployments, so that apps and services just focus on business logic/function:

  1. The k8s manifests, declared in Enver 1 and Enver 2 will be sent to EKS Cluster thru Central Account's Lambda function in VPC-Prod.
  2. The DB schema/role/user declared in Enver 1 and Enver 2 will be sent to RDS Cluster thru Central Account's Lambda function in VPC-Prod.

## A Working Example of Enver-Centric Design

<https://github.com/ondemandenv/spring-boot-swagger-3-example>

This project exemplifies an application-centric approach to cloud-native development, where all resources (application code, infrastructure, dependencies) are defined as a single vertical "enver" - a self-contained bounded context that deploys/rolls back as a unit.

### 1\. Vertical Resource Ownership.

All resources needed to deliver this Tutorials API capability are co-located:
  * Application code (`src/`)
  * Container definition (`Dockerfile`)
  * Infrastructure-as-Code (CDK in `cdk/`)
  * IAM roles & policies
  * Database schema definitions
  * Service networking requirements

### 2\. Environment as Versioned Unit.

Each "enver" contains:
  * Logical resources (S3 buckets, IAM roles)
  * Physical resource references (VPC IDs, EKS cluster names)
  * Configuration values (S3 bucket name, OIDC provider ARN)
  * Cross-service dependencies (DB schemas, message queues)

### 3\. Platform Services Abstraction

(Original text might contain more here)

### Critical Integration Points

#### 1\. IAM Role Binding (CDK Stack)


    // cdk/lib/cdk-stack.ts
    const podSaRole = new Role(this, 'podSaRole', {
        assumedBy: new FederatedPrincipal(
            myEnver.oidcProvider.getSharedValue(this), // From platform enver
            {
                StringEquals: {
                    [`${oidcProvider}:aud`]: 'sts.amazonaws.com',
                    [`${oidcProvider}:sub`]: `system:serviceaccount:${namespace}:${serviceAccountName}`
                }
            },
            'sts:AssumeRoleWithWebIdentity'
        )
    });

#### 2\. Environment-Aware Configuration


    // src/main/java/com/bezkoder/spring/swagger/config/OpenAPIConfig.java
    @Value("${aws.s3.bucket-name}")
    private String bucketName; // Injected from enver-specific config

    @Bean
    public S3Client s3Client() {
        return S3Client.builder()
            .credentialsProvider(WebIdentityTokenFileCredentialsProvider.create())
            .build(); // Auto-utilizes IRSA credentials
    }

#### 3\. Infrastructure Consistency


    // cdk/lib/cdk-stack.ts
    new cdk8splus.Deployment(chart, 'to-eks', {
        containers: [{
            image: ContainerImage.fromEcrRepository(
                Repository.fromRepositoryName(this, 'repo',
                    myEnver.appImgRepoRef.getSharedValue(this)), // Shared ECR
                Fn.select(0, Fn.split(',', // Git SHA-based tagging
                    myEnver.appImgLatestRef.getSharedValue(this)))
            ),
            envVariables: {
                bucket_arn: {value: bucket.bucketArn}, // Enver-owned bucket
                region: {value: this.region} // Inherited from platform
            }
        }]
    });

### Key Benefits
  * **Atomic Deployments:** All resources (app + infra) deploy/rollback together using CloudFormation stack updates.
  * **Account Agnostic:** The enver's CDK code remains unchanged whether deploying to sandbox/prod accounts - physical account details are resolved through enver context.
  * **Secure by Default with least privileges.**

Obviously the whole design and implementation will depend on platform:

### Critical Platform Services
  * **Identity Broker:**
    * Central OIDC provider across all accounts
    * Auto-generates kubeconfig with enver-scoped permissions
    * Manages role trust relationships between 50+ AWS accounts
  * **Network Fabric Controller:**
    * Auto-provisions TGW attachments for new envers
    * Manages VPC sharing approvals through AWS RAM
    * Enforces subnet CIDR hygiene via IPAM
  * **Policy as Code Engine:**
    * Converts CDK IAM statements into OPA-validated permissions
    * Auto-remediates overly permissive policies
    * Generates cross-account access manifests
  * **Observability Hub:**
    * Collects metrics/logs from 15+ regions
    * Maintains enver-specific retention policies
    * Provides auto-generated Runbooks per service type

### What Developers Never See
  * Account ID Changes: `podSaRole.roleArn` resolves to `arn:aws:iam::ACCOUNT:role/envers/...` dynamically
  * Region Switching: Deployment pipelines auto-select regions based on enver SLA
  * VPC Peering: All cross-service communication flows through platform-managed TGW
  * Credential Rotation: IRSA roles auto-rotate using centralized `kms:RotateKey` policies

This platform transforms AWS multi-account complexity into safe, self-service enver deployments while maintaining enterprise-grade security - exactly what raw AWS CDK/EKS lacks.