---
layout: article
title: "The Provocative SRE Manifesto"
permalink: /articles/provocative-sre-manifesto/
---

# The Provocative SRE Manifesto

*Transforming Site Reliability Engineering from Reactive Firefighting to Proactive Innovation*

---

## Preamble

Site Reliability Engineering must evolve. The traditional SRE model—focused on infrastructure, black-box monitoring, and reactive firefighting—has delivered stability, but at the cost of innovation, agility, and true business value. We believe reliability is only meaningful when it enables product value, rapid learning, and creative exploration.

**We are not passive stewards of uptime. We are active enablers of progress.**

---

## Traditional SRE: The Black Box, Firefighter, and Status Quo

### 1. **System as Black Box**
- **View:** SREs treat the system as a black box; the application is just the container or artifact.
- **Implication:** Focus is on infrastructure reliability (pods, nodes, clusters), not on the application's business logic or domain model.
- **Result:** Limited understanding of how changes impact business value or user experience.

### 2. **Statelessness and Avoidance of Complexity**
- **View:** Emphasis on stateless deployments; avoid schema/data migrations due to risk and complexity.
- **Implication:** SREs often push back on changes that touch data or require coordinated evolution, leading to brittle architectures and slow innovation.

### 3. **Reactive Monitoring and Fixing**
- **View:** Rely on metrics, alerts, and automated controllers (like Kubernetes) to reactively keep the system healthy.
- **Implication:** SREs are firefighters, responding to incidents rather than preventing them or improving the system holistically.

---

## Provocative SRE: White Box, Proactive, and Human-Centric

### 1. **Full SDLC Ecosystem Visibility**
- **View:** The ecosystem is a white box. SREs and engineers see and interact with the entire SDLC—code, contracts, dependencies, environments, and runtime.
- **How ONDEMANDENV.dev Enables This:**  
  - **Codified contracts** make dependencies explicit and versioned
  - **Environment versioning** means every part of the system is traceable and reproducible
  - **Console and visualization** tools make the system's structure and health transparent

### 2. **Holistic, Application-Centric Environments**
- **View:** SRE isn't just about keeping pods running; it's about enabling safe, rapid exploration and testing of the entire application in realistic, isolated environments.
- **How ONDEMANDENV.dev Enables This:**  
  - **On-demand, production-like environments** for any branch or feature
  - **Easy environment cloning** empowers engineers to test, break, and learn without fear
  - **Supports full-stack testing, not just infrastructure smoke tests**

### 3. **Architecture Guided by DDD (Domain-Driven Design)**
- **View:** Prevent accidental complexity by aligning architecture with business domains, not infrastructure artifacts.
- **How ONDEMANDENV.dev Enables This:**  
  - **Contracts and boundaries** reflect business domains, not just technical layers
  - **Environment modeling** is based on DDD principles, so changes are meaningful and manageable
  - **Minimizes risk** by making dependencies and impacts explicit

### 4. **Proactive, Creative, and Human-Centric SRE**
- **View:** SRE's job is not just to "keep the lights green," but to empower engineers to innovate, experiment, and fail fast—because reliability only matters if the product is valuable.
- **How ONDEMANDENV.dev Enables This:**  
  - **Removes friction** from testing and deploying changes
  - **Encourages exploration and discovery** by making environments cheap, safe, and fast to create and destroy
  - **Reduces toil** and rigid process, freeing engineers to focus on what matters

---

## Key Differences: Side-by-Side

| Aspect                    | Traditional SRE (Passive)         | Provocative SRE (ONDEMANDENV)            |
|---------------------------|-----------------------------------|----------------------------------------------|
| System View               | Black box, infra-centric          | White box, full SDLC, business-centric       |
| Application Focus         | Container/artifact as app         | App as holistic domain, contracts & context  |
| Data/Schema Evolution     | Avoided, seen as risky            | Supported, modeled, versioned, testable      |
| Monitoring/Response       | Metrics, alerts, firefighting     | Proactive, exploratory, environment-centric  |
| Developer Empowerment     | Rigid, process-heavy, reactive    | Creative, proactive, fail-fast, discoverable |
| Architecture              | Infra-driven, accidental complexity| DDD-driven, minimized complexity             |
| Value Proposition         | Keep lights green                 | Enable valuable, reliable products           |

