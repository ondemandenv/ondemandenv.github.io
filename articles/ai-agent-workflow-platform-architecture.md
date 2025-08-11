---
layout: article
title: AI Agent Workflow Platform: Enterprise Architecture Design
---

# AI Agent Workflow Platform: Enterprise Architecture Design

*A distributed, multi-tenant platform for AI-driven workflow automation with conversational DSL generation*

## Executive Summary

This document outlines the architecture for an enterprise-grade AI agent workflow platform that enables end users to define complex workflows through natural language conversations with AI agents. The platform generates executable DSL definitions, supports multi-tenancy at scale, and can be deployed across customer-managed Kubernetes clusters while leveraging cloud-based SDLC ecosystems.

## System Overview

### Core Principles
- **Conversational Workflow Design**: AI agents collaborate with users to generate workflow DSL
- **Multi-Tenant by Design**: Account-based isolation supporting thousands of tenants  
- **Cloud-Agnostic Deployment**: Runs on customer infrastructure (EKS, AKS, bare metal K8s)
- **Event-Driven Architecture**: Decoupled services communicating via auto-scaling event bus
- **Polyglot Microservices**: Multiple languages optimized per service domain
- **Zero-Trust Security**: OIDC integration with encrypted secrets management
- **Avoiding Distributed Monolith**: Direct service communication with clear boundaries - no service mesh complexity
- **Service Data Ownership**: Each microservice owns its data store and cache for independent SDLC

## High-Level Architecture

### System Overview

<div id="ai-agent-platform-system-overview-diagram" 
     class="mermaid-diagram-simple" 
     data-external-diagram="/diagrams/ai-agent-platform-system-overview.mmd">
</div>

<div style="text-align: center; margin: 1rem 0;">
    <a href="/mmd-render.html?mmd=diagrams/ai-agent-platform-system-overview.mmd" 
       target="_blank" 
       style="display: inline-flex; align-items: center; gap: 0.5rem; background: #0366d6; color: white; padding: 0.5rem 1rem; border-radius: 4px; text-decoration: none; font-size: 0.9rem; transition: all 0.2s ease;">
        🔍 View Fullscreen
    </a>
</div>

### External Integration Requirements

The platform's workflow execution engine requires integration with customer's existing business systems and APIs to provide real-world functionality:

#### Customer API Dependencies
**Business Operations APIs:**
- **Kitchen Status API**: Real-time kitchen capacity, equipment status, order queue information
- **Inventory Management API**: Stock levels, ingredient availability, supply chain data
- **Point of Sale (POS) API**: Order processing, payment status, customer information
- **Staff Scheduling API**: Employee availability, shift schedules, labor costs
- **Delivery/Logistics API**: Driver availability, delivery tracking, route optimization

**Integration Patterns:**
- **REST/GraphQL APIs**: Standard HTTP-based integration for most business systems
- **Webhook Subscriptions**: Real-time event notifications from customer systems
- **Database Connections**: Direct database access for legacy systems without APIs
- **Message Queue Integration**: Enterprise message buses (RabbitMQ, Apache Kafka)
- **Third-Party Connectors**: Pre-built integrations for common business platforms

#### API Capability Requirements
For workflows to function effectively, customer APIs must provide:

**Mandatory Capabilities:**
- **Authentication**: OAuth2/API key support for secure access
- **Rate Limiting Information**: API quotas and throttling policies
- **Error Handling**: Standardized error codes and retry mechanisms
- **Data Validation**: Input validation and constraint checking

**Recommended Capabilities:**
- **Idempotency**: Safe retry mechanisms for critical operations
- **Bulk Operations**: Batch processing for efficiency
- **Real-time Updates**: WebSocket or webhook support for live data
- **Filtering/Pagination**: Efficient data retrieval for large datasets

#### Workflow DSL Integration Pattern
```
Workflow: Order Processing
├── Trigger: Customer places order
├── Step 1: Check kitchen capacity → Customer Kitchen API
├── Step 2: Verify inventory → Customer Inventory API  
├── Step 3: Schedule preparation → Customer Kitchen API
└── Result: Order confirmed or rejected

External Dependencies:
- Customer.KitchenAPI.getCapacity()
- Customer.InventoryAPI.checkStock(items)
- Customer.KitchenAPI.scheduleOrder(order, time)
```

#### Customer Onboarding Requirements
**Technical Prerequisites:**
- **API Documentation**: OpenAPI/Swagger specifications for all integrated endpoints
- **Test Environment**: Sandbox APIs for workflow development and testing
- **Monitoring Access**: API health metrics and performance data
- **Security Compliance**: Authentication mechanisms and data encryption standards

**Business Prerequisites:**
- **Process Documentation**: Clear business process definitions and rules
- **Data Mapping**: Field mappings between customer systems and workflow DSL
- **Error Scenarios**: Exception handling and business rule validation
- **Performance SLAs**: Expected response times and availability requirements

This external integration layer is critical for the platform's value proposition - without access to customer's business systems, workflows remain abstract and cannot drive real operational outcomes.

### Detailed Platform Services Flow (Business-First Architecture)

