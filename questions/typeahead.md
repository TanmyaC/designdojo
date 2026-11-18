---
title: Design typeahead search
category: Feeds
difficulty: Medium
summary: Suggest completions in under 50 ms as people type, ranked by popularity.
tags: [trie, caching, latency]
focus: [storage, scoping]
---

## Opening

Let's design search suggestions that appear as people type. Where would you start?

## Hidden spec

### Users and core use case
- People typing into a search box who expect useful suggestions instantly.

### In scope
- Return the top 10 completions for a prefix
- Rank by popularity, with recent trends showing up
- Support multiple languages

### Out of scope
- Full search results
- Spell correction, unless the candidate asks

### Scale
- 100M daily users, each typing ~20 keystrokes per search, 5 searches a day
- Peak 300k requests/s
- 10M distinct popular queries

### Non-functional
- Under 50 ms end to end p99
- Trending queries appear within an hour
- High availability; slightly stale suggestions are fine

### Crux
- Data structure for prefix lookup (trie with cached top-k, or prefix-to-results tables)
- Building and updating the index from search logs
- Caching at the edge and in clients, and sharding by prefix

### Curveballs
- A breaking news event makes a new query explode in popularity
- A short prefix like 'a' becomes a hot shard
- Product wants personalised suggestions

### Common misses
- Debouncing requests from the client
- Filtering offensive suggestions
- Index update without downtime