---

## Our Principles

### 1. **Ecosystem as White Box, Not Black Box**
- We reject the notion that systems are inscrutable black boxes
- We demand full visibility into the entire SDLC: code, contracts, environments, dependencies, and runtime behavior
- We make dependencies, boundaries, and changes explicit, traceable, and understandable

### 2. **Application-Centric, Not Artifact-Centric**
- The application is not just a container or artifact; it is a living, evolving system with business context and domain logic
- Our environments, contracts, and tools are modeled around the application's business value and user experience—not just infrastructure primitives

### 3. **Holistic, Versioned Environments**
- Every environment is versioned, reproducible, and isolated
- Engineers can spin up, clone, and destroy environments on demand for any branch, feature, or experiment
- We eliminate configuration drift and ambiguity by codifying contracts and environment state

### 4. **Proactive Over Reactive**
- We do not wait for incidents to learn; we proactively exercise, test, and explore our systems
- Chaos, experimentation, and exploration are encouraged, safe, and frictionless
- We value learning from near-misses and unknown-unknowns, not just postmortems

### 5. **Domain-Driven Design to Minimize Accidental Complexity**
- Architecture is guided by business domains, not infrastructure artifacts
- We use contracts and boundaries to reflect real business logic, minimizing accidental complexity and risk
- Schema and data evolution are first-class, testable, and safe

### 6. **Empowering Human Creativity**
- Engineers are not process-bound firefighters; they are creative explorers and builders
- We minimize toil and rigid process to free engineers for valuable, innovative work
- Failure is a path to learning, not a cause for blame

### 7. **Reliability in Service of Value**
- Uptime and reliability are only meaningful if the product delivers value to users and the business
- We balance reliability with speed, innovation, and user impact
- We measure success by value delivered, not just by green dashboards

---

## Our Commitments

- **We will codify all dependencies, contracts, and environment states**
- **We will make environments cheap, fast, and safe to create, clone, and destroy**
- **We will align our architecture with business domains, not just technical layers**
- **We will empower engineers to experiment, fail fast, and learn continuously**
- **We will treat reliability as a means to an end, not the end itself**
- **We will challenge the status quo and provoke better ways of working**

---

## How ONDEMANDENV.dev Enables Provocative SRE

ONDEMANDENV.dev is built from the ground up to enable this new paradigm of SRE:

- **ContractsLib:** Codifies dependencies and interfaces, making them explicit and versioned
- **Envers:** Versioned environments, so every change is traceable and reproducible
- **Console:** Real-time visualization of dependencies, health, and environment state
- **On-demand environments:** Any branch, any time, for testing, discovery, and learning
- **DDD alignment:** Models environments and contracts around business domains, not just infrastructure

---

## Call to Action

If you believe SRE should be more than keeping the lights green—if you want to build systems that are reliable, valuable, and enable human creativity—join us.

**Let's move from passive to provocative. Let's make reliability a foundation for innovation.**

---

## Why This Matters

- **Traditional SRE** is necessary but insufficient: it keeps systems running, but can stifle innovation and create accidental complexity
- **Provocative SRE** recognizes that true reliability comes from understanding, exploring, and evolving the system as a whole—including its business logic and domain boundaries

You're not just managing infrastructure—you're championing a **paradigm shift** in SRE. **Provocative SRE** is about empowering engineers to be creative, proactive, and business-focused, rather than just reactive maintainers of infrastructure.

---

*This manifesto represents the philosophical foundation behind ONDEMANDENV.dev - a platform that transforms distributed system complexity through Application-Centric Infrastructure and enables true microservice agility.* 