<div id="ai-agent-platform-detailed-services-flow-diagram" 
     class="mermaid-diagram-simple" 
     data-external-diagram="/diagrams/ai-agent-platform-detailed-services-flow.mmd">
</div>

<div style="text-align: center; margin: 1rem 0;">
    <a href="/mmd-render.html?mmd=diagrams/ai-agent-platform-detailed-services-flow.mmd" 
       target="_blank" 
       style="display: inline-flex; align-items: center; gap: 0.5rem; background: #0366d6; color: white; padding: 0.5rem 1rem; border-radius: 4px; text-decoration: none; font-size: 0.9rem; transition: all 0.2s ease;">
        🔍 View Fullscreen
    </a>
</div>

## Event & Data Flow Architecture

### Event Flow Patterns

<div id="ai-agent-platform-event-flow-diagram" 
     class="mermaid-diagram-simple" 
     data-external-diagram="/diagrams/ai-agent-platform-event-flow.mmd">
</div>

<div style="text-align: center; margin: 1rem 0;">
    <a href="/mmd-render.html?mmd=diagrams/ai-agent-platform-event-flow.mmd" 
       target="_blank" 
       style="display: inline-flex; align-items: center; gap: 0.5rem; background: #0366d6; color: white; padding: 0.5rem 1rem; border-radius: 4px; text-decoration: none; font-size: 0.9rem; transition: all 0.2s ease;">
        🔍 View Fullscreen
    </a>
</div>

### Multi-Tenant Event Partitioning

<div id="ai-agent-platform-multitenant-events-diagram" 
     class="mermaid-diagram-simple" 
     data-external-diagram="/diagrams/ai-agent-platform-multitenant-events.mmd">
</div>

<div style="text-align: center; margin: 1rem 0;">
    <a href="/mmd-render.html?mmd=diagrams/ai-agent-platform-multitenant-events.mmd" 
       target="_blank" 
       style="display: inline-flex; align-items: center; gap: 0.5rem; background: #0366d6; color: white; padding: 0.5rem 1rem; border-radius: 4px; text-decoration: none; font-size: 0.9rem; transition: all 0.2s ease;">
        🔍 View Fullscreen
    </a>
</div>

## Business Domain Data Models

Each business service owns its data schema, managed by dedicated database operators:

### Platform Service Data Schema
```
Platform Service Database:
├── Account Management
│   ├── Tenant accounts and tiers
│   ├── Resource limits and quotas
│   └── Billing and subscription data
├── Authentication & Sessions
│   ├── User session tracking
│   ├── JWT token validation cache
│   └── Authorization policy cache
└── System Configuration
    ├── Tenant-specific settings
    ├── Feature flags and capabilities
    └── Runtime configuration data
```

### Conversation Service Data Schema
```
Conversation Service Database:
├── Conversation Management
│   ├── Conversation metadata and hierarchy
│   ├── User-AI interaction sessions
│   └── Conversation branching and threading
├── Message Storage
│   ├── Message content and attachments
│   ├── Role-based message types (user/assistant/system)
│   └── Message versioning and edits
└── Analytics & Search
    ├── Conversation performance metrics
    ├── User engagement patterns
    └── Content search indexing
```

### Workflow Service Data Schema
```
Workflow Service Database:
├── Workflow Definitions
│   ├── DSL workflow specifications
│   ├── Version management and history
│   └── Source conversation linkage
├── Execution Management
│   ├── Workflow execution instances
│   ├── Execution state and progress
│   └── Performance and timing metrics
└── Task Orchestration
    ├── Individual task executions
    ├── Task dependencies and scheduling
    └── Error handling and retry logic
```

### Agent Service Data Schema
```
Agent Service Database:
├── Agent Configuration
│   ├── Agent personality and behavior settings
│   ├── LLM provider preferences
│   └── Custom agent capabilities
├── Memory Management
│   ├── Long-term conversation context
│   ├── User preference learning
│   └── Knowledge base and facts
└── Usage Analytics
    ├── LLM provider usage and costs
    ├── Performance metrics and optimization
    └── Model selection and routing data
```

**Note**: Cross-service references (like `source_conversation_id` in Workflow Service) are logical references only - services communicate via events, not direct database foreign keys.

## Platform Deployment Configuration

### Platform Usage Lifecycle

The platform supports the following workflow creation lifecycle once deployed:

<div id="ai-agent-platform-workflow-lifecycle-diagram" 
     class="mermaid-diagram-simple" 
     data-external-diagram="/diagrams/ai-agent-platform-workflow-lifecycle.mmd">
</div>

<div style="text-align: center; margin: 1rem 0;">
    <a href="/mmd-render.html?mmd=diagrams/ai-agent-platform-workflow-lifecycle.mmd" 
       target="_blank" 
       style="display: inline-flex; align-items: center; gap: 0.5rem; background: #0366d6; color: white; padding: 0.5rem 1rem; border-radius: 4px; text-decoration: none; font-size: 0.9rem; transition: all 0.2s ease;">
        🔍 View Fullscreen
    </a>
</div>

### CDK8s Deployment Configuration

The platform is deployed using CDK8s templates that generate Kubernetes manifests:

```
Platform Deployment Structure:
├── Infrastructure Controllers
│   ├── Database Controller (PostgreSQL management)
│   ├── Cache Controller (Redis management)
│   ├── Event Bus Controller (Message routing)
│   ├── Storage Controller (Volume management)
│   ├── LLM Controller (Model serving)
│   └── Observability Controller (Monitoring)
└── Application Services
    ├── API Gateway (Request routing)
    ├── Conversation Service (AI interactions)
    ├── Workflow Service (Process orchestration)
    ├── Agent Service (AI agent management)
    └── Platform Service (System management)
```

```
Service Configuration Pattern:
Each Business Service Contains:
├── Internal Layers
│   ├── API Layer (External interface)
│   ├── Business Layer (Domain logic)
│   └── Database Layer (Data access)
├── Infrastructure Requests
│   ├── Database (Dedicated per service)
│   ├── Cache (Dedicated per service)
│   ├── Storage (Optional file storage)
│   ├── Event Topics (Service-specific)
│   └── Specialized Needs (TimeSeries, Search, Vector DB, LLM)
└── Event Contracts
    ├── Published Events (Service publishes)
    └── Subscribed Events (Service consumes)
```

## Inter-Service Event Contracts

Services communicate via well-defined events to maintain loose coupling:

### Event Flow Summary
```
Conversation Service Events:
├── ConversationStarted (accountId, conversationId, userId)
└── MessageReceived (conversationId, messageId, role)

Agent Service Events:
├── DSLGenerated (conversationId, dslContent, agentId)
└── AgentResponse (conversationId, messageId, response)

Workflow Service Events:
├── WorkflowCreated (workflowId, sourceConversationId)
└── WorkflowExecutionStarted (workflowId, executionId)

Platform Service Events:
├── TenantCreated (accountId, accountName, tier)
└── QuotaExceeded (accountId, resourceType, usage)
```

**Cross-references**: Services communicate via events, not direct database foreign keys.
**Event Schema Standard**: All events include accountId, timestamp, and service-specific identifiers.
**Loose Coupling**: Services can evolve independently as long as event contracts are maintained.



## Service Architecture Details

### Business Domain Services

Services are organized by business capability first, with internal layered architecture:

#### API Gateway (Go/Envoy)
```yaml
Business Scope:
  - Request routing to business services
  - Authentication token validation
  - Rate limiting and throttling per tenant
  - Request/response transformation

Internal Architecture:
  API Layer (gateway-api):
    - Multi-protocol support (HTTP, gRPC, WebSocket)
    - Dynamic route configuration
    - Health check aggregation
    - Circuit breaker integration
  
  Routing Layer (gateway-routing):
    - Path-based service routing
    - Load balancing across service instances
    - Tenant context extraction
    - Request correlation and tracing
  
  Data Access Layer (gateway-data):
    - Route configuration cache
    - Service discovery integration
    - Usage metrics collection

Inter-Service Communication:
  - Routes requests to all business services
  - Does not publish domain events (infrastructure concern)
  - Subscribes to service health events for routing updates
```

#### Conversation Service (Python/Go)
```yaml
Business Scope:
  - Complete conversation lifecycle management
  - AI-human interaction coordination
  - Context and memory management
  - Conversation search and analytics

Internal Architecture:
  API Layer (conversation-api):
    - RESTful conversation endpoints
    - WebSocket for real-time chat
    - GraphQL for complex queries
    - Request validation and routing
  
  Business Logic Layer (conversation-logic):
    - Conversation orchestration
    - Context window management
    - Message threading and branching
    - Privacy and content filtering
  
  Data Access Layer (conversation-data):
    - PostgreSQL for conversation metadata
    - Redis for active session state
    - Object storage for message content
    - Elasticsearch for search indexing

Inter-Service Communication:
  - Publishes: ConversationStarted, MessageReceived, ConversationEnded
  - Subscribes: DSLGenerated, WorkflowCompleted, AgentResponse
```

#### Workflow Service (Java/Kotlin)
```yaml
Business Scope:
  - Complete workflow lifecycle (design → execution → monitoring)
  - DSL compilation and validation
  - Task orchestration and scheduling
  - Workflow analytics and optimization

Internal Architecture:
  API Layer (workflow-api):
    - Workflow CRUD operations
    - Execution control endpoints
    - Real-time status streaming
    - Webhook management
  
  DSL Engine Layer (dsl-engine):
    - DSL parsing and validation
    - Workflow compilation
    - Dependency resolution
    - Version management
  
  Execution Engine Layer (execution-engine):
    - Task orchestration
    - State management
    - Error handling and retries
    - Resource allocation
  
  Data Access Layer (workflow-data):
    - PostgreSQL for workflow definitions
    - Redis for execution state
    - TimeSeries DB for metrics
    - Object storage for artifacts

Inter-Service Communication:
  - Publishes: WorkflowStarted, TaskCompleted, WorkflowFailed
  - Subscribes: ConversationApproved, TriggerReceived
```

