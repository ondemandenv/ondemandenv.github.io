---
layout: article
title: 'The EKS "Pants Off to Fart" Scenario: Accidental Complexity vs. ECS/CDK Simplicity in the SDLC'
permalink: /articles/eks-critique-series/part-3-pants-off-scenario/
author: "Gary Yang"
redirect_from:
  - /articles/eks-pants-off-scenario/
---

<div class="series-notice">
  <p><strong>This is Part 3 of a 9-part series on the hidden costs and complexities of Kubernetes.</strong></p>
  <p>This series deconstructs the hype, examines the architectural fallacies, and explores the cultural damage wrought by the "Kubernetes Complexity Engine."</p>
  <ol>
    <li><a href="/articles/eks-critique-series/part-1-dismantling-hype/">Dismantling the Kubernetes Hype</a></li>
    <li><a href="/articles/eks-critique-series/part-2-emperor-new-cluster/">The Emperor's New Cluster</a></li>
    <li><strong>The EKS "Pants Off to Fart" Scenario</strong> (You are here)</li>
    <li><a href="/articles/eks-critique-series/part-4-flawed-gitops-model/">How a Flawed GitOps Model Betrayed the Developer</a></li>
    <li><a href="/articles/eks-critique-series/part-5-bounded-contexts/">Kubernetes and Misaligned Boundaries</a></li>
    <li><a href="/articles/eks-critique-series/part-6-the-colonizers-tax/">The Colonizers: An EKS Complexity Tax</a></li>
    <li><a href="/articles/eks-critique-series/part-7-the-cultural-virus/">The Cultural Virus of Complexity</a></li>
    <li><a href="/articles/eks-critique-series/part-8-the-authority-problem/">The Authority Problem: Shallow Leadership</a></li>
    <li><a href="/articles/eks-critique-series/part-9-engineering-victory/">Kubernetes 2.0: The Engineering Victory</a></li>
  </ol>
</div>

Deploying a standard web application – a Spring Boot or Express container, secured with a certificate and DNS, fronted by an Application Load Balancer (ALB), and backed by an RDS database – is a common pattern. However, the journey through the Software Development Life Cycle (SDLC) diverges dramatically depending on whether you choose Amazon EKS (Elastic Kubernetes Service) or a more integrated AWS-native approach like ECS (Elastic Container Service) with the AWS CDK (Cloud Development Kit) and CloudFormation.

This article details why, for many enterprise applications, the EKS route often becomes an exercise in "taking off pants to fart" (脱了裤子放屁): an introduction of profound, unnecessary, and counterproductive accidental complexity, especially when contrasted with the cohesive efficiency of CDK/CloudFormation.

### Scenario 1: The EKS Gauntlet – Navigating a Labyrinth of YAMLs and In-Cluster Reinventions

#### 1\. The "Taking Off Pants" Act: Initial EKS Cluster Setup

Before you can even think about deploying your application container, a colossal amount of effort is required to set up a production-ready EKS cluster. This isn't a simple "click-and-go" process:
  * **VPC and Networking Intricacies** : Planning VPCs, subnets (public and private), NAT Gateways, Internet Gateways, and ensuring sufficient IP address space for pods and services is complex and error-prone. Missteps here can lead to IP exhaustion and require significant rework.
  * **Control Plane and Worker Nodes** : Configuring the EKS control plane, worker node groups (EC2 or Fargate), instance types, AMIs, and auto-scaling policies.
  * **Core Components** : Installing and configuring essential add-ons like the VPC CNI plugin, CoreDNS, and kube-proxy.
  * **Security Hardening** : Implementing security best practices for the control plane, worker nodes, and network policies.
  * **Observability Basics** : Setting up basic logging and monitoring for the cluster itself, often involving tools like CloudWatch Container Insights, which, while integrated, still require configuration within the EKS context[^3].
  * **IAM and OIDC** : Establishing an IAM OIDC provider for the cluster to enable IAM Roles for Service Accounts (IRSA). This allows Kubernetes service accounts to assume IAM roles for accessing AWS services, a critical but complex setup step[^5].

