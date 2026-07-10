---
layout: article
title: "LLMs Pick the Median. In Broken Domains, the Median IS the Problem."
description: "An LLM given an under-specified task samples the median of its training data. In a healthy domain that's competent; in a domain whose median solution is the disease — like the Kubernetes operator ecosystem — the LLM just makes the mediocre fix faster, more confidently, and harder to question."
permalink: /articles/llms-pick-the-median/
date: 2026-07-10
author: "Gary Yang"
tags: ["AI", "LLM", "kubernetes", "operators", "software-engineering", "distributed-systems"]
---

# LLMs Pick the Median. In Broken Domains, the Median IS the Problem.

*An LLM helping you fix a bug in a Kubernetes operator will produce a fix that looks like the most common operator-bug fix in its training data. If the median fix in that training data is mediocre — and in the Kubernetes ecosystem, it almost always is — then the LLM has just made the mediocre fix faster, more confidently, and harder to question than if a human had done it. This essay argues that the AI-coding-assistant value proposition is correctly priced for domains whose median solution is good, and badly mispriced for domains whose median solution is the disease. The Kubernetes operator domain is squarely in the second category. So is most enterprise infrastructure.*

---

## The Argument in One Sentence

Large language models, given an under-specified task, sample from the distribution of training data weighted by what looks plausible at the prompt. In a healthy domain, sampling the median produces a competent answer. In a domain whose median is structurally broken, sampling the median produces the disease, dressed in the confidence of an LLM response.

The implication: AI coding assistance amplifies the worst tendencies of domains where the dominant pattern is the wrong pattern. It cannot rescue you from a frame the frame's own practitioners cannot see.

---

## The Worked Example

A Kubernetes operator owns CloudFront signing keypair rotation. The codebase has the shape every kubebuilder template produces: a `Rotator` struct, a `cronSchedule` constant, a `runRotation()` method that does both integrity checks and key mutation, three Prometheus gauges populated as side effects of `runRotation`.

A ticket appears with one bullet of acceptance criteria:

> *Update the rotation time for the keys to happen on Sunday rather than Monday.*

An engineer reads the ticket, opens the package, sees a constant named `cronSchedule` set to `"0 5 * * *"` ("rotation time"), and changes it to `"0 5 * * 0"` ("Sunday only"). The change passes review, gets merged, ships.

Two senior engineers correct it: the cron is supposed to fire every day to validate system integrity; rotation is what should happen on Sunday, and rotation is *already* gated separately inside `checkIntegrity()` by a function whose return value enforces the weekly boundary. The fix is to move the boundary one day earlier, not to gut the cron. The PR gets reverted. A new PR is opened that restores the cron and changes the boundary. The whole cycle takes four commits, two of which are reverts.

The structural reasons this misread is unavoidable are covered in a companion essay ([The Cron and the Gate](/articles/k8s-cron-and-gate/)). Briefly: the domain has two layers — *trigger* and *policy* — that share a code path because the operator-runtime frame provides no way to separate them. The senior engineers carry the layer distinction in their heads; the code does not name it; the ticket does not state it. The misread is the natural reading of the artifacts as written.

This essay is about what happens when you put an LLM in the loop.

---

## What the LLM Would Have Produced

Hand an LLM the ticket text and the package. Ask: *"Implement this AC."*

The LLM has access to:
- The bullet ("rotate on Sunday rather than Monday")
- The package contents (`cronSchedule = "0 5 * * *"`, `runRotation()`, `checkIntegrity()`, `previousMondayMidnightUTC()`)
- Whatever training data it has absorbed about Kubernetes operators, cron expressions, and key rotation patterns

It does not have access to:
- The mental model the senior engineers carry
- The prior incident or design conversation that produced the layered architecture
- The folklore that "trigger" and "rotation" are different concerns
- Any code where this distinction is named as a type

Given this input, what is the highest-probability next action across the training corpus? Almost certainly: *find the constant whose name maps onto the noun in the AC ("rotation time" → `cronSchedule`), modify it minimally to achieve the surface goal, add a test.* That is the median Kubernetes-operator change. It's what most pull requests in most training-data repositories look like.

The LLM produces the exact same wrong fix as the human did. Faster. With more confidence in the explanation. And — here's the dangerous part — with cleaner commit messages, tidier tests, and a more polished PR description, all of which make the misread *harder* to catch in review than the human's version would have been.

The LLM is not failing here. It is succeeding at the task as posed. The task was: *produce the most likely correct change given the visible inputs.* It did. The fact that the most likely correct change is wrong is a property of the domain, not of the LLM.

---

## Why "Better Prompts" Doesn't Save This