#### Agent Service (Go/Python)
```yaml
Business Scope:
  - AI agent orchestration and coordination
  - LLM provider management and routing
  - Agent memory and learning
  - Performance optimization

Internal Architecture:
  API Layer (agent-api):
    - Agent interaction endpoints
    - Model selection interface
    - Performance monitoring
    - Cost tracking
  
  LLM Routing Layer (llm-routing):
    - Intelligent model selection
    - Load balancing across providers
    - Cost optimization logic
    - Failover and circuit breaking
  
  Memory Layer (agent-memory):
    - Long-term conversation memory
    - User preference learning
    - Context summarization
    - Knowledge graph maintenance
  
  Data Access Layer (agent-data):
    - PostgreSQL for agent configs
    - Redis for session memory
    - Vector DB for embeddings
    - Object storage for training data

Inter-Service Communication:
  - Publishes: DSLGenerated, AgentResponse, ModelSwitched
  - Subscribes: ConversationStarted, UserFeedback
```

#### Platform Service (Go)
```yaml
Business Scope:
  - Multi-tenant platform management
  - Authentication and authorization
  - Resource quotas and billing
  - System monitoring and health

Internal Architecture:
  API Layer (platform-api):
    - Tenant management endpoints
    - Authentication endpoints
    - System admin interface
    - Health check endpoints
  
  Auth Logic Layer (auth-logic):
    - OIDC integration
    - JWT token management
    - RBAC policy engine
    - Session management
  
  Tenant Routing Layer (tenant-routing):
    - Request routing by account
    - Resource quota enforcement
    - Rate limiting per tenant
    - Usage tracking
  
  Data Access Layer (platform-data):
    - PostgreSQL for tenant configs
    - Redis for session store
    - TimeSeries DB for usage metrics
    - Audit log storage

Inter-Service Communication:
  - Publishes: TenantCreated, QuotaExceeded, AuthEvent
  - Subscribes: All service events (for audit/monitoring)
```



### Local LLM Services

#### Local LLM Infrastructure (Python/C++)
```yaml
Components:
  - Ollama: Easy model deployment and management
  - vLLM: High-performance inference serving
  - Text Generation Inference: Hugging Face serving
  - Model Manager: Automated model lifecycle

Capabilities:
  - Multi-model serving (Llama, Mistral, CodeLlama, etc.)
  - GPU acceleration (NVIDIA, AMD)  
  - Model quantization (4-bit, 8-bit)
  - Auto-scaling based on demand
  - Model hot-swapping and A/B testing

Security:
  - All inference stays within customer infrastructure
  - No data leaves customer boundary
  - Encrypted model storage
  - Resource isolation per tenant
```

### Workflow Services

#### DSL Compiler Service (Rust/Go)
```yaml
Responsibilities:
  - DSL validation and parsing
  - Workflow topology analysis
  - Version management and migration
  - Dependency resolution
  - Code generation for execution

Features:
  - Real-time validation with detailed error messages
  - Syntax highlighting and auto-completion
  - Breaking change detection
  - Performance optimization suggestions
```

#### Workflow Engine (Java/Kotlin)
```yaml
Responsibilities:
  - Task orchestration and scheduling
  - Workflow state management and persistence
  - Error handling and retries
  - Resource allocation and limits
  - Parallel execution coordination

Data Ownership:
  - Dedicated PostgreSQL for workflow definitions and execution state
  - Private Redis cache for active workflow state
  - Local file storage for workflow artifacts, logs, and temporary files
  - TimeSeries DB for workflow metrics and performance data

Patterns:
  - Event sourcing for audit trail
  - SAGA pattern for distributed transactions
  - Circuit breakers for external calls
  - Bulkhead isolation per tenant
  - Compensating actions for rollbacks
  
Scaling:
  - Independent scaling based on workflow load
  - Database partitioning by workflow execution patterns
  - Cache distribution for active workflows
  - Metrics aggregation and rollup strategies
```

#### Workflow Scheduler (Go)
```yaml
Responsibilities:
  - Cron-based workflow scheduling
  - Event-triggered workflow execution
  - Resource-aware scheduling
  - Priority queue management

Features:
  - Distributed scheduling with leader election
  - Timezone-aware cron expressions
  - Workflow dependency resolution
  - Backpressure handling
```

### Data Services

### Infrastructure Controllers

#### Event Bus Controller
```yaml
Manages:
  - Pulsar cluster lifecycle (create, update, scale, backup)
  - Multi-tenant topic provisioning per service
  - Auto-scaling partitions based on load
  - Dead letter queue configuration

Provides APIs:
  - Topic creation/deletion per service
  - Message publishing/subscription
  - Schema registry integration
  - Metrics and monitoring endpoints
```

#### Database Controller
```yaml
Manages:
  - PostgreSQL instance lifecycle per service
  - Automated backups and point-in-time recovery
  - Connection pooling and read replicas
  - Security and access control

Provides APIs:
  - Database provisioning per service
  - Connection string management
  - Schema migration support
  - Performance metrics collection
```

#### LLM Controller
```yaml
Manages:
  - GPU resource allocation and scheduling
  - Model lifecycle (download, load, unload, scale)
  - Multiple serving engines (Ollama, vLLM, TGI)
  - Model version management and rollback

Provides APIs:
  - Inference endpoints per model
  - Model selection and routing
  - Usage tracking and cost optimization
  - Health checking and failover
```



