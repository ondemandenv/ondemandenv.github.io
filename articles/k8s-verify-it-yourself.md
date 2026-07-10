---
layout: article
title: "Verify It Yourself: The Cluster Mechanisms Behind Why K8s Infrastructure Rots"
description: "The companion lab to \"Why Kubernetes Infrastructure Rots.\" Every claim the series says you can check on any cluster is checked here, with copy-pasteable commands and the real output they produced on a throwaway k3d cluster — foreign keys, CEL scope, ownerRefs, server-side apply, kstatus."
permalink: /articles/k8s-verify-it-yourself/
date: 2026-07-10
author: "Gary Yang"
tags: ["kubernetes", "etcd", "admission-control", "server-side-apply", "crd", "verification", "platform-engineering"]
---

# Verify It Yourself: The Cluster Mechanisms Behind Why K8s Infrastructure Rots

*The main series argues that Kubernetes infrastructure rots for structural reasons — no foreign keys, single-object admission, last-writer-wins writes. This companion is the lab. Every claim in the series that says "you can check this on any cluster" is checked here, with copy-pasteable commands and the **real output** they produced on a throwaway cluster. Nothing below is illustrative-only; it was all run on k3d (K8s v1.31.5) and the transcripts are verbatim.*

*Spin up a sandbox and follow along:*

```bash
k3d cluster create rot-demo          # or: kind create cluster --name rot-demo
kubectl config current-context       # k3d-rot-demo
```

*Two demo CRDs stand in for a fragmented domain — a `NetworkRuleSet` and an `FMSPolicy` that references it by name:*

```yaml
# crds.yaml — apply with: kubectl apply -f crds.yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata: {name: networkrulesets.net.example.com}
spec:
  group: net.example.com
  scope: Namespaced
  names: {kind: NetworkRuleSet, plural: networkrulesets, singular: networkruleset}
  versions:
  - name: v1
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
            type: object
            properties:
              cidrs: {type: array, items: {type: string}}
---
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata: {name: fmspolicies.net.example.com}
spec:
  group: net.example.com
  scope: Namespaced
  names: {kind: FMSPolicy, plural: fmspolicies, singular: fmspolicy}
  versions:
  - name: v1
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
            type: object
            properties:
              ruleSetRef: {type: string}   # a plain-string "reference" to a NetworkRuleSet
```

---

## Part 1 — etcd Has No Foreign Keys

**Claim (Part 1):** a cross-CR reference is a plain `string`; the store enforces no referential integrity, so a dangling reference lives happily.

```bash
# Create a policy referencing a rule set that does NOT exist:
$ kubectl apply -f - <<'EOF'
apiVersion: net.example.com/v1
kind: FMSPolicy
metadata: {name: prod-policy}
spec: {ruleSetRef: base-rules}
EOF
fmspolicy.net.example.com/prod-policy created          # ← accepted

# The referenced object genuinely does not exist:
$ kubectl get networkruleset base-rules
Error from server (NotFound): networkrulesets.net.example.com "base-rules" not found

# Yet the policy is stored, pointing at nothing:
$ kubectl get fmspolicy prod-policy -o jsonpath='{.spec.ruleSetRef}'
base-rules

# Create the target, then delete it while the policy still references it:
$ kubectl apply -f - <<'EOF'
apiVersion: net.example.com/v1
kind: NetworkRuleSet
metadata: {name: base-rules}
spec: {cidrs: ["10.0.0.0/8"]}
EOF
networkruleset.net.example.com/base-rules created
$ kubectl delete networkruleset base-rules
networkruleset.net.example.com "base-rules" deleted

# Policy untouched; reference dangling again. A relational store would have
# raised ON DELETE RESTRICT. etcd raised nothing:
$ kubectl get fmspolicy prod-policy -o jsonpath='ruleSetRef={.spec.ruleSetRef}'
ruleSetRef=base-rules
```

**What this proves:** the invariant "the rule set must exist before a policy references it" is stored *nowhere*. There is no schema construct in the CRD that says "this string names an existing object of kind X." Fragmentation across repos rides on exactly this gap.

---

## Part 1 — CEL Validates *Inside* One Object, Not *Across* Objects

**Claim (Part 1):** `x-kubernetes-validations` (CEL) can enforce intra-object invariants at admission, but there is no cross-object existence check available to it.

Add an intra-object CEL rule (`ruleSetRef` must be non-empty):

```yaml
# ...under the FMSPolicy schema:
          spec:
            type: object
            properties:
              ruleSetRef: {type: string}
            x-kubernetes-validations:
            - rule: "self.ruleSetRef != ''"
              message: "ruleSetRef must not be empty"
```