This initial setup, often managed via tools like Terraform or even CDK, is the first layer of complexity—the elaborate disrobing before you can even address the application's needs. Many teams underestimate this initial investment and the ongoing maintenance of the cluster itself, which EKS only partially abstracts[^4].

#### 2\. The Application Container SDLC: A Symphony of Disparate YAMLs

Once the EKS cluster is up, deploying your simple web application becomes a sprawling exercise in YAML engineering and in-cluster reinvention of AWS services:
  * **Tons of YAMLs for Basic Functionality** :
    * **Deployment/Pod YAML** : Defines your application container, image, ports, resource requests/limits, environment variables, and volume mounts.
    * **Service YAML** : To expose your application pods internally within the cluster.
    * **Ingress YAML** : To expose the Service externally, instructing the AWS Load Balancer Controller (another in-cluster component you must install and manage) to provision an ALB. This YAML will be littered with AWS-specific annotations to configure the ALB.
    * **ServiceAccount YAML** : To define a Kubernetes ServiceAccount for your application pods.
    * **IAM Role Mapping (IRSA)** : Additional annotations on the ServiceAccount YAML, or separate IAM Role and Policy configurations in AWS, to map the Kubernetes ServiceAccount to an AWS IAM Role, allowing your pod to securely access other AWS services like RDS. This involves understanding OIDC federation and trust policies.
    * **ConfigMap/Secret YAMLs** : For application configuration and sensitive data.
    * **NetworkPolicy YAMLs** : If you need to restrict traffic flow between pods. EKS allows full control over pod-level networking but requires careful CNI plugin configuration and network policy definitions[^5].
    * **Cert-Manager YAMLs (CRDs, Deployments, Issuers, Certificates)** : To manage TLS certificates, often integrating with AWS Certificate Manager (ACM) via yet another in-cluster controller.
    * **(Optional) ACK YAMLs for RDS** : If you attempt to manage RDS or other AWS resources via AWS Controllers for Kubernetes (ACK), you introduce more Custom Resource Definitions (CRDs) and YAML manifests specific to AWS services.

Consider the convoluted journey of just one `kind: Deployment` manifest (or any other Kubernetes resource manifest, especially one managed by ACK like an RDS instance) when applied via `kubectl apply -f my-deployment.yaml`. First, `kubectl` sends the YAML to the Kubernetes API server. The API server then performs **authentication** (who is making this request?) and **authorization** (do they have permission to create/update Deployments in this namespace?) . If these pass, the request proceeds to **admission controllers** . Mutating admission webhooks might alter the Deployment object (e.g., injecting sidecars or default labels) . Then, validating admission webhooks check if the (now potentially mutated) object conforms to cluster policies (e.g., Gatekeeper policies) . Only if all these hurdles are cleared is the Deployment object finally persisted to the **`etcd` database**.