The standard rejoinder to LLM mediocrity is: *prompt better.* Tell the model about the layer distinction. Include a CLAUDE.md that explains the architecture. Give it more context.

Try writing that prompt before the misread happens.

The senior engineers' mental model — "trigger and rotation are different concerns; trigger fires daily to validate integrity; rotation is gated by the day-of-week boundary inside checkIntegrity" — is *not in any artifact*. It is in their heads. It got externalized only because the misread forced them to articulate it in a Slack thread, after the wrong PR shipped. Before the misread, nobody would have thought to write this down. It was obvious to the people who knew it and invisible to everyone else.

This is the structural part. The prompt cannot contain knowledge nobody wrote down. The user prompting the LLM is, by hypothesis, the person who *needs* the model — because if they already had it, they wouldn't be asking. The senior engineers who do have the model are not in the prompt loop. So the LLM reasons over the same impoverished inputs the human had, and reaches the same conclusion, faster.

This is not a problem of LLM intelligence or training depth. It is a problem of **what is recoverable from the prompt**. The relevant abstractions exist as folklore, not as types. Folklore is not in the artifact. Therefore folklore is not in the prompt. Therefore the LLM cannot use it.

You can teach the LLM the folklore by writing it down. But the act of writing it down is the act of doing the engineering work the LLM was supposed to save you from. The LLM cannot be the thing that produces the externalization, because the LLM does not know what's missing — the same epistemic deficit that produces the misread in the first place.

---

## The Median Trap Is Domain-Dependent

This essay is not "LLMs are bad at coding." LLMs are excellent at coding tasks where the median solution in their training data is the good solution. Examples:

- **Pure-algorithm problems.** Sort this list, parse this JSON, implement Dijkstra. The training corpus has thousands of correct implementations. The median is correct. The LLM sampling the median produces correct code.
- **Standard idioms in well-formed languages.** Write a React component, an Express route handler, a Pandas dataframe transformation. The framework's idioms are well-codified, the training data is rich, the median is competent.
- **Mechanical refactors.** Rename this variable everywhere, extract this method, add error handling on this function. The action is local and the correct answer is determined by the visible context.

In all these cases, the LLM's sampling-the-median behavior is a *feature*. You want the median, because the median is right.

The trap is in domains where the median is wrong. Three properties identify such domains:

1. **The relevant abstractions are not present as types in code.** They exist as folklore in senior practitioners' heads.
2. **The dominant pattern in the training data is the broken pattern.** Because the domain produces vastly more code than it produces critique of the code.
3. **Surface-level competence is achievable without the underlying model.** So bad solutions look like good solutions until they're stress-tested by reality.

The Kubernetes operator domain hits all three. The operator-mindset frame produces enormous quantities of training data: kubebuilder templates, controller-runtime examples, blog posts about reconciliation loops, every public operator on GitHub. Domain-modeled operators — operators where the business invariants live as types in a domain layer and the controller is a thin binding — are vanishingly rare. So the training distribution is overwhelmingly weighted toward the broken pattern. An LLM sampling that distribution is sampling the disease.

Most enterprise infrastructure code hits these three properties. Terraform modules. Helm charts. Ansible roles. CloudFormation stacks. CI/CD pipelines. In all these areas, the median is "what you'd find on a corporate Git server," and what you'd find on a corporate Git server is the pattern this entire essay series is critiquing. The LLM trained on that median will reproduce it.

---

## Why the Confidence Makes It Worse

A human engineer making the wrong fix at least makes it with visible signs of effort: hesitation in commit messages, awkward variable names, asks-on-Slack, hedged language in the PR description. These signals are how senior reviewers spot work that hasn't been thought through.

An LLM produces no hesitation. The commit message is well-structured. The test names are descriptive. The PR description follows the conventional-commits format perfectly. The explanation in chat is articulate and references the relevant constants. *Everything looks like it was done by someone who understood the change.*

This is the worst form of false competence: surface signals of expertise applied to a misread the producer was incapable of catching. The wrong answer is now harder to question, because questioning it requires saying "this looks right but is wrong" — a thing seniors say when they smell the gap, but a thing that's hard to defend in a code review against polished-looking work.

The LLM is not lying. It does not know it's wrong. Neither does the human prompting it. The misread has been laundered through the model's confidence and now wears the costume of a competent change.

---

## What This Means for "AI Coding Assistants"

The product category, as currently pitched, promises productivity gains across the board. The pitch implicitly assumes that LLM output is uniformly useful — that the median answer is a good baseline that humans then refine. This pricing is correct in the healthy domains listed above. It is badly wrong in the broken-median domains.