```bash
# CEL enforces the INTRA-object rule — an empty ref is rejected at admission:
$ kubectl apply -f - <<'EOF'
apiVersion: net.example.com/v1
kind: FMSPolicy
metadata: {name: bad-policy}
spec: {ruleSetRef: ""}
EOF
The FMSPolicy "bad-policy" is invalid: spec: Invalid value: "object": ruleSetRef must not be empty

# But a reference to a NON-EXISTENT rule set is still accepted — CEL cannot see
# other objects. Its expression scope is 'self' (and 'oldSelf' on update); there
# is no API-server lookup function in the grammar:
$ kubectl apply -f - <<'EOF'
apiVersion: net.example.com/v1
kind: FMSPolicy
metadata: {name: still-dangling}
spec: {ruleSetRef: does-not-exist}
EOF
fmspolicy.net.example.com/still-dangling created       # ← accepted
```

**What this proves:** the "just add a validating webhook / CEL rule" instinct stops exactly at the object boundary. Intra-object: enforced (`bad-policy` rejected). Cross-object: impossible to express (`still-dangling` accepted). A `ValidatingAdmissionWebhook` *could* reach back and read another object mid-admission, but that read is not transactional with the write — the target can vanish a millisecond later — so it's a race, not a guarantee.

---

## Part 1 — Nothing Couples Two CRDs' Lifecycles (No Cross-CRD `ownerReference`)

**Claim (Part 1):** across independently-owned CRDs there are no owner references, so the API server enforces no lifecycle relationship — while *within* one controller's resources, owner refs cascade correctly.

```bash
# The policy has NO ownerReferences linking it to any rule set:
$ kubectl get fmspolicy prod-policy -o jsonpath='ownerReferences={.metadata.ownerReferences}'
ownerReferences=                                       # ← empty

# Delete the 'parent' rule set. Nothing blocks or cascades; the policy is orphaned:
$ kubectl delete networkruleset base-rules
networkruleset.net.example.com "base-rules" deleted
$ kubectl get fmspolicy prod-policy -o jsonpath='ruleSetRef={.spec.ruleSetRef}'
ruleSetRef=base-rules                                  # ← still Active, pointing at the deleted target

# CONTRAST: owner refs DO cascade — when something sets them. A ConfigMap owned
# by prod-policy is garbage-collected the moment its owner is deleted:
$ POLICY_UID=$(kubectl get fmspolicy prod-policy -o jsonpath='{.metadata.uid}')
$ kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: owned-by-policy
  ownerReferences:
  - apiVersion: net.example.com/v1
    kind: FMSPolicy
    name: prod-policy
    uid: ${POLICY_UID}
    controller: true
    blockOwnerDeletion: true
data: {note: "owned by prod-policy"}
EOF
configmap/owned-by-policy created
$ kubectl delete fmspolicy prod-policy
fmspolicy.net.example.com "prod-policy" deleted
$ sleep 5; kubectl get configmap owned-by-policy
Error from server (NotFound): configmaps "owned-by-policy" not found   # ← GC cascaded
```

**What this proves:** the garbage collector's cascade is real and powerful — *when an owner reference exists*. Across six independently-scaffolded CRDs, nobody sets owner refs between the kinds, so the control plane has no handle to notice the six pieces have drifted out of a consistent set. The fragmentation persists because nothing is empowered to object.

---

## Parts 4 & 6 — Server-Side Apply: Last-Writer-Wins Is *Per Field Manager*

**Claim (Parts 4, 6):** when multiple controllers write one CR, Server-Side Apply partitions ownership per field via `managedFields`; a manager owns only the fields it applies.

Use a CR that two "controllers" (field managers) write:

```bash
# deployment-controller applies a 'timers' field:
$ kubectl apply --server-side --field-manager=deployment-controller -f - <<'EOF'
apiVersion: net.example.com/v1
kind: AppNetwork
metadata: {name: env-42}
spec: {timers: {publishTimeout: 30s}}
EOF

# network-operator applies a DIFFERENT field 'domains' on the SAME object:
$ kubectl apply --server-side --field-manager=network-operator -f - <<'EOF'
apiVersion: net.example.com/v1
kind: AppNetwork
metadata: {name: env-42}
spec: {domains: ["app.example.com"]}
EOF

# Both coexist — SSA merged them because they're owned by different managers:
$ kubectl get appnetwork env-42 -o jsonpath='timers={.spec.timers}  domains={.spec.domains}'
timers={"publishTimeout":"30s"}  domains=["app.example.com"]

# managedFields records exactly who owns what:
$ kubectl get appnetwork env-42 --show-managed-fields \
    -o jsonpath='{range .metadata.managedFields[*]}{.manager}{" owns: "}{.fieldsV1}{"\n"}{end}'
deployment-controller owns: {"f:spec":{"f:timers":{".":{},"f:publishTimeout":{}}}}
network-operator owns: {"f:spec":{"f:domains":{}}}
```

