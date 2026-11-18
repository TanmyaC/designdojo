---
title: Design a news feed
category: Feeds
difficulty: Medium
summary: Rank and serve a personalised feed to hundreds of millions of daily users.
featured: true
tags: [fan-out, ranking]
---

## Opening

Let's design the home feed for a social network. Where would you like to begin?

## Hidden spec

### Users and core use case
- People scrolling a home feed of posts from accounts they follow, ranked by relevance.

### In scope
- Users post text and images
- Home feed shows posts from followed accounts, ranked
- Infinite scroll with stable pagination
- New posts appear within a minute

### Out of scope
- Ads
- Direct messages
- Content moderation pipeline

### Scale
- 300M daily active users; each opens the feed ~10 times a day
- Users follow ~200 accounts on average; some accounts have 50M followers
- ~50M new posts per day

### Non-functional
- Feed loads in under 300 ms p95
- Eventual consistency is fine; a minute of delay is acceptable
- 99.9% availability

### Crux
- Fan-out on write vs on read vs hybrid, and the celebrity problem
- Feed storage per user (precomputed timelines) and cache sizing
- Ranking stage: candidate generation, then scoring, within the latency budget

### Curveballs
- A celebrity with 80M followers posts during a live event
- The timeline cache cluster loses a third of its nodes
- Product wants posts from accounts you don't follow mixed in

### Common misses
- Pagination that skips or repeats posts as the feed changes
- Deleting a post that is already fanned out
- Storage math for precomputed timelines
