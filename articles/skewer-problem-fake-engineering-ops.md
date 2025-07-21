---
layout: article
title: "The Skewer Problem: How Fake Engineering in Ops Hijacked the SDLC"
description: "Why tool mastery disguised as engineering is strangling software development, and what real engineering actually looks like"
date: 2025-07-21
author: "ONDEMANDENV Platform Team"
tags: ["Platform Engineering", "DevOps", "Architecture", "SDLC", "Engineering Principles"]
permalink: /articles/skewer-problem-fake-engineering-ops/
---

# The Skewer Problem: How Fake Engineering in Ops Hijacked the SDLC

*They call it engineering. It's not. It's templated automation wrapped in the illusion of design. And it's choking the craft of software development.*

## The Great Inversion: From Support to Stranglehold

In today's tech organizations, a dangerous inversion has taken root. What was once a support function—operations—has rebranded itself as "platform engineering," "DevOps," or "SRE," claiming ownership of the entire Software Development Life Cycle under the guise of infrastructure mastery.

But peel back the layers of Kubernetes YAML and CI pipeline configurations, and you'll find **tools, not systems; scripts, not models; process control, not engineering**.

They hold the keys to deployment, runtime, rollback, and observability—all while speaking in Helm charts and CI pipelines instead of code, architecture, and logic. These are **not engineers**. These are **skewers**—narrow-purpose tool specialists masquerading as system architects.

**And it's time software engineers reclaimed their craft.**

## What Is Engineering, Really?

Before we can identify its imposters, we must define authentic engineering. True engineering—whether in software, mechanical, or any other discipline—is characterized by:

### Abstraction and Modeling
Real engineering creates **layered abstractions** that hide complexity while preserving essential properties. Engineers don't just configure tools; they build conceptual models that make complex systems understandable and predictable.

```typescript
// Engineering: Abstraction that captures essential business concepts
class OrderProcessor {
  process(order: Order): Promise<OrderResult> {
    return this.validateInventory(order)
      .then(confirmed => this.processPayment(confirmed))
      .then(paid => this.fulfillOrder(paid))
      .then(fulfilled => this.notifyCustomer(fulfilled));
  }
}

// vs. Ops Tooling: String manipulation masquerading as architecture
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: order-processing-
spec:
  templates:
  - name: process-order
    steps:
    - - name: validate-inventory
        template: curl-template
        arguments:
          parameters:
          - name: url
            value: "http://inventory-service/validate"
```

### Composability and Reusability
Engineering creates **composable components** that can be combined in novel ways. Each component has well-defined interfaces and can be tested in isolation.

### Static Guarantees and Validation
Engineering systems provide **compile-time guarantees** about correctness. You can reason about system behavior before it runs.

### Behavior Modeling and Simulation: The Missing Foundation of Modern Engineering
Engineers build systems where **behavior can be predicted, simulated, and tested** under various conditions. Changes can be evaluated before implementation.

**This is perhaps the most critical engineering capability that ops tooling systematically destroys.**

Real engineering requires the ability to create **controlled experimental environments** where you can:

```typescript
// Engineering: Complete system simulation and testing
const testEnvironment = new SystemSimulator({
  services: [userService, paymentService, inventoryService],
  dataFixtures: realisticTestData,
  failureScenarios: [
    new NetworkPartition([userService, paymentService]),
    new DatabaseSlowdown(inventoryService.database, { latency: '5s' }),
    new ServiceCrash(paymentService, { after: Duration.minutes(2) })
  ]
});

// Test: What happens when payment service crashes during checkout?
const result = await testEnvironment.simulate(
  new CheckoutFlow(customer, shoppingCart),
  new ServiceCrash(paymentService, { timing: 'mid-transaction' })
);

expect(result.customerExperience).toBe(GracefulDegradation);
expect(result.dataConsistency).toBe(Maintained);
expect(result.recoverySLA).toBeLessThan(Duration.seconds(30));
```