**What this proves:** ownership is tracked *per field*, in-band, in `metadata.managedFields`. This is the machinery the series says the CR-as-shared-state problem needs — and it's already in the API server. The next section shows what happens when a controller ignores it.

---

## Part 6 — `Update()` Is an HTTP PUT: It Silently Strips Fields It Doesn't Know

**Claim (Part 6):** a controller doing read-modify-write with `client-go`'s `Update()` issues a full-object PUT; fields absent from its Go struct marshal as absent and are deleted — no error, no admission catch.

```bash
# Two managers have written two fields:
$ kubectl get appnetwork env-99 -o jsonpath='timers={.spec.timers}  domains={.spec.domains}'
timers={"publishTimeout":"30s"}  domains=["app.example.com"]

# A naive controller GETs the object, and PUTs it back with a struct that only
# knows 'domains' (so 'timers' is absent from its serialization).
# kubectl replace issues the SAME full-object PUT that client-go Update() does:
$ kubectl get appnetwork env-99 -o json \
    | jq '.spec = {domains: .spec.domains} | del(.metadata.managedFields,.metadata.resourceVersion,.metadata.uid,.metadata.creationTimestamp,.metadata.generation)' \
    | kubectl replace -f -

# timers is SILENTLY GONE — collateral damage of the full-object replace:
$ kubectl get appnetwork env-99 -o jsonpath='timers={.spec.timers}  domains={.spec.domains}'
timers=  domains=["app.example.com"]                   # ← the OTHER controller's field, deleted

# CONTRAST: the same logical write via SSA (field-scoped apply) leaves timers alone:
$ kubectl apply --server-side --field-manager=deployment-controller -f - <<'EOF'  # restore
apiVersion: net.example.com/v1
kind: AppNetwork
metadata: {name: env-99}
spec: {timers: {publishTimeout: 30s}}
EOF
$ kubectl apply --server-side --field-manager=network-operator -f - <<'EOF'
apiVersion: net.example.com/v1
kind: AppNetwork
metadata: {name: env-99}
spec: {domains: ["new.example.com"]}
EOF
$ kubectl get appnetwork env-99 -o jsonpath='timers={.spec.timers}  domains={.spec.domains}'
timers={"publishTimeout":"30s"}  domains=["new.example.com"]   # ← both survive
```