But the journey isn't over. For an ACK-managed resource like an RDS instance described in a custom YAML (e.g., `kind: DBInstance`), once its definition hits `etcd`, the relevant **ACK controller** (e.g., `rds-controller`) notices this new custom resource via its control loop. This controller, running in a Pod within EKS, must then **assume an AWS IAM Role** (configured via IRSA, which itself is a complex mapping of Kubernetes ServiceAccounts to IAM Roles) to gain permissions to **call AWS APIs** (e.g., the RDS API to create or update the database instance) . This entire multi-step, indirect process happens for _each YAML file applied_ , and critically, **these YAML resources are applied and processed separately by Kubernetes with no inherent, unified dependency management between them**. If your application Pod YAML is applied before the ConfigMap YAML it depends on is fully processed and available, or before the ACK controller has successfully provisioned the RDS instance and populated a Secret with its endpoint, the Pod will fail or enter a crash loop. There's no built-in mechanism in the `kubectl apply` process for multiple, disparate YAML files to understand or wait for each other's underlying resources to be truly "ready." This lack of cohesive dependency management across individually applied YAMLs is a core source of the fragility and inconsistency.
  * **Maintaining Consistency Between Them – The Nightmare** :
    * **Implicit Dependencies** : The `Deployment` needs the `ServiceAccount`, which needs the IAM mapping. The `Ingress` needs the `Service` and the `Certificate` from cert-manager. These dependencies are not explicitly managed by a unified system; they are just references in YAML files. A typo in a name can break the chain.
    * **Mapping Abstractions** : You're constantly mapping Kubernetes concepts to AWS concepts (Kubernetes ServiceAccount to IAM Role, Ingress annotations to ALB features, NetworkPolicy to Security Group-like behavior). This "translation layer" is a major source of errors and cognitive overhead.
    * **Tooling Tail-Chasing (Kustomize/Helm)** : To manage the inevitable YAML sprawl and environment variations, teams resort to tools like Kustomize or Helm. While intended to help, they often add another layer of templating or patching complexity. Debugging a Helm chart rendering issue or a Kustomize overlay misconfiguration becomes another skill to master. These tools are effectively "band-aids" over the fundamental problem of excessive, disconnected YAML.
    * **Ineffective PRs and Pre-Deployment Testing** : Reviewing pull requests with dozens of interrelated YAML changes is incredibly difficult. It's nearly impossible to fully verify or test the holistic impact of these changes before deployment because:
      * **Few, Expensive Environments** : Setting up multiple, fully representative EKS environments (dev, staging, test) is costly and time-consuming due to the initial setup overhead. EKS incurs an hourly fee for the control plane, in addition to worker node costs[^6].
      * **Inconsistent State *Within* Environments** : The state of resources *inside* the EKS cluster (managed by `kubectl apply`) and resources *outside* the cluster (like the RDS instance itself if not managed by ACK, or IAM roles created manually/via separate IaC) can easily drift. There's no unified dependency or version management across these boundaries. A ConfigMap might expect an RDS endpoint that has been changed outside of Kubernetes, or an IAM role might lack a permission that a new version of the pod requires.
    * **Inconsistency *Between* Environments** : With no strong, unified state and dependency management, ensuring that dev, staging, and production environments are truly consistent is a constant struggle. Configuration drift is rampant.
  * **The Mess Scales with Resources** : The more microservices, the more external dependencies, the more AWS services you try to manage or integrate with via ACK or controllers, the exponentially messier the EKS environment becomes. The web of YAMLs, annotations, CRDs, and implicit dependencies becomes a tangled nightmare.

#### 3\. The Translation Layer Complexity: Same Destination, Tortuous Journey

The diagram below illustrates the fundamental difference between EKS and ECS approaches. Both ultimately make the same AWS API calls to provision the same AWS services (ALB, RDS, Route53, VPC, IAM), but EKS introduces multiple translation layers that create accidental complexity, resource overhead, and engineering friction:

<div id="eks-ecs-complexity-comparison-diagram" 
     class="mermaid-diagram-simple" 
     data-external-diagram="/diagrams/eks-ecs-complexity-comparison.mmd">
</div>

<div style="text-align: center; margin: 1rem 0;">
    <a href="/mmd-render.html?mmd=diagrams/eks-ecs-complexity-comparison.mmd" 
       target="_blank" 
       style="display: inline-flex; align-items: center; gap: 0.5rem; background: #0366d6; color: white; padding: 0.5rem 1rem; border-radius: 4px; text-decoration: none; font-size: 0.9rem; transition: all 0.2s ease;">
        🔍 View Fullscreen
    </a>
</div>

**Key Observations:**

1. **Accidental Complexity**: EKS requires multiple translation layers (red boxes) - each YAML manifest goes through Kubernetes API server, etcd storage, multiple in-cluster controllers, and IRSA token exchange before reaching AWS APIs. ECS goes directly from CDK to AWS APIs (green boxes).