// Local LLM deployment configuration
export interface LocalLLMCluster {
  ollama: {
    replicas: number;
    models: string[]; // ["llama2:7b", "mistral:7b", "codellama:13b"]
    resources: ResourceRequirements;
  };
  vllm: {
    replicas: number;
    tensorParallelism: number;
    gpuMemoryUtilization: number;
  };
  textGenerationInference: {
    replicas: number;
    quantization: "4bit" | "8bit" | "none";
    maxBatchSize: number;
  };
}

// Auto-scaling configuration
export interface ScalingConfig {
  minReplicas: number;
  maxReplicas: number;
  targetCPU: number;
  targetMemory: number;
  accountBasedScaling: boolean;
}
```

## Local LLM Deployment Strategy

### Model Management & Deployment
```yaml
Local LLM Architecture:
  Model Registry:
    - Centralized model storage within customer infrastructure
    - Version management and rollback capabilities
    - Support for custom fine-tuned models
    - Automated model downloading and caching
    
  Serving Infrastructure:
    - Multiple serving engines for different use cases
    - GPU resource pooling and scheduling
    - Auto-scaling based on inference demand
    - Load balancing across model replicas
    
  Security & Isolation:
    - All model inference within customer boundary
    - Tenant-level model access control
    - Encrypted model storage and memory
    - No external data transmission

Deployment Options:
  Small Scale (1-10 users):
    - Single Ollama instance
    - CPU-only inference for basic models
    - Shared GPU resources
    
  Medium Scale (10-100 users):
    - Multiple serving engines (Ollama + vLLM)
    - Dedicated GPU nodes
    - Model-specific auto-scaling
    
  Enterprise Scale (100+ users):
    - Multi-engine deployment with load balancing
    - GPU cluster with tensor parallelism
    - Multiple model variants (7B, 13B, 70B)
    - Advanced caching and optimization
```

### GPU Resource Management
```yaml
GPU Scheduling:
  Node Pools:
    - Dedicated GPU node pools for LLM workloads
    - Mixed CPU/GPU nodes for general workloads
    - Spot instances for cost optimization (non-critical)
    
  Resource Allocation:
    - GPU sharing for smaller models (MIG)
    - Full GPU allocation for larger models
    - Dynamic resource adjustment based on load
    
  Optimization:
    - Model quantization (4-bit, 8-bit)
    - Batching and continuous batching
    - KV-cache optimization
    - Model parallelism for large models