**Ops tooling makes this impossible**:
- **Shared environments** prevent controlled experiments
- **YAML configurations** can't model complex behaviors
- **CI/CD pipelines** only test deployment, not operation
- **Manual processes** make simulation too expensive to iterate on

The result: Engineers deploy changes without understanding their behavioral impact, leading to production surprises that could have been caught in simulation.

#### What Real Simulation Looks Like

Engineering-grade simulation requires:

```typescript
// Complete system behavior modeling
const testEnvironment = new SystemSimulator({
  topology: productionTopology,
  dataFixtures: realisticDataSet,
  networkConditions: productionNetworkProfile,
  failureInjection: [
    new ServiceFailure(paymentService, { meanTimeToFailure: Duration.hours(8) }),
    new NetworkLatency({ p99: Duration.milliseconds(500) }),
    new DatabaseContention({ concurrentConnections: 200 })
  ]
});

// Verify system behavior under realistic conditions
const results = await testEnvironment.runSimulation(Duration.hours(24));
assert(results.dataConsistency === 'maintained');
assert(results.customerExperienceImpact < 0.01);
```

This transforms engineering from **"hope and deploy"** to **"simulate and verify"**—the difference between ops tooling and real engineering.

### Systematic Problem Decomposition
Engineering breaks down complex problems into **well-defined subproblems** with clear interfaces and responsibilities.

**Operations tooling fails nearly all of these criteria.**

## The Skewer Ecosystem: Tools Masquerading as Systems

Most "platform engineering" solutions are glorified automation scripts dressed up with engineering terminology:

### Helm: String Substitution Theater
```yaml
# This is not engineering—it's templated configuration
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Values.service.name }}
spec:
  replicas: {{ .Values.replicaCount }}
  template:
    spec:
      containers:
      - name: {{ .Chart.Name }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
        env:
        {{- range .Values.env }}
        - name: {{ .name }}
          value: "{{ .value }}"
        {{- end }}
```

**What this actually is**: String substitution with YAML syntax highlighting. No type safety, no compositional guarantees, no testable abstractions. Just text replacement with a configuration file.

**What engineering would look like**:
```typescript
const orderService = new Service(this, 'OrderService', {
  image: orderServiceImage,
  replicas: Replicas.autoscaling({ min: 2, max: 10 }),
  resources: Resources.standard(),
  dependencies: [database, messageQueue],
  healthCheck: new HealthCheck('/api/health', { timeout: Duration.seconds(5) })
});
```

### Terraform: State Mutation in Disguise
```hcl
# Terraform presents as declarative but operates imperatively
resource "aws_rds_instance" "main" {
  allocated_storage    = 20
  engine              = "postgres"
  engine_version      = "13.7"
  instance_class      = "db.t3.micro"
  
  # But what happens when you change engine_version?
  # Imperative replacement operation disguised as declaration
}
```

**The illusion**: Terraform markets itself as "declarative," but it's actually an imperative system that maintains state and performs mutations. The `.tf` files are not system descriptions—they're instructions for state transitions that often fail in unpredictable ways.

**Engineering approach**: Systems that can reason about transitions, validate them before execution, and provide guarantees about outcomes:
```typescript
const database = new DatabaseMigrator(this, 'MainDB', {
  from: DatabaseVersion.POSTGRES_13_7,
  to: DatabaseVersion.POSTGRES_14_2,
  migrationStrategy: MigrationStrategy.BLUE_GREEN,
  rollbackPlan: new RollbackPlan({ timeout: Duration.minutes(5) })
});
```

### ArgoCD: Git Folder Structure as Architecture
ArgoCD treats **Git repository organization** as system architecture. If your YAML files are in the right folders, ArgoCD assumes your system is correct. This conflates **document organization with system design**.