In a broken-median domain, the LLM is not a productivity multiplier. It is a defect multiplier. It produces *more* of the wrong pattern, *faster*, with *better camouflage*. The cost of catching and correcting those defects falls on senior engineers — the same people whose folklore-model was needed to prevent the defect in the first place. So the apparent productivity gain at the junior tier is offset by a more expensive review burden at the senior tier, plus a worsening of the codebase's medium-term health as more median-shaped code accumulates.

This is not an argument against using LLMs. It is an argument against using them the way they are currently marketed. Specifically:

- **LLM output should be treated as median-shaped, not correct.** In domains where the median is the disease, this means LLM output is a starting point that must be diagnostically examined, not a draft that needs polish.
- **The reviewer's job changes.** Code review of LLM-generated work in a broken-median domain is not "check for bugs." It is "check whether the model the LLM used is the right model." That is a different and harder skill than ordinary code review.
- **The folklore problem becomes the bottleneck.** The path to LLMs being useful in these domains runs through externalizing the senior engineers' mental models into code, as types and tests. Until that work is done, the LLM cannot use the model. After that work is done, the LLM is partially useful but the codebase already got most of the value from the externalization itself.

In short: the only way to make AI assistance useful in a broken-median domain is to do the domain-modeling work the assistance was supposed to replace.

---

## The Recursion Worth Naming

A confession that belongs in this essay because pretending otherwise would falsify the argument.

The chain of conversation that produced both this essay and the companion piece on the cron-and-gate misread looked like this. A human engineer asked an LLM to look at a Slack thread. The LLM summarized it. The human asked the LLM to help build a mental model. The LLM walked the human through the code and arrived at the operator-mindset solution. The human asked the LLM to draft a fix. The LLM drafted commits, PR descriptions, Jira comments, all in the operator-mindset frame. The fix shipped.

At no point during this chain did the LLM say: *"Wait — the actual problem here is that this domain has no model. The fix you're about to ship makes the wrong pattern more durable. The metrics gap you noticed in a follow-up is structural. The cron-and-gate confusion is the same structural pattern. Should we be talking about that instead?"*

The LLM did not say this because the LLM's prior over "what is a helpful response" is overwhelmingly weighted toward executing the user's local task. The training data is full of "user asks for X, assistant produces X." It is sparse on "user asks for X, assistant says the question is wrong." The latter is what a senior engineer does. The former is what an LLM does. The gap is precisely the model that distinguishes a senior engineer from a competent junior — and that gap is not in the training distribution at sufficient density to be the default behavior.

The human, in this chain, eventually surfaced both observations themselves: first the metrics-as-side-effect observation, then the SDE-model-is-wrong observation. The LLM amplified each correctly once stated. The LLM did not produce either. Both were latent in everything the LLM had read. Both were missed.

This essay exists because the human, not the LLM, did the work. The LLM is now writing the essay because the human asked it to, and the LLM is structurally capable of producing reasonable prose once the argument is articulated. But the argument was not articulated by the LLM. The LLM, left to its own priors, would have continued helping the human ship the original fix and would never have written this paragraph.

The honest summary: LLMs are useful for code-shaped tasks once the engineering thinking has been done. They are not useful for *replacing* the engineering thinking. Treating them as a replacement is the category error this essay names.

---

## The Marker

The point of this essay is not to argue against LLMs. The point is to give a name to a specific failure mode so that engineers reading it later — including engineers using AI assistance daily — can recognize when they're in it.

The failure mode: **you are working in a domain whose median is the disease, you are using a tool that samples the median with confidence, and the tool's output will look correct exactly because it conforms to the diseased pattern.** The longer you go without recognizing you are in this state, the more median-shaped artifacts accumulate, the harder it gets to do the externalization work that would let the tool actually help.

The intervention is not "stop using LLMs." It is "know when the LLM is sampling from a distribution you should not trust, and treat its output as one observation, not a draft." That recognition is a senior-engineer skill. It cannot be automated. It can only be named.

This essay is the name.

---

## Related

- [The Cron and the Gate: When the Operator Models Itself Instead of the Domain](/articles/k8s-cron-and-gate/) — the worked example this essay reasons over
- [The Operator Mindset: Why One Domain Becomes Six Repositories](/articles/k8s-operator-mindset-vs-domain-modeling/) — why the median in this domain is the disease
- [When the Framework Becomes the Emperor: How Centralizing AI Tooling Kills Engineering Craft](/articles/ai-framework-unification-kills-craft/) — the org-level version of the same dynamic
- [The Abstraction Instinct: What No Tool Can Provide](/articles/k8s-abstraction-instinct/) — why no amount of tooling investment fixes the underlying gap