```

## Service Communication Strategy

### Why No Service Mesh

The platform deliberately avoids service mesh (Istio, Linkerd) to preserve Domain-Driven Design principles and prevent distributed monolith anti-patterns:

#### Domain-Driven Design Conflicts

Service mesh fundamentally conflicts with Domain-Driven Design by externalizing critical service communication concerns:

**1. Erosion of Bounded-Context Autonomy**
- DDD requires each bounded context to encapsulate its own model, language, and lifecycle
- Service mesh moves interaction semantics (routing, retries, policies) out of domain code into platform control
- Domain teams lose ownership and evolution control over their own communication patterns
- Creates dependency on platform teams for domain-specific communication needs

**2. Loss of Internal Coherence**
- DDD emphasizes ubiquitous language and consistent models within each context
- Mesh routing rules and retry logic live outside codebase, fragmenting the mental model
- Developers must check YAML dashboards or CLI commands to understand inter-service contracts
- Business logic flow becomes harder to trace and reason about

**3. Versioning and Consistency Breakdowns**
- Domain models evolve through code-repo versioning with coordinated releases
- Mesh introduces parallel versioning axis (mesh policies) often unsynchronized with service releases
- Creates subtle mismatches where mesh strips fields or routes incorrectly
- Undermines consistency guarantees between services

**4. Centralized Dependency and Operational Coupling**
- DDD advocates decentralized governance: teams choose deployment cadence, databases, libraries
- Service mesh creates single chokepoint that all domains must traverse
- Mesh upgrades, control-plane outages, misconfigurations ripple through all domains
- Replaces loose coupling with operational monoculture

#### Technical Problems with Service Mesh
- **Hidden Complexity**: Network topology becomes opaque and hard to debug
- **Performance Overhead**: Additional network hops and proxy layers
- **Operational Burden**: Complex configuration and troubleshooting
- **Distributed Monolith**: Creates illusion of separation while increasing coupling

#### Our Domain-Centric Approach Instead
- **Direct HTTP/gRPC**: Simple, traceable service-to-service communication owned by domains
- **Event Bus Decoupling**: Async communication preserving service autonomy
- **Domain-Owned Contracts**: Well-defined APIs maintained within each bounded context
- **Application-Level Resilience**: Circuit breakers and retry logic as domain business rules
- **Service-Native Observability**: Distributed tracing without mesh complexity

This approach maintains domain autonomy while enabling the platform-level benefits (observability, resilience, security) through controller-managed infrastructure rather than communication interception.

### CQRS (Command Query Responsibility Segregation)

Each business service implements CQRS internally to optimize for both read and write performance:

**API Gateway Role:**
- **Simple Routing**: Routes requests to appropriate business service based on path/domain
- **No CQRS Logic**: Does not distinguish between commands and queries
- **Load Balancing**: Distributes load across service instances
- **Authentication**: Validates tokens before forwarding requests

**Service-Level CQRS (Within Each Service):**
- **Request Classification**: API layer routes based on HTTP method and operation intent
  - **Queries**: GET requests → Query handlers (read-only operations)
  - **Commands**: POST/PUT/DELETE requests → Command handlers (state-changing operations)
- **Query Handlers**: Direct, optimized read paths to data layer with caching
- **Command Handlers**: Business logic processing with validation and event emission
- **Database Access**: Unified access to controller-managed infrastructure

**Query Processing (Within Service):**
- **Fast Response**: Optimized read paths with caching
- **Cache-First**: Service-level cache before database access
- **Read Optimization**: Dedicated query models and projections

**Command Processing (Within Service):**
- **Business Logic**: Domain-specific command validation and processing
- **Event Generation**: Commands generate domain events for other services
- **Data Consistency**: Transactional consistency within service boundary
- **Async Propagation**: Events published to inter-service event bus

**Benefits:**
- **Service Autonomy**: Each service optimizes its own read/write patterns
- **Clear Boundaries**: CQRS boundaries align with business domains
- **Performance**: Service-specific optimizations for queries and commands
- **Scalability**: Services scale command and query sides independently

### Kubernetes-Native Service Data Ownership

Each application service logically owns its data but accesses it through infrastructure CRDs managed by Kubernetes controllers:

**Service Data Ownership via Infrastructure APIs:**
- **Dedicated Database**: Service accesses its own PostgreSQL database via Database Controller CRDs
- **Private Cache**: Service accesses its own Redis instance via Cache Controller CRDs
- **Event Topics**: Service publishes/subscribes to its own topics via Event Bus Controller CRDs
- **File Storage**: Service accesses its own PVC volumes via Storage Controller CRDs
- **Schema Evolution**: Services evolve their data schemas through operator-managed migrations

**Infrastructure Controllers:**
- **Database Controller**: Manages PostgreSQL instances, backups, scaling, and access CRDs
- **Cache Controller**: Manages Redis instances, clustering, and access CRDs
- **Event Bus Controller**: Manages event bus clusters, topics, and messaging CRDs
- **Storage Controller**: Manages persistent volumes, snapshots, and access CRDs
- **LLM Controller**: Manages model serving, GPU allocation, and inference CRDs

**Kubernetes-Native SDLC Benefits:**
- **Operator-Managed Infrastructure**: Database/cache scaling and maintenance handled by operators
- **Service Independence**: Services deploy independently while infrastructure evolves separately
- **API-Driven Access**: Clean abstraction between application logic and infrastructure
- **Resource Isolation**: Each service's resources are isolated but managed centrally
- **GitOps Integration**: Infrastructure and application configs managed through K8s manifests

## Security Architecture

### Authentication & Authorization Flow

The platform implements a layered security model that separates authentication from authorization:

#### External Authentication (IDP Integration)
- **Identity Provider Integration**: OIDC/OAuth2 integration with external IDPs (Auth0, Okta, Azure AD, etc.)
- **JWT Token Validation**: API Gateway validates JWT tokens from trusted IDPs
- **User Context Extraction**: Extracts user identity, tenant context, and claims from validated JWTs
- **No Internal Auth Service**: Leverages external IDPs rather than maintaining internal user credentials

#### API Gateway Security Layer
- **Token Validation**: Validates JWT signatures, expiration, and issuer claims
- **Request Routing**: Routes authenticated requests to appropriate business services
- **Tenant Context Injection**: Adds extracted tenant/user context to service requests
- **Rate Limiting**: Applies per-tenant rate limiting based on authenticated identity

#### Runtime Authorization Engine (Platform Service)
- **Tenant Access Control**: Fine-grained authorization for tenant-specific resources
- **Policy Management**: Centralized policies for document, workflow, and conversation access
- **Resource-Level Permissions**: Controls access to specific conversations, workflows, agents
- **Dynamic Policy Evaluation**: Real-time authorization decisions based on tenant context

#### Service-Level Authorization
- **Tenant Authorization Checks**: Each service validates tenant access via Platform Service authorization engine
- **Resource Ownership**: Services verify that tenants can only access their own resources
- **Cross-Service Validation**: Authorization context propagated across service boundaries
- **Audit Trail**: All authorization decisions logged for compliance and debugging

### Zero-Trust Security Model
- **Identity Verification**: OIDC integration with major IDPs
- **Secret Management**: K8s secrets + cloud KMS integration  
- **Network Security**: Direct service-to-service authentication with mTLS
- **Data Encryption**: At-rest and in-transit encryption
- **Audit Logging**: Comprehensive audit trail
- **Local LLM Security**: All inference within customer infrastructure boundary

### Multi-Tenant Isolation
- **Network Isolation**: Kubernetes namespaces per tenant tier
- **Data Isolation**: Hash-based partitioning
- **Resource Isolation**: ResourceQuotas and LimitRanges
- **API Isolation**: Request routing based on account context

## Scalability Considerations

### Auto-Scaling Triggers
```yaml
HorizontalPodAutoscaler:
  - CPU utilization > 70%
  - Memory utilization > 80% 
  - Custom metrics: conversations/sec
  - Event queue depth per tenant

