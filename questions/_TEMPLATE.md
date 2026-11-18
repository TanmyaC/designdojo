---
# ─── Shown to the candidate ────────────────────────────────────────────
title: Design a <system>          # How an interviewer would say it. Starts with "Design".
category: Storage                 # One of: Storage, Real-time, Feeds, Infrastructure, Payments, Other
difficulty: Medium                # One of: Easy, Medium, Hard
summary: One sentence on what the system does and what makes it hard.   # Max 140 characters.

# ─── Optional ──────────────────────────────────────────────────────────
featured: false                   # true = shown under "Start with a classic" on the home page
levels: [Mid, Senior, Staff]      # Levels this question suits. Leave out for all three.
tags: []                          # Free-form keywords for search, e.g. [websockets, crdt]
---

## Opening

<!-- What Alex says to start: one or two deliberately vague sentences that end by inviting the candidate to begin.
     Optional. Leave this section out and Alex writes its own. -->

Let's design <system>. Where would you like to start?

## Hidden spec

<!-- Private notes for Alex. The candidate never sees this section; Alex reveals a detail only when the candidate asks
     the right question. Alex builds its spec from these notes and fills any gap itself, varying the numbers a little
     so repeat sessions aren't identical. Every subsection is optional; the more you give, the more consistent the interview. -->

### Users and core use case
- Who uses it and for what.

### In scope
- Functional requirement 1
- Functional requirement 2

### Out of scope
- Something a candidate might assume, but which isn't part of this problem

### Scale
- Daily active users:
- Peak requests per second (reads / writes):
- Data size and retention:

### Non-functional
- Latency:
- Availability:
- Consistency:

### Crux
<!-- The one or two hard problems this question really tests. Alex steers the deep dive here. -->
- 

### Curveballs
<!-- Changes Alex can throw in once the design is stable: a scale jump, a failure, a new requirement. -->
- 

### Common misses
<!-- What candidates usually forget. Helps Alex probe and grade. -->
- 