2. **Resource Cost**: EKS runs numerous controllers as pods (AWS Load Balancer Controller, EBS CSI Driver, VPC CNI, External DNS, ACK controllers) that consume CPU, memory, and network resources just to translate Kubernetes concepts to AWS APIs. ECS eliminates this overhead.

3. **Engineering Effort**: EKS requires mastering Kubernetes concepts (ServiceAccounts, RBAC, CRDs, Ingress annotations), AWS-specific translations (IRSA, ALB annotations), and the interplay between them. ECS requires learning only AWS concepts directly.

4. **Missed Opportunities**: Each translation layer introduces potential failure points, debugging complexity, and maintenance overhead. ECS's direct approach enables faster iteration, clearer troubleshooting, and more predictable deployments.

The irony is stark: both approaches provision identical AWS infrastructure, but EKS achieves this through a labyrinthine process of translations that adds no business value while consuming significant engineering resources.

#### 4\. The Broken Promises: No Portability, Incomplete Abstraction

The translation complexity becomes even more insulting when you realize that EKS's core value propositions—**cloud portability** and **consistent abstraction**—are fundamentally broken:

**Myth 1: "Kubernetes YAMLs are portable across clouds"**

Despite all the translation layers, your EKS YAMLs are deeply AWS-specific and completely non-portable:

```yaml
# This Ingress YAML is AWS-specific, not portable
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  annotations:
    kubernetes.io/ingress.class: alb                    # AWS ALB Controller
    alb.ingress.kubernetes.io/scheme: internet-facing   # AWS-specific
    alb.ingress.kubernetes.io/target-type: ip           # AWS-specific
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:...  # AWS ARN
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
    alb.ingress.kubernetes.io/ssl-redirect: '443'       # AWS ALB feature
    alb.ingress.kubernetes.io/healthcheck-path: /health
    alb.ingress.kubernetes.io/tags: Environment=prod,Team=backend
```

Try deploying this on Google GKE or Azure AKS—it will fail spectacularly because:
- Google uses different ingress controllers with different annotations (`cloud.google.com/...`)
- Azure uses different ingress controllers with different annotations (`kubernetes.io/ingress.class: azure/...`)
- The certificate management, load balancer features, and networking concepts are cloud-specific

**The same application requiring cloud-specific YAMLs defeats the entire portability argument.** You're not writing portable Kubernetes; you're writing AWS-flavored Kubernetes with extra complexity.

**Myth 2: "Kubernetes abstractions map cleanly to cloud concepts"**

The fundamental impedance mismatch between Kubernetes and AWS concepts creates incomplete, leaky abstractions:

```yaml
# Kubernetes ServiceAccount - overly simplistic
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-app-sa
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/MyAppRole
---
# What this actually needs in AWS IAM - much more complex
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::123456789012:oidc-provider/oidc.eks.us-west-2.amazonaws.com/id/EXAMPLE"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.eks.us-west-2.amazonaws.com/id/EXAMPLE:sub": "system:serviceaccount:default:my-app-sa",
          "oidc.eks.us-west-2.amazonaws.com/id/EXAMPLE:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
```

**Key Conceptual Mismatches:**

1. **ServiceAccount vs IAM Role**: Kubernetes ServiceAccounts are namespace-scoped, simple identity tokens. AWS IAM Roles are global, complex policy-based identities with trust relationships, conditions, and resource-based policies. The IRSA translation is a complex hack, not a natural mapping.

2. **RBAC vs IAM Policies**: Kubernetes RBAC is resource-verb based within a cluster (`get pods`, `create services`). AWS IAM is action-resource based across all AWS services (`s3:GetObject`, `rds:CreateDatabase`). They're fundamentally different authorization models.

3. **NetworkPolicy vs Security Groups**: Kubernetes NetworkPolicies are pod-label based and declarative. AWS Security Groups are instance-based, stateful, and imperative. The VPC CNI tries to bridge this gap but creates a complex, non-portable abstraction.