VerticalPodAutoscaler:
  - Memory-intensive AI operations
  - Variable LLM response sizes
  - Dynamic resource requirements

ClusterAutoscaler:
  - Node capacity based on tenant growth
  - Multi-zone availability requirements
```

### Performance Targets
- **Conversation Response**: < 2s for simple queries
- **DSL Generation**: < 30s for complex workflows
- **Workflow Execution**: Depends on workflow complexity
- **System Throughput**: 10,000+ concurrent conversations

## Technology Stack Summary

| Layer | Technology Choices | Rationale |
|-------|-------------------|-----------|
| **Infrastructure Controllers** | | |
| **Database Controller** | PostgreSQL Controller | Automated database provisioning, scaling, backups |
| **Cache Controller** | Redis Controller | Automated cache clustering, failover, scaling |
| **Event Bus Controller** | Event Bus Controller | Multi-tenant topics, auto-scaling, geo-replication |
| **Storage Controller** | K8s CSI + Storage Controller | Automated PVC provisioning, snapshots, lifecycle |
| **LLM Controller** | Custom LLM Controller | GPU scheduling, model lifecycle, inference CRDs |
| **Application Services** | | |
| **Service Runtime** | Container workloads (Pods) | Stateless, scalable, controller-managed infrastructure access |
| **Service Data Access** | Controller-provided CRDs | Clean abstraction, automated scaling, isolation |
| **Service Communication** | Direct HTTP/gRPC + Event CRDs | Simple, traceable, avoiding distributed monolith |
| **Platform Infrastructure** | | |
| **Container Orchestration** | Kubernetes + Custom Controllers | Cloud-agnostic, declarative, automated operations |
| **Cloud LLM Integration** | OpenAI, Anthropic, + Others | Vendor flexibility, cost optimization |
| **GPU Management** | NVIDIA GPU Operator + Custom Scheduling | Resource pooling, multi-tenancy, automatic allocation |
| **Infrastructure as Code** | CDK8s + Controller Manifests | Type-safe, GitOps-ready, controller-driven deployments |

## Phased Implementation Strategy

### Architectural Philosophy: Cloud Reliability + Bare Metal Security

The platform follows a **technology-agnostic design** that enables customers to choose their desired balance between cloud convenience and infrastructure control:

#### Core Design Principles
- **Pattern-Based Architecture**: Focus on architectural patterns that can be implemented across different technology stacks
- **Infrastructure Abstraction**: Business services use interfaces, not concrete implementations
- **Progressive Infrastructure Control**: Start with managed services, evolve to full control as needed
- **Security-First Flexibility**: Enable bare metal-level security while leveraging cloud reliability

#### Strategic Benefits
**Cloud Managed Services Advantages:**
- **Reliability**: Battle-tested, enterprise-grade infrastructure with SLAs
- **Development Velocity**: Teams focus on business logic, not infrastructure management
- **Cost Efficiency**: Pay-per-use scaling without upfront hardware investments
- **Security Updates**: Automatic patching and security maintenance

**Bare Metal Control Advantages:**
- **Data Sovereignty**: Complete control over data location and access patterns
- **Custom Security**: Implement specialized compliance and security requirements
- **Performance Optimization**: Direct hardware access for AI/ML workloads
- **Cost Control**: Eliminate cloud markup for predictable, large-scale workloads

**Our Approach**: Customers start with cloud managed services for rapid deployment and feature development, then gradually migrate to self-managed infrastructure as security, compliance, or cost requirements demand greater control.

### Phase 1: ECS + AWS Managed Services (POC & Business Logic Focus)

**Goal**: Rapid POC development with maximum business logic focus and minimal infrastructure complexity

**Why ECS First:**
- **Simplest Container Orchestration**: No Kubernetes complexity, just containers and services
- **CDK Consistency**: Same CDK patterns as later EKS phases enable smooth iteration
- **AWS Integration**: Native integration with RDS, ElastiCache, EventBridge
- **Fast Development Cycles**: Deploy and test business logic without platform overhead
- **Resource Efficiency**: Lower resource requirements for initial development
- **Proven Reliability**: Battle-tested AWS container orchestration

<div id="ai-agent-platform-phase1-aws-diagram" 
     class="mermaid-diagram-simple" 
     data-external-diagram="/diagrams/ai-agent-platform-phase1-aws.mmd">
</div>

<div style="text-align: center; margin: 1rem 0;">
    <a href="/mmd-render.html?mmd=diagrams/ai-agent-platform-phase1-aws.mmd" 
       target="_blank" 
       style="display: inline-flex; align-items: center; gap: 0.5rem; background: #0366d6; color: white; padding: 0.5rem 1rem; border-radius: 4px; text-decoration: none; font-size: 0.9rem; transition: all 0.2s ease;">
        🔍 View Fullscreen
    </a>
</div>

**Phase 1 Benefits:**
- **Maximum Development Velocity**: Teams focus 100% on business features, not infrastructure
- **CDK Infrastructure as Code**: Consistent patterns that carry forward to later phases
- **Service Isolation**: Each microservice gets dedicated AWS resources (RDS, Cache, etc.)
- **Parallel Development**: Business logic and platform architecture evolve independently
- **Cost Effective**: No K8s overhead or complex operator development needed

### Phase 2: EKS + AWS Managed Services (K8s Migration)

**Goal**: Migrate to Kubernetes while maintaining AWS managed service simplicity

**Why EKS Next:**
- **K8s Learning Curve**: Teams learn K8s gradually without infrastructure management burden
- **CDK Consistency**: Same CDK patterns, just targeting EKS instead of ECS
- **Maintained Service Isolation**: Each service still uses dedicated AWS resources
- **Advanced Orchestration**: Better scaling, networking, and service management
- **Ecosystem Access**: Access to K8s ecosystem tools and operators

<div id="ai-agent-platform-phase2-k8s-diagram" 
     class="mermaid-diagram-simple" 
     data-external-diagram="/diagrams/ai-agent-platform-phase2-k8s.mmd">
</div>

<div style="text-align: center; margin: 1rem 0;">
    <a href="/mmd-render.html?mmd=diagrams/ai-agent-platform-phase2-k8s.mmd" 
       target="_blank" 
       style="display: inline-flex; align-items: center; gap: 0.5rem; background: #0366d6; color: white; padding: 0.5rem 1rem; border-radius: 4px; text-decoration: none; font-size: 0.9rem; transition: all 0.2s ease;">
        🔍 View Fullscreen
    </a>
</div>

### Phase 3: XKS + Custom Operators (Multi-Cloud Kubernetes)

**Goal**: Achieve cloud portability while building custom infrastructure automation

**Why XKS (Extended Kubernetes):**
- **Cloud Agnostic**: Support EKS, AKS, GKE with unified deployment patterns
- **Custom Operators**: Begin developing platform-specific operators for specialized needs
- **Gradual Infrastructure Ownership**: Migrate from managed services to custom operators service-by-service
- **Multi-Cloud Strategy**: Enable customer choice of cloud provider
- **Advanced Features**: Leverage cloud-specific K8s extensions (EKS Fargate, AKS Virtual Nodes, GKE Autopilot)

### Phase 4: Bare Metal + Full Custom Operators (Maximum Control)

**Goal**: Complete infrastructure ownership and maximum customer deployment flexibility

**Why Bare Metal Last:**
- **Maximum Performance**: Direct hardware access for AI/ML workloads
- **Cost Optimization**: Eliminate cloud markup for large-scale deployments
- **Data Sovereignty**: Complete control over data location and access
- **Custom Hardware**: Support for specialized AI chips, custom networking, storage
- **Enterprise Requirements**: Meet strict compliance and security requirements

### Infrastructure Abstraction Pattern

```typescript
// Business services use interfaces, not concrete implementations
export interface DatabaseService {
  query(sql: string, params: any[]): Promise<any[]>;
  transaction(callback: (tx: Transaction) => Promise<void>): Promise<void>;
  // Service doesn't care if it's RDS or PostgreSQL Operator
}

