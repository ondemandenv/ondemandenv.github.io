# 🚀 ONDEMANDENV

**Taming Distributed System Complexity Through Application-Centric Infrastructure**

<div align="center">

[![Website](https://img.shields.io/badge/Website-ondemandenv.dev-blue)](https://ondemandenv.dev)
[![Platform](https://img.shields.io/badge/Platform-AWS_CDK-orange)](https://aws.amazon.com/cdk/)
[![License](https://img.shields.io/badge/License-MIT-green)](https://opensource.org/licenses/MIT)

**Unlock true microservice agility. Free services from shared environments with isolated, on-demand lifecycles defined entirely by code.**

</div>

---

## 🌟 The Revolution

ONDEMANDENV transforms distributed system complexity into **Application-Centric Infrastructure** - enabling teams to manage their complete technology stack as a single, cohesive unit through **Unified Cloud Stacks**.

### ⚡ The Magic: Branch = Environment

```bash
# Create complete isolated environment for any feature
git commit -m "feature: new payment API

odmd: create@dev"

# Platform automatically provisions:
# ✅ AWS resources (S3, RDS, IAM roles)
# ✅ Kubernetes workloads and services  
# ✅ Cross-account network connectivity
# ✅ Security policies and monitoring
# ✅ Complete application stack
```

### 🔄 Traditional vs ONDEMANDENV

| Traditional Chaos | ONDEMANDENV Excellence |
|------------------|----------------------|
| 🔀 **Tool Sprawl**: CloudFormation + K8s + Terraform | 🔧 **Unified CDK**: Single tool for everything |
| 🤝 **Shared Bottlenecks**: dev/qa/prod conflicts | ⚡ **Isolated Environments**: Branch-specific stacks |
| 📜 **YAML Hell**: Manual configuration drift | 💻 **Code-Driven**: TypeScript with IntelliSense |
| 🤔 **Hidden Coupling**: Implicit dependencies | 📋 **Explicit Contracts**: Clear service boundaries |

---

## 🏗️ Architecture Ecosystem

![ONDEMANDENV Architecture](https://raw.githubusercontent.com/ondemandenv/.github/main/profile/img_4.png)

### 🎯 Three-Layer Innovation

#### 📋 **ContractsLib** - Architecture as Code
Central "Congress" where teams negotiate service boundaries through code contracts

#### 🏛️ **Platform Services** - Shared Infrastructure  
Enterprise-grade services (Networking, EKS, Databases) consumed without operational burden

#### 🚀 **Applications** - Unified Cloud Stacks
Real apps demonstrating AWS + Kubernetes unified in single codebases

---

## 🚀 Repository Ecosystem

### 🏛️ **Foundation**
- **[`contracts-base`](https://github.com/ondemandenv/odmd-contracts-base)** - Abstract interfaces & validation
- **[`contracts-sandbox`](https://github.com/ondemandenv/odmd-contracts-sandbox)** - Reference implementation & coffee shop demo

### 🌐 **Platform Services**
- **[`networking`](https://github.com/ondemandenv/networking)** - IPAM, Transit Gateway, cross-account VPCs
- **[`odmd-eks`](https://github.com/ondemandenv/odmd-eks)** - Production EKS with IRSA security
- **[`springcdk-rds`](https://github.com/ondemandenv/springcdk-rds)** - Database platform services

### 📱 **Application Examples**
- **[`spring-boot-swagger-3-example`](https://github.com/ondemandenv/spring-boot-swagger-3-example)** - Unified Cloud Stacks demo
- **[`coffee-shop--foundation`](https://github.com/ondemandenv/coffee-shop--foundation)** - Shared microservice infrastructure
- **[`coffee-shop--order-manager`](https://github.com/ondemandenv/coffee-shop--order-manager)** - Business service example

### 📚 **Documentation**
- **[`ondemandenv.github.io`](https://github.com/ondemandenv/ondemandenv.github.io)** - Comprehensive platform docs
- **[`user-pool`](https://github.com/ondemandenv/user-pool)** - Console authentication service

---

## 🎯 Core Innovation: Unified Cloud Stacks

### Before: Fragmented Nightmare 😞
```yaml
# infrastructure.yaml (CloudFormation)
Resources:
  MyBucket: { Type: AWS::S3::Bucket }

# app.yaml (Kubernetes) 
apiVersion: apps/v1
kind: Deployment
# ... manual secrets management ...
```

### After: Unified Excellence 🚀
```typescript
// Single CDK stack = Complete application
export class MyAppStack extends cdk.Stack {
  constructor() {
    // AWS Resources
    const bucket = new Bucket(this, 'AppBucket');
    const podRole = new Role(this, 'PodRole', {/* IRSA */});
    
    // Kubernetes Resources (cdk8s)
    const chart = new cdk8s.Chart(app, 'AppChart');
    new Deployment(chart, 'App', {
      containers: [{ 
        image: myImage,
        envVariables: { BUCKET_ARN: {value: bucket.bucketArn} }
      }],
      serviceAccount: { 
        annotations: {'eks.amazonaws.com/role-arn': podRole.roleArn} 
      }
    });
    
    // Platform deploys automatically
    new EksManifest(this, 'deploy', { manifest: chart });
  }
}
```

---

## ⚡ Quick Start Journey

### 1. 🎓 **Learn the Philosophy**
```bash
open https://ondemandenv.dev/concepts.html
```

### 2. 🔍 **Study the Architecture**  
```bash
git clone https://github.com/ondemandenv/odmd-contracts-sandbox
```

### 3. 🏗️ **Deploy Platform**
```bash
git clone https://github.com/ondemandenv/networking
cd networking && npx cdk deploy
```

### 4. 🚀 **Experience Unified Stacks**
```bash
git clone https://github.com/ondemandenv/spring-boot-swagger-3-example
cd spring-boot-swagger-3-example/cdk && npx cdk synth
```

---

## 🌟 Transformational Impact

### 📈 **Proven Results**
- **95% Faster** environment provisioning
- **80% Cost Reduction** through platform services  
- **Zero Configuration Drift** between environments
- **100% Audit Trail** for all access patterns

### 🎯 **For Every Team**

**🏢 Organizations**: Faster time-to-market, enhanced security, better governance  
**👨‍💻 Developers**: Focus on business logic, instant environments, unified toolchain  
**🛠️ Platform Teams**: Clear boundaries, explicit contracts, automated operations

---

## 🤝 Join the Revolution

### 🌐 **Community**
- 📧 [contacts@ondemandenv.dev](mailto:contacts@ondemandenv.dev)
- 🌐 [ondemandenv.dev](https://ondemandenv.dev)
- 💬 GitHub Discussions

### 🚀 **Business Opportunities** 
- 💼 Investment partnerships
- 🤝 Strategic collaborations  
- 💻 Consulting engagements

### 🤝 **Contributing**
Every repository welcomes contributions:
1. 🍴 Fork and explore
2. 🌿 Create feature branches  
3. ✅ Test thoroughly
4. 📝 Submit pull requests

---

<div align="center">

## 🚀 Ready to Transform Your Infrastructure?

**[📖 Explore Docs](https://ondemandenv.dev)** • **[🚀 Try Platform](https://github.com/ondemandenv/odmd-contracts-sandbox)** • **[💬 Get Support](mailto:contacts@ondemandenv.dev)**

**🌟 Star our repositories • 🍴 Fork and contribute • 📢 Spread the word**


</div> 