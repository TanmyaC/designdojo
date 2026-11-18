---
title: Design a distributed rate limiter
category: Infrastructure
difficulty: Medium
summary: Limit requests per API key across regions without a single point of failure.
featured: true
tags: [redis, token-bucket]
---

## Opening

Let's design a rate limiter for our public API. Where would you start?

## Hidden spec

### Users and core use case
- A public API platform protecting backends from abusive or runaway clients; developers see limits per API key.

### In scope
- Limit requests per API key, with different limits per plan
- Return 429 with a Retry-After header when over the limit
- Limits apply across all API gateway instances
- Change a customer's limit without a deploy

### Out of scope
- DDoS protection at the network layer
- Billing and usage reporting

### Scale
- 50k API gateway instances across 3 regions
- 1M requests/s at peak, all passing through the limiter
- 2M active API keys

### Non-functional
- Adds under 1 ms p99 to each request
- Limits accurate to within ~5% globally
- If the limiter fails, the API must keep serving

### Crux
- Algorithm choice: token bucket vs sliding window counter vs log, and their accuracy and memory trade-offs
- Central store (e.g. Redis with atomic scripts) vs local counters with periodic sync
- Fail-open vs fail-closed, and multi-region accuracy

### Curveballs
- The Redis cluster backing the limiter goes down for five minutes
- One enterprise key sends 40% of all traffic from every region at once
- Product wants burst allowances on top of steady limits

### Common misses
- Race conditions without atomic increments
- Hot keys on a single shard
- Clock skew between regions in window-based algorithms
