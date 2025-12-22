---
layout: article
title: "Context Engineering Has Hit a Wall: Why AI Coding Assistants Need Bounded Contexts"
description: "AI coding assistants are repeating the same mistakes as package managers and monolithic architectures. The solution isn't more context—it's bounded contexts."
permalink: /articles/context-engineering-wall-ai-bounded-contexts/
date: 2024-12-21
author: "Gary Yang"
tags: ["AI", "context-engineering", "bounded-contexts", "DDD", "complexity", "Claude Code", "developer-tools"]
---


*Why AI coding assistants are repeating the same mistakes as package managers and monolithic architectures*

---

## The Promise

AI coding assistants like Claude Code, Cursor, and GitHub Copilot promise to augment developers with reusable "skills," "plugins," and context injection. Write a CLAUDE.md file describing your architecture. Load skills for Go best practices. Install plugins for workflow automation.

The pitch: more context = better AI output.

The reality: we're building the next dependency hell.

---

## The Pattern We Keep Repeating

```
Era 1: Package Management (apt, npm, pip)
─────────────────────────────────────────
"Just add dependencies"
     ↓
Dependency hell (version conflicts, transitive nightmares)

Era 2: Code Libraries
─────────────────────
"Just import and reuse"
     ↓
Coupling hell (can't change A without breaking B, C, D)

Era 3: Monolithic Architecture
──────────────────────────────
"Just add features to the monolith"
     ↓
Complexity hell (nobody understands the whole system)

Era 4: AI Context Engineering (NOW)
───────────────────────────────────
"Just add more context, skills, plugins"
     ↓
Context conflict hell (emerging)
```

The solution to Eras 1-3 was **bounded contexts**—explicit boundaries with contracts at the edges. SOA, microservices, DDD. The industry learned (painfully) that the problem isn't "how to add more stuff" but "how to manage complexity through proper boundaries."

AI tooling is ignoring this lesson entirely.

---

## How Context Engineering Actually Works

When you load a Claude Code session, everything merges into one context:

```
┌─────────────────────────────────────────────────────┐
│  ~/.claude/CLAUDE.md (global instructions)          │
│  + project/CLAUDE.md (project instructions)         │
│  + skill: go-guidelines                             │
│  + skill: testing-patterns                          │
│  + plugin: complex-codebases                        │
│  + plugin: cost-tracker                             │
│  + MCP: github, serena, context7                    │
│  + managed-settings permissions                     │
│                                                     │
│  ALL LOADED TOGETHER                                │
│  NO EXPLICIT BOUNDARIES                             │
│  CONFLICTS RESOLVED BY: ¯\_(ツ)_/¯                  │
└─────────────────────────────────────────────────────┘
```

This is a monolith. Every instruction can contradict every other instruction. There's no contract between components. No anti-corruption layer. No bounded contexts.

The inevitable result:

| Package Hell | Context Hell |
|--------------|--------------|
| Transitive dependencies | Transitive context inheritance |
| Version conflicts | Instruction conflicts |
| "Works on my machine" | "Works in my session" |
| Diamond dependency | Diamond context (A says X, B says Y, both loaded) |

---

## The Deeper Problem: Who Writes These Instructions?

Context engineering assumes the instructions are correct. They usually aren't.

**The cargo cult pipeline:**

```
Someone writes CLAUDE.md/Skills
        │
        ▼
┌─────────────────────────────────────┐
│  Their understanding (often flawed) │
│  • Shallow patterns copied from     │
│    blog posts                       │
│  • Yesterday's best practice        │
│  • Misunderstood requirements       │
│  • Optimized for demos, not reality │
└─────────────────────────────────────┘
        │
        ▼
    AI executes at 100x speed
    with high confidence
        │
        ▼
    Wrong thing done efficiently
```

The AI doesn't question bad instructions. It amplifies them. If your CLAUDE.md encodes a flawed architecture, the AI will enthusiastically produce more code that reinforces that flaw.

---

## The Human Capacity Problem

The root cause isn't AI. It's us.

```
Actual system complexity:     ████████████████████████████████████

Human working memory:         ████████  (7±2 items)

The gap:                      ████████████████████████████  (lies here)
```

What fills the gap:

- **Lying**: "Yeah, I understand the architecture" (doesn't)
- **Cargo culting**: "We do it this way because Google does"
- **Abstraction theater**: "It's hexagonal clean architecture" (it's spaghetti with fancy names)
- **Process worship**: "We follow DDD" (checking boxes, no understanding)

AI doesn't solve this. AI accelerates whatever direction you're already going—including the wrong one.

---

## Case Study: Server-Side Rendering

SSR is a perfect example of what happens when you violate natural boundaries.

**The natural boundary:**

```
┌─────────────────────┐          ┌─────────────────────┐
│     CLIENT          │    ←→    │      SERVER         │
│ • UI rendering      │  HTTP    │ • Business logic    │
│ • Browser sandbox   │  clear   │ • Trusted execution │
│ • Untrusted input   │ boundary │ • Data persistence  │
└─────────────────────┘          └─────────────────────┘
```

**The SSR blur:**

```
┌──────────────────────────────────────────────────────┐
│              SERVER + CLIENT MIXED                    │
│                                                       │
│  • Same code runs both places                        │
│  • Server functions callable from client             │
│  • Serialization boundaries exposed                  │
│  • Trust boundary collapsed                          │
└──────────────────────────────────────────────────────┘
```

The result: CVE-2025-55182, CVE-2025-59052, and a steady stream of vulnerabilities in Next.js Server Actions, React Server Components, and similar frameworks.

**The boundary blur IS the vulnerability.**

But no linter catches "you violated the client-server trust boundary." No test fails. The code "works." Developers can't see the problem because there's no signal. AI can't see it because AI optimizes for "looks like working code," not "respects architectural boundaries."

---

## Why DDD Is Still the Answer

Domain-Driven Design solved this for code architecture:

| DDD Concept | Purpose |
|-------------|---------|
| Bounded Context | Explicit boundary around a domain |
| Ubiquitous Language | Unambiguous terminology within a context |
| Anti-corruption Layer | Translation at boundaries |
| Context Map | Visibility into relationships |

What would DDD for AI context look like?

```
Instead of:                       This:
───────────                       ─────
Everything merged                 Explicit bounded contexts
Implicit conflicts                Contracts between contexts
"Skills" loaded globally          Context-specific instructions
No visibility                     Context map showing what's loaded
```

Nobody is building this.

---

## The Measurement Problem

We optimize what we measure:

| What we measure | What actually matters |
|-----------------|----------------------|
| Time to first response | Correctness |
| Tokens per second | Architectural coherence |
| "Did it work?" | "Is it maintainable?" |
| Feature velocity | Technical debt |
| Lines of code | Conceptual clarity |

AI optimizes for what's measurable. Architectural boundaries aren't measurable by current systems. Therefore AI ignores them.

---

## What Actually Helps

1. **Fewer instructions, not more.** Every CLAUDE.md line is a potential conflict. Every skill is noise competing for attention.

2. **Question the context.** Why does this instruction exist? Is it still true? Who wrote it and did they understand the domain?

3. **AI for exploration, human for judgment.** "Show me 5 options" not "Do it this way." The AI proposes, you dispose.

4. **Boundaries in code, not prompts.** Type systems, linters, and tests enforce behavior. Prompts suggest behavior. Enforcement beats suggestion.

5. **Honest assessment of understanding.** The hardest part. "I don't understand this system" is career-risky to say but essential to fix.

---

## The Uncomfortable Conclusion

AI coding assistants are amplifiers. They make fast teams faster and dysfunctional teams more dysfunctional.

The industry is solving the wrong problem. "How do I add more context?" is the wrong question. "How do I bound and manage context complexity?" is the right one—and it's the same question we've answered before with DDD, microservices, and bounded contexts.

We're just ignoring the answer because adding more context is easy, and proper decomposition requires understanding we'd rather pretend we have.

---

*The tooling isn't the problem. The problem is upstream: human cognitive limits combined with organizational systems that punish honesty about those limits. AI just runs faster in whatever direction we're already going.*

---

## Related Articles

- [The Compounding Complexity Trap: Navigating Engineering's Messy Reality](/articles/compounding-complexity-trap/) - How solutions to accidental problems create new ones
- [The Cognitive Architecture of Code: Taming Ambiguity and Accidental Complexity](/articles/cognitive-architecture-of-code/) - How type systems manage human working memory
- [From Exponential to Linear: How Domain Boundaries Eliminate Accidental Complexity](/articles/eliminating-accidental-complexity/) - The DDD approach to complexity management
- [The Siren Song of AI Vibe Coding and the Shore of Accidental Complexity](/articles/siren-song-ai-vibe-coding-accidental-complexity/) - AI-assisted coding's complexity pitfalls