export interface CacheService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  // Service doesn't care if it's ElastiCache or Redis Operator
}

export interface EventService {
  publish(topic: string, event: any): Promise<void>;
  subscribe(topic: string, handler: (event: any) => void): void;
  // Service doesn't care if it's EventBridge or Pulsar
}

// Phase 1: AWS implementations
export class RDSService implements DatabaseService { /* AWS RDS */ }
export class ElastiCacheService implements CacheService { /* AWS ElastiCache */ }
export class EventBridgeService implements EventService { /* AWS EventBridge */ }

// Phase 2: K8s operator implementations  
export class PostgreSQLOperatorService implements DatabaseService { /* K8s PostgreSQL */ }
export class RedisOperatorService implements CacheService { /* K8s Redis */ }
export class PulsarOperatorService implements EventService { /* K8s Pulsar */ }
```

### Technology-Agnostic Migration Strategy

**Implementation Flexibility:**
The platform's interface-based design enables customers to choose their infrastructure stack based on their specific requirements:

**Development Approach:**
1. **Interface-First Design**: All infrastructure dependencies defined as abstract interfaces
2. **Multi-Implementation Support**: Same business logic works across AWS, Azure, GCP, or bare metal
3. **Customer Choice**: Deploy on preferred infrastructure without code changes
4. **Seamless Evolution**: Migrate between implementations as requirements change

**Deployment Options:**
- **Cloud-First**: Start with managed services (RDS, ElastiCache, EventBridge)
- **Hybrid**: Mix managed services with self-hosted components as needed
- **Self-Hosted**: Full Kubernetes operators for complete infrastructure control
- **Bare Metal**: Direct hardware deployment for maximum performance and security

**Risk Mitigation:**
- **No Vendor Lock-in**: Interface abstraction prevents coupling to specific providers
- **Business Logic Stability**: Core application code remains unchanged across deployments
- **Proven Patterns**: Start with battle-tested services, evolve to custom solutions
- **Incremental Migration**: Change infrastructure components independently

This phased approach enables rapid business value delivery while maintaining the end-goal of a fully self-contained, customer-deployed platform. Teams can focus on domain logic while infrastructure matures at its own pace. 