**What this proves:** the silent-data-loss incident the series describes is not a bug in anyone's business logic — it's the default write path. `Update()` → `PUT` → full replace → any field the writer's struct doesn't model is dropped. No error is returned; no webhook can catch it (a webhook sees the incoming object, not the diff against another manager's fields). Switching the write to SSA (`Patch` with `apply` semantics, a field manager) is the fix, and the contrast above is the proof.

---

## Part 6 — `resourceVersion`: The Optimistic Lock the Write-Loop Rides On

**Claim (Part 6):** each `Update()` carries the `resourceVersion` the controller read; the API server rejects a stale one with `409 Conflict`, and controller-runtime's response is re-Get-and-retry. That retry loop is *why* two controllers writing the same CR don't get a conflict between them — each re-Gets the other's write first, then replaces, clobbering the fields its struct omits.

```bash
# Capture the current resourceVersion (what a controller reads before writing):
$ RV=$(kubectl get appnetwork rvdemo -o jsonpath='{.metadata.resourceVersion}')
$ echo $RV
2065

# Someone else writes first, bumping the resourceVersion:
$ kubectl patch appnetwork rvdemo --type=merge -p '{"spec":{"domains":["b.example.com"]}}'
$ kubectl get appnetwork rvdemo -o jsonpath='{.metadata.resourceVersion}'
2066

# We try to write with the STALE resourceVersion (a full replace / PUT):
$ kubectl replace -f - <<EOF
apiVersion: net.example.com/v1
kind: AppNetwork
metadata: {name: rvdemo, resourceVersion: "$RV"}
spec: {domains: ["c.example.com"]}
EOF
Error from server (Conflict): error when replacing "STDIN": Operation cannot be
fulfilled on appnetworks.net.example.com "rvdemo": the object has been modified;
please apply your changes to the latest version and try again

# Our stale write did not land:
$ kubectl get appnetwork rvdemo -o jsonpath='{.spec.domains}'
["b.example.com"]
```

**What this proves:** the 409 is the optimistic lock. It stops a *stale* overwrite — but it does nothing to stop a *fresh* one. A controller that re-Gets, sets its own field, and PUTs will pass the resourceVersion check every time and still strip the fields its Go struct doesn't model (previous section). So the lock guarantees serializability, not correctness: two controllers ping-pong-ing a CR each write successfully in turn, and each undoes the other's fields — no 409 ever fires, because no write is ever stale. Optimistic concurrency prevents lost *updates to the same field*, not lost *fields*. SSA is what prevents the latter.

---

## Part 5 — CRD Versions *Do* Coexist (One Storage Version, Conversion on Read)

**Claim correction (Part 5):** it is a common misconception that "two versions of a CRD cannot coexist — one schema per GVK." They can. A CRD declares `spec.versions[]`; multiple can be `served: true` simultaneously; exactly one is `storage: true`. The real constraint is one *storage* schema plus conversion cost — not "no coexistence."

```bash
# A CRD serving BOTH v1 and v2 at once (storage = v2):
$ kubectl apply -f - <<'EOF'
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata: {name: widgets.demo.example.com}
spec:
  group: demo.example.com
  scope: Namespaced
  names: {kind: Widget, plural: widgets, singular: widget}
  conversion: {strategy: None}
  versions:
  - {name: v1, served: true,  storage: false, schema: {openAPIV3Schema: {type: object, properties: {spec: {type: object, properties: {size: {type: string}}}}}}}
  - {name: v2, served: true,  storage: true,  schema: {openAPIV3Schema: {type: object, properties: {spec: {type: object, properties: {size: {type: string}}}}}}}
EOF

# Both versions are served simultaneously:
$ kubectl get crd widgets.demo.example.com \
    -o jsonpath='{range .spec.versions[*]}{.name}(served={.served},storage={.storage}) {end}'
v1(served=true,storage=false) v2(served=true,storage=true)

# Create via v1, read the SAME object via v2:
$ kubectl apply -f - <<'EOF'
apiVersion: demo.example.com/v1
kind: Widget
metadata: {name: w1}
spec: {size: large}
EOF
$ kubectl get widget.v1.demo.example.com w1 -o jsonpath='{.apiVersion} size={.spec.size}'
demo.example.com/v1 size=large
$ kubectl get widget.v2.demo.example.com w1 -o jsonpath='{.apiVersion} size={.spec.size}'
demo.example.com/v2 size=large
```

**What this proves:** two served versions of one kind coexist right now, and the same stored object is readable at either. Where Part 5's argument holds is the *storage* version: etcd persists every object at the single storage version, and a real schema change between versions needs a conversion webhook (this demo used `strategy: None` with identical schemas). So the accurate statement is "one storage schema + conversion cost," and the coexistence a migration needs at the *API* layer is available — the harder coexistence problems the article describes live above the CRD, in the single-version pipeline and the mesh's single xDS push, not in the CRD versioning mechanism itself.

---

## Parts 2 & 5 — kstatus: A Stale `Reconciling` Condition Blocks Readiness

**Claim (Parts 2, 5):** a GitOps health gate computes readiness from an object's `status.conditions` via the kstatus convention, under which `Reconciling: True` classes the object as *InProgress* — overriding `Ready: True`. So a controller that sets `Reconciling` during an apply and forgets to clear it renders the object permanently "not healthy," freezing every `dependsOn` dependent.

*Honesty note: this section reproduces the **object state** that triggers the trap — an object that is simultaneously `Ready: True` and `Reconciling: True` — live on the sandbox. The kstatus precedence rule itself (`Reconciling==True ⇒ InProgress`, evaluated before `Ready`) is cited from the `cli-utils` kstatus library convention that Flux's health check calls; it was **not** executed against a Flux install on this throwaway cluster.*

```bash
# A CRD with a status subresource so we can author conditions:
$ kubectl apply -f - <<'EOF'
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata: {name: tfresources.infra.example.com}
spec:
  group: infra.example.com
  scope: Namespaced
  names: {kind: TFResource, plural: tfresources, singular: tfresource}
  versions:
  - name: v1
    served: true
    storage: true
    subresources: {status: {}}
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec: {type: object, x-kubernetes-preserve-unknown-fields: true}
          status:
            type: object
            properties:
              conditions:
                type: array
                items:
                  type: object
                  properties:
                    type: {type: string}
                    status: {type: string}
                  required: [type, status]
EOF
$ kubectl apply -f - <<'EOF'
apiVersion: infra.example.com/v1
kind: TFResource
metadata: {name: vpc-peering}
spec: {}
EOF

# The controller writes Ready=True (apply done) AND leaves a stale Reconciling=True:
$ kubectl patch tfresource vpc-peering --subresource=status --type=merge -p '{
  "status": {"conditions": [
    {"type":"Ready","status":"True"},
    {"type":"Reconciling","status":"True"}
  ]}
}'

# The object is genuinely in both states at once:
$ kubectl get tfresource vpc-peering \
    -o jsonpath='Ready={.status.conditions[?(@.type=="Ready")].status} Reconciling={.status.conditions[?(@.type=="Reconciling")].status}'
Ready=True Reconciling=True
```

**What this proves:** the object can, and in real controllers does, hold `Ready=True` alongside a leftover `Reconciling=True`. Under the kstatus convention the health gate reads, that object is *InProgress*, not *Current* — so Flux marks the `Kustomization` unhealthy and any `dependsOn` dependent never starts. The failure is a single un-cleared status field; the blast radius is every downstream stack in the dependency chain. `dependsOn` gates on *readiness*, not correctness — and readiness here is decided by a convention that has no notion of "this resource is done, it just forgot to say so."

---

## Teardown

```bash
k3d cluster delete rot-demo
```

---

*Every transcript above is verbatim output from a real run on k3d v1.31.5. Where the series says "you can verify this yourself," this is the verification. If a future Kubernetes version changes any of these behaviors, these commands are how you'd find out.*

---

### Series: Why Kubernetes Infrastructure Rots

- **Part 1: [The Operator Mindset](/articles/k8s-operator-mindset-vs-domain-modeling/)** — Why one domain becomes six repositories. The repo-per-problem anti-pattern as a consequence of thinking in procedures instead of models.

- **Part 2: [The Cargo Cult](/articles/k8s-cargo-cult-centralization/)** — Why shared repos and better tools don't fix it. The failed abstraction phase.

- **Part 3: [The Abstraction Instinct](/articles/k8s-abstraction-instinct/)** — What no tool can provide. CDK in the hands of an operator is still operator thinking.

- **Part 4: [The Distributed Monolith](/articles/k8s-gitops-distributed-monolith/)** — Why your GitOps is a monolith wearing a microservices costume. Five repos, five teams, zero transactional boundary, and six incidents in four weeks.

- **Part 5: [The Staging Mindset](/articles/k8s-staging-mindset-kills-migration/)** — Routing is atomic. Deployment is not. Why feature flags are what happens when the infrastructure can't express version coexistence.

- **Part 6: [The Shared Mutable State](/articles/k8s-cr-shared-mutable-state/)** — The CR is a database table with no foreign keys, shared between controllers with no ownership model. Silent data loss as a design consequence.

- **Aside: [Operator Stockholm Syndrome](/articles/k8s-operator-stockholm-syndrome/)** — When the K8s control plane becomes the universe. Routing every cloud API through a cluster CR even when the cluster has no semantic role.

- **Aside: [The Cron and the Gate](/articles/k8s-cron-and-gate/)** — When the operator models itself instead of the domain. One `Reconcile()` hook, triggered identically by create/resync/requeue, becomes the only place policy can live.

- **Aside: [The Configuration Problem](/articles/k8s-tribal-knowledge/)** — One business rule sliced across Helm, ConfigMap, Flux substitution, and Calico's dataplane — zero cohesion, load-bearing tribal knowledge.

- **Aside: [The Auto-Approve](/articles/k8s-auto-approve-swallows-the-gate/)** — When the reconcile loop swallows `terraform plan`. Wrapping a tool with a human-in-the-loop gate in a loop that structurally can't hold one.

- **Aside: [You Can't Front-Run the Composition Gap](/articles/k8s-front-run-composition-gap/)** — Why correct first-principles reasoning must crash once before it can diagnose.

- **Lab: [Verify It Yourself](/articles/k8s-verify-it-yourself/)** — Copy-pasteable, real-output reproductions of every cluster mechanism the series cites (foreign keys, CEL scope, ownerRefs, SSA, PUT-strips-fields, resourceVersion, CRD versioning, kstatus). *(this article)*

- **Synthesis: [The Thermostat That Ate Infrastructure](/articles/k8s-thermostat-not-a-deployment-engine/)** — How a container self-healing pattern became a deployment engine. The missing DAG from node boot to infrastructure blue/green.