```
# ArgoCD "architecture"
├── environments/
│   ├── dev/
│   │   └── app.yaml     # Same app, different folder = different system?
│   └── prod/
│       └── app.yaml     # Folder structure ≠ System boundaries
└── applications/
    └── user-service/
        └── deployment.yaml
```

**What this misses**: Actual dependencies, data flow, failure modes, performance characteristics, security boundaries—everything that defines real system architecture.

### CI Pipelines: Logic Flows with Zero Modularity
```yaml
# GitHub Actions: Imperative scripts with YAML syntax
name: Deploy
on: [push]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - name: Checkout
      uses: actions/checkout@v2
    - name: Build
      run: docker build -t app .
    - name: Deploy
      run: kubectl apply -f k8s/
    # What about error handling? Rollback? Dependencies? Testing?
    # Hope and manual intervention.
```

These are **procedural scripts** with no abstraction, no error handling guarantees, no composability, and no testability. They masquerade as "deployment engineering" but lack every characteristic of actual engineering.

## The Architectural Hostage Situation

This ops theater creates a **systematic architectural hostage situation** where real engineers are constrained by the limitations of ops tooling:

### Engineers Forced into Tool-Shaped Cages
```typescript
// What engineers want to express
class UserService {
  private database: TypedDatabase<UserSchema>;
  private cache: RedisCache<UserCacheEntry>;
  private messageQueue: EventBus<UserEvents>;
  
  async createUser(userData: CreateUserRequest): Promise<User> {
    // Typed, testable, composable business logic
  }
}

// What ops tooling forces them into
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: user-service-config
data:
  DATABASE_URL: "postgres://..."  # Stringly typed
  CACHE_URL: "redis://..."        # No compile-time guarantees
  QUEUE_URL: "sqs://..."          # Hope it works in production
```

### Tooling Determines Architecture
Engineers can't use **typed configurations**, **compile-time dependency validation**, or **testable infrastructure** because ops teams have standardized on tools that don't support these engineering practices.

Want to ensure your database schema matches your application models? "Too bad, we use Helm and YAML only."

Want to simulate failure scenarios? "We don't support that in our CI pipeline."

Want type-safe environment configuration? "Everything goes through Kubernetes ConfigMaps as strings."

### Career Tracks Shift Toward Glue Work
**The perverse incentive structure**: Organizations reward engineers for becoming proficient in ops tooling rather than advancing their engineering skills.

Career progression becomes:
1. Junior Engineer → Learn React/Python/Java
2. Mid-level Engineer → Learn Kubernetes and Docker
3. Senior Engineer → Learn Helm, Terraform, and CI/CD
4. Staff Engineer → Maintain fragile pipeline configurations

**The real progression should be**:
1. Junior Engineer → Learn language and basic patterns
2. Mid-level Engineer → Learn system design and architecture
3. Senior Engineer → Learn domain modeling and distributed systems
4. Staff Engineer → Design new systems and coach others

### Innovation Hostage to "Platform Compatibility"
```
Engineer: "I want to implement event sourcing for audit trails."
Platform Team: "Our Helm charts don't support that pattern."

Engineer: "I need type-safe configuration management."
Platform Team: "Everything has to go through Kubernetes ConfigMaps."

Engineer: "I want to test disaster scenarios."
Platform Team: "Our CI pipeline doesn't have that capability."
```

The ops infrastructure becomes a **creativity ceiling** rather than a productivity enabler.

## The Business Logic Disconnect: When Ops Controls What It Doesn't Understand

The most damaging aspect of the ops takeover is that **operations teams make architectural decisions about business logic they don't understand**.

### The Service Mesh Fragmentation Example
```yaml
# Ops team decision: "We'll use Istio for everything"
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: user-service
spec:
  http:
  - match:
    - headers:
        user-type:
          exact: premium
    route:
    - destination:
        host: user-service-premium
        port:
          number: 8080
```

**What ops teams see**: "We're implementing sophisticated traffic routing."

**What this actually does**: Forces business logic (premium user handling) into infrastructure configuration, making it invisible to application developers and impossible to test with normal software engineering practices.