4. **Ingress vs ALB**: Kubernetes Ingress is a simple HTTP routing abstraction. AWS ALB is a sophisticated Layer 7 load balancer with advanced features (WAF integration, Lambda targets, authentication, etc.). The annotations-based mapping is clunky and exposes AWS-specific concepts anyway.

**The Result:** You get the worst of both worlds—Kubernetes complexity plus AWS complexity, with impedance mismatches that create bugs, limitations, and maintenance headaches. The abstractions are leaky, the YAMLs are non-portable, and you still need to understand AWS IAM, VPC, and ALB concepts deeply.

#### 5\. The Organizational Fallout: Gatekeeping and Kidnapping

This immense, unwieldy complexity creates the perfect conditions for an EKS cluster operating team (often a platform or Ops team) to become a powerful gatekeeper:
  * **Specialized Knowledge Required** : Understanding the intricacies of EKS, its networking, security, controllers, and the interplay of YAMLs becomes a niche skill. EKS has a steeper learning curve compared to ECS[^5].
  * **Fear of Breaking Things** : The fragility of the interconnected YAMLs and the difficulty in testing make teams risk-averse.
  * **Centralized Control as a "Solution"** : The Ops team often takes control of all `kubectl apply` operations, CI/CD pipelines for Kubernetes, and the management of shared controllers (ALB controller, cert-manager, ACK controllers) as a way to "ensure stability."
  * **Kidnapping the Engineering Department** : Development teams, who should be focused on delivering business value through their microservices, are now beholden to the Ops team's processes, timelines, and interpretations of Kubernetes best practices. Agility plummets. Innovation is stifled. This is the antithesis of the microservice philosophy of autonomous, empowered teams.

### Scenario 2: ECS with CDK/CloudFormation – Simplicity, Cohesion, and Developer Velocity

Contrast the EKS scenario with deploying the same web application using ECS and defining all infrastructure with AWS CDK (which synthesizes CloudFormation). ECS is designed for simplicity and deep integration with the AWS ecosystem[^4].
  * **Unified Infrastructure as Code (IaC)** :
    * With CDK, you use a familiar programming language (TypeScript, Python, Java, etc.) to define all components of your application stack in a single project. An example of building a Fargate ECS application with CDK demonstrates this cohesive approach[^9].
    * This includes the ECS Service (container definition, CPU/memory, port mappings), the Application Load Balancer, listeners, target groups, ACM certificates, Route 53 DNS records, the RDS database instance, VPC, subnets, security groups, and all necessary IAM roles and policies.
    * CDK offers high-level constructs (e.g., `ApplicationLoadBalancedFargateService`) that provision many of these interconnected resources with sensible defaults and minimal code.

