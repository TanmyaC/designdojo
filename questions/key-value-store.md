---
title: Design a key-value store
category: Storage
difficulty: Hard
summary: Replicated, partitioned storage with tunable consistency.
levels: [Senior, Staff]
tags: [replication, consistent-hashing]
focus: [storage, distributed]
---

## Opening

Let's design a distributed key-value store. Where would you start?

## Hidden spec

### Users and core use case
- Internal services needing a fast, highly available store for small values.

### In scope
- put, get and delete by key
- Data partitioned across many nodes
- Replication with configurable consistency per request
- Add and remove nodes without downtime

### Out of scope
- Secondary indexes and range queries
- Transactions across keys

### Scale
- 10 TB of data, values up to 10 KB
- 500k reads/s and 100k writes/s
- Hundreds of nodes across 3 availability zones

### Non-functional
- Single-digit millisecond p99 for reads
- Survive the loss of a whole availability zone
- Tunable: strong or eventual consistency per request

### Crux
- Partitioning with consistent hashing and rebalancing
- Replication and quorum reads and writes (N, R, W) and what they guarantee
- Conflict handling for concurrent writes: versioning, last-write-wins or vector clocks

### Curveballs
- A network partition splits the cluster in two
- One key gets 50k reads per second
- A node's disk fills up during rebalancing

### Common misses
- Hinted handoff and anti-entropy repair
- What 'strong' means under failures
- Storage engine choice (log-structured vs B-tree)
