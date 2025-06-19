---
layout: article
title: "Kubernetes, Bounded Contexts, and Accidental Complexity"
permalink: /articles/kubernetes-bounded-contexts/
---

# Kubernetes, Bounded Contexts, and Accidental Complexity  
_A pragmatic DDD-first guide to deciding when clusters help—and when they just get in the way_

## 1. Why Some Readers Think I'm "Anti-K8s"

My recent posts on ondemandenv.dev have criticised the "run **everything** on EKS" mantra. That has been mistaken for blanket hostility toward Kubernetes. The truth is simpler:  

-  I oppose mis-using Kubernetes as a Swiss-army knife that slices perfectly good cloud services into two control planes.  
-  I celebrate Kubernetes when an operator collapses hard domain logic into one cohesive boundary (Elastic Cloud on Kubernetes, Strimzi, Crunchy Postgres, etc.).  

Domain-Driven Design (DDD) teaches us to minimise coupling by keeping each bounded context under **one** source of truth. Splitting an application domain across the Kubernetes control plane **and** the cloud provider's control plane violates that principle and breeds accidental complexity.

---

## 2. The Anatomy of "Half-In / Half-Out" Complexity

Imagine a typical serverless-plus-EKS stack:

| Concern | Lives inside the cluster | Lives outside the cluster | Result |
|---------|-------------------------|---------------------------|--------|
| Stateless compute | Pods, Deployments | Fargate, Lambda, Cloud Functions | Two schedulers, two scaling knobs |
| Storage | PVCs, StatefulSets | S3, EFS, RDS, BigQuery | Two data planes, duplicated IAM |
| Messaging / eventing | Knative, NATS, Apache Kafka | SQS, SNS, Pub/Sub | Two QoS models, confused retries |
| Observability | Prometheus, Grafana, Loki | CloudWatch, Stackdriver | Two dashboards, drifted alerts |

Every cross-plane hop demands glue code, IRSA roles, Terraform modules, and extra monitoring. The cluster no longer _reduces_ complexity; it **creates** it.

---

## 3. The EKS Re-Implementation Tax

AWS already gives you:  

-  Load balancers, autoscaling groups, IAM, VPC networking, serverless queues, object storage.  

Running EKS to front-end the same services means:

* Re-writing IAM as Kubernetes RBAC + IRSA.  
* Duplicating ALB config in Ingress + AWS load-balancer controller.  
* Managing a CNI that overlays the VPC you already had.  

The platform team becomes a ticket queue, YAML proliferates, and velocity slows. All of this is avoidable if the domain's natural boundary **is** the set of managed services.

---

## 4. ECK: A Textbook Bounded Context

Elastic Cloud on Kubernetes (ECK) encapsulates a full Elasticsearch/Kibana/APM domain **inside** one control plane:

| Inside the boundary (cluster) | Outside the boundary |
|-------------------------------|----------------------|
| Custom Resources (`Elasticsearch`, `Kibana`, `ApmServer`, `ElasticAgent`) | Optional S3/GCS bucket for snapshots |
| Operator logic: cluster bootstrap, master elections, rolling upgrades, cert rotation, ILM | A single HTTPS endpoint for clients |
| Native K8s primitives: StatefulSets for data nodes, Deployments for masters/ingest, PVCs for storage | — |

Everything the domain needs—sharding, leader election, scaling, fault recovery—happens internally. The external contract is minimal and explicit. That is exactly what DDD calls "high cohesion, low coupling."

Running on bare-metal accentuates the fit: Kubernetes supplies only fundamental abstractions (pods, storage classes, networking) while the ECK operator owns the rest.

---

## 5. Decision Matrix: When to Use Kubernetes

| Question | If "YES" → Pick K8s + Operator | If "NO" → Stay With Cloud Services |
|----------|--------------------------------|------------------------------------|
| Does the workload require multi-node coordination (leader election, quorum, shard rebalance)? | ECK, Strimzi, Flink-K8s, etc. | S3, SQS, DynamoDB, BigQuery already solve it |
| Can the whole domain sit behind a small interface once deployed? | Cluster keeps complexity inside | Half-in/half-out creates glue burden |
| Do you need portability to bare-metal or on-prem? | K8s abstracts the infra | Managed service lock-in is acceptable |
| Is day-2 operation (upgrade, failover) encoded in an operator? | Use the operator | Avoid hand-rolling run-books |

If **any** row in the right column is true, Kubernetes is probably a liability for that domain.

---

## 6. Where OnDemandEnv Fits

OnDemandEnv can stitch two control planes into one developer experience—spawning preview environments that include both EKS resources and AWS services.  
But when the entire bounded context already lives inside K8s (e.g., ECK), OnDemandEnv's job is trivial: create a namespace or ephemeral cluster, apply a few CRDs, and you're done. The platform tax disappears because the architectural cut matches the domain boundary.

---

## 7. Practical Recommendations

* Audit existing services: list every component and mark whether its control plane is K8s or the cloud provider. Any mixed rows signal accidental complexity.  
* Prefer managed services for commoditised concerns (object storage, queueing, SQL).  
* Adopt Operators for complex, stateful, multi-node systems that profit from Kubernetes' reconciliation loop.  
* Measure the "glue tax": extra IAM roles, Terraform lines, dashboards, on-call run-books. If that tax > operator complexity, collapse your boundary.

---

## 8. Conclusion

I am not anti-Kubernetes. I am anti-_misaligned boundaries_.  
Kubernetes shines when a well-scoped operator turns essential complexity into declarative intent. It hinders when it slices an otherwise cohesive system into two masters.

Use the right tool for the right bounded context—and let simplicity be your competitive advantage. 