**The engineering approach**:
```typescript
class UserService {
  handleRequest(request: UserRequest): Promise<UserResponse> {
    if (request.user.tier === UserTier.PREMIUM) {
      return this.premiumService.handle(request);
    }
    return this.standardService.handle(request);
  }
}
```

Business logic belongs in code where it can be **tested, versioned, and understood by domain experts**.

### The Database Schema Evolution Nightmare
Ops teams control database deployments but don't understand the schema evolution requirements:

```yaml
# Ops-controlled database "management"
apiVersion: v1
kind: Job
metadata:
  name: db-migration
spec:
  template:
    spec:
      containers:
      - name: migrate
        image: postgres:13
        command: ["psql", "-f", "migration.sql"]
```

**What's missing from ops tooling**:
- Schema validation against application models
- Rollback strategies for failed migrations
- Performance impact assessment
- Data consistency guarantees during migration
- Integration testing with application code

**Engineering approach**:
```typescript
const migration = new DatabaseMigration(this, 'AddUserPreferences', {
  from: UserSchema_v1,
  to: UserSchema_v2,
  validation: new SchemaValidator(ApplicationModels.User),
  rollbackPlan: new RollbackPlan({ 
    preserveData: true,
    maxDowntime: Duration.seconds(30)
  }),
  testing: new MigrationTest({
    loadTestData: sampleUserData,
    validateConsistency: true
  })
});
```

## Engineering-First Infrastructure: What It Actually Looks Like

### Contracts and Interfaces Over Configuration
```typescript
// Infrastructure described with engineering principles
interface ServiceContract {
  runtime: RuntimeSpec;
  dependencies: ServiceDependencies;
  resources: ResourceRequirements;
  healthChecks: HealthCheckSpec[];
  
  // Type-safe configuration instead of string soup
  validateConfiguration(): ValidationResult;
  
  // Testable interfaces instead of hope
  simulateFailure(scenario: FailureScenario): Promise<SystemBehavior>;
}

class UserServiceContract implements ServiceContract {
  constructor(
    private database: DatabaseContract,
    private cache: CacheContract,
    private messageQueue: QueueContract
  ) {}
  
  // Explicit, typed dependencies with compile-time validation
  validateConfiguration(): ValidationResult {
    return TypeChecker.validate({
      database: this.database.supportsSchema(UserSchema),
      cache: this.cache.supportsKeyType(UserCacheKey),
      queue: this.messageQueue.supportsEventType(UserEvent)
    });
  }
}
```

### Application-Centric Architecture
Instead of infrastructure-first thinking ("How do we deploy this code?"), engineering-first approaches start with application-centric questions:

- "What does this service need to function correctly?"
- "How can we verify it works in isolation?"
- "What are the contracts between services?"
- "How can we test the complete system?"

### Engineering-Grade Environment Management
```typescript
// Environments as first-class engineered products with full lifecycle management
class ApplicationEnvironment {
  constructor(
    private services: ServiceContract[],
    private configuration: EnvironmentConfig,
    private testSuite: TestSuite
  ) {}
  
  // Validate complete environment before deployment
  async validate(): Promise<ValidationResult> {
    const contractValidation = await this.validateContracts();
    const integrationValidation = await this.runIntegrationTests();
    const performanceValidation = await this.validatePerformance();
    
    return ValidationResult.combine([
      contractValidation,
      integrationValidation, 
      performanceValidation
    ]);
  }
  
  // Deploy only after validation passes
  async deploy(): Promise<DeploymentResult> {
    const validation = await this.validate();
    if (!validation.passed) {
      throw new InvalidEnvironmentError(validation.errors);
    }
    
    return this.executeDeployment();
  }
}
```

### Liberation from Tool Constraints
Engineering-first infrastructure enables:

- **Type safety**: Catch configuration errors at compile time
- **Testability**: Validate complete systems before deployment
- **Composability**: Reuse patterns across different applications
- **Observability**: Understand system behavior from application perspective
- **Flexibility**: Use the right patterns for each problem domain
- **Simulation**: Test failure scenarios and performance characteristics
- **Contracts**: Explicit interfaces between system components

## The Forcing Function: Making Fake Engineering Visible

### Engineering Audit Questions
Ask these questions about your "platform engineering" practices:

1. **Can you test it?** If your deployment logic can't be unit tested, it's scripting, not engineering.

2. **Can you compose it?** If your infrastructure components can't be combined in novel ways, they're templates, not abstractions.

3. **Can you reason about it?** If you can't predict the behavior of changes without running them, it's automation, not engineering.

4. **Can you simulate it?** If you can't create controlled experimental environments to test failure scenarios and behavioral changes, it's hope-driven deployment, not engineering.

5. **Can domain experts modify it?** If only ops specialists can change infrastructure, it's gatekeeping, not enablement.

6. **Does it provide guarantees?** If your system can fail in ways you can't detect at build time, it's hope, not engineering.

### The Business Case for Real Engineering
**Fake engineering costs**:
- 40-60% of senior engineer time spent on ops tooling instead of features
- 2-5x longer time-to-market due to deployment bottlenecks
- 10-20x more production incidents due to untestable infrastructure
- Brain drain as top engineers leave for companies that do real engineering

**Real engineering benefits**:
- Engineers focused on business problems rather than tool problems
- Rapid iteration and experimentation through reliable environments
- Production confidence through testable, validated deployments
- Competitive advantage through faster feature delivery

## The Choice: Engineering or Theater

The fundamental question facing technology organizations is whether they want **engineering** or **theater**.

**Engineering** produces systems that:
- Can be understood, modified, and extended by domain experts
- Provide predictable behavior and fail-safe defaults
- Enable rapid experimentation and iteration
- Scale complexity through abstraction and composition

**Theater** produces systems that:
- Look sophisticated but lack substance
- Require specialized knowledge to maintain
- Constrain innovation through tool limitations
- Accumulate complexity through configuration sprawl

### The Competitive Reality
Organizations that choose engineering over theater will:
- **Deliver features faster** (engineers focused on problems, not tools)
- **Attract better talent** (engineers want to engineer, not maintain pipelines)
- **Adapt to market changes rapidly** (flexible architecture, not rigid ops processes)
- **Build competitive moats** (complex systems that competitors can't copy)

Organizations that choose theater will:
- **Fall behind** in product development velocity
- **Lose engineering talent** to companies that respect the craft
- **Struggle with technical debt** accumulated in untestable ops configurations
- **Miss market opportunities** due to deployment bottlenecks

## Conclusion: Stop Building Careers on Brittle Duct Tape

The ops takeover of software development represents a **category error** that conflates tool mastery with engineering capability. Authentic engineering requires abstraction, composition, validation, and testability—qualities that ops tooling systematically undermines.

**YAML is not code. CI pipelines are not architecture. Helm templates are not engineering.**

Call it what it is: **skewers**, not systems. Automation, not engineering. Process theater, not problem-solving.

The path forward requires **reclaiming software engineering** from the ops theater complex:

- **For engineers**: Demand engineering-grade tools and refuse to accept tool constraints as architectural limitations
- **For teams**: Focus on business problems rather than tool mastery, and evaluate platforms based on engineering principles
- **For organizations**: Recognize that engineering talent is wasted on ops theater, and invest in platforms that enable rather than constrain

**The future belongs to organizations that understand the difference between engineering and its imitations.**

It's time to stop building careers on brittle duct tape and start building real systems again. The choice is simple: engineering or obsolescence.

---

*The path forward requires choosing engineering over theater, principles over tools, and systems thinking over configuration management. The technology exists to build infrastructure that enables rather than constrains—the question is whether organizations have the discipline to demand it.*