In stark contrast, when you define your entire application stack (ECS service, ALB, RDS, IAM roles, security groups, etc.) using AWS CDK, the process is fundamentally simpler, more direct, and inherently flexible. Your CDK code, written in a familiar programming language, describes the desired state of _all_ resources and their interdependencies. When you run `cdk deploy`, the CDK synthesizes this into a single AWS CloudFormation template. CloudFormation then takes over, acting as a unified orchestration engine. It understands the **explicit and implicit dependencies** between all resources defined in the template (e.g., an ECS Task Definition needing an IAM Role, an ALB Listener needing a Target Group, which in turn needs the ECS Service). CloudFormation provisions these resources in the correct order, waits for dependencies to be met, and if any part of the deployment fails, it can automatically roll back the _entire stack_ to the last known good state, ensuring consistency. There's no separate, out-of-band API call from an in-cluster controller assuming an IAM role; CloudFormation itself operates with the necessary permissions to orchestrate all defined AWS resources directly and cohesively. This unified model with built-in dependency management and transactional updates drastically simplifies the SDLC, enhances reliability, and provides true end-to-end control over the application environment.
  * **Total Control and Consistency** :
    * **Explicit Dependencies** : CloudFormation (generated by CDK) inherently understands the dependencies between all resources in the stack. It creates, updates, or deletes them in the correct order.
    * **Transactional Deployments** : If any part of the stack deployment fails, CloudFormation automatically rolls back the entire stack to the last known good state, ensuring consistency.
    * **Environment Replication as Code** : Creating a new, identical environment (dev, staging, prod) is as simple as deploying the same CDK app with different environment-specific parameters (e.g., instance sizes, database names). `cdk deploy MyStagingStack`, `cdk deploy MyProdStack`. This drastically reduces setup costs and ensures high fidelity between environments.
    * **Holistic Management** : There's no "inside cluster" vs. "outside cluster" resource drift. _All_ components of the application's environment are defined and managed within the same CDK application/CloudFormation stack.
    * **Effective PRs and Testing** : Infrastructure changes are code changes. They can be reviewed, linted, and unit-tested like any other software. "What-if" scenarios can be explored by synthesizing CloudFormation templates (`cdk synth`) before deployment.
  * **Simplified SDLC and Team Autonomy** :
    * **Developer Empowerment** : Development teams can own their entire application stack via CDK. They can define the infrastructure their application needs alongside the application code itself, often in the same repository.
    * **Reduced Gatekeeping** : There's less need for a central Ops team to manually manage disparate YAMLs or control deployment pipelines. CI/CD pipelines can directly deploy CDK applications.
    * **Faster Iteration** : Teams can provision and tear down full environments quickly, enabling faster testing cycles and more confident deployments. ECS is generally considered easier to get started with and simpler for AWS users[^4][^5].

### Conclusion: Choosing Simplicity Over Self-Inflicted Wounds

For the described enterprise web application (container, cert/DNS -> ALB -> container -> RDS), the EKS path often leads to a quagmire of accidental complexity. The initial "pants off" effort of setting up EKS is just the beginning. The ongoing SDLC becomes a battle against YAML sprawl, inconsistent environments, fragile dependencies, and organizational bottlenecks created by the very platform intended to provide flexibility. The AWS-specific nature of ACK and annotations further negates the portability argument—a key reason organizations might choose EKS—while adding another layer of indirection[^2][^5].

In stark contrast, using ECS with CDK/CloudFormation offers a natively integrated, cohesive, and far simpler approach. It allows each team to manage its application's entire lifecycle via a few well-structured CDK applications, resulting in total SDLC control, easy environment replication, and significantly less operational friction. ECS is often recommended when organizations are tightly coupled to AWS and seek simplicity[^5].

Before defaulting to EKS because "Kubernetes is the standard," organizations must critically assess if they are choosing a powerful, general-purpose tool for a job that a simpler, more integrated solution can do far more efficiently—without the "pants off to fart" theatrics. For many common enterprise workloads on AWS, the answer is a resounding yes.

#### References

[^1]: <https://tutorialsdojo.com/amazon-eks-vs-amazon-ecs/>
[^2]: <https://www.reddit.com/r/aws/comments/vd3izl/ecs_vs_eks/>
[^3]: <https://www.site24x7.com/learn/aws/aws-ecs-vs-eks.html>
[^4]: <https://www.nops.io/blog/aws-eks-vs-ecs-the-ultimate-guide/>
[^5]: <https://www.clickittech.com/cloud-services/amazon-ecs-vs-eks/>
[^6]: <https://buzzgk.hashnode.dev/a-quick-comparison-of-ecs-and-eks>
[^7]: <https://docs.aws.amazon.com/decision-guides/latest/containers-on-aws-how-to-choose/choosing-aws-container-service.html>
[^8]: <https://www.economize.cloud/blog/aws-eks-vs-ecs/>
[^9]: <https://www.ranthebuilder.cloud/post/build-a-serverless-web-application-on-fargate-ecs-and-cdk>

---

<div class="series-navigation">
  <a href="/articles/eks-critique-series/part-2-emperor-new-cluster/" class="previous">&laquo; Previous: Part 2</a>
  <a href="/articles/eks-critique-series/part-4-flawed-gitops-model/" class="next">Next: Part 4 &raquo;</a>
</div>
