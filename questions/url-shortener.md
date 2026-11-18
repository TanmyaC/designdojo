---
title: Design a URL shortener
category: Storage
difficulty: Easy
summary: Create short links, redirect fast, and count clicks at very high read volume.
tags: [id-generation, caching]
---

## Opening

Let's design a URL shortener, something like bit.ly. Where would you like to start?

## Hidden spec

### Users and core use case
- Anyone shortening links to share; signed-in users pick custom aliases and see click counts.

### In scope
- Create a short link for a long URL
- Optional custom alias for signed-in users
- Redirect quickly
- Daily click counts per link

### Out of scope
- Link expiry (links live until deleted)
- Detailed analytics beyond daily counts
- Spam detection, unless the candidate asks

### Scale
- 100M new links per day
- Reads to writes 100:1
- Keep links for 10 years

### Non-functional
- Redirect in under 50 ms p99
- 99.99% availability for redirects
- A short code must never point to two URLs

### Crux
- Unique ID generation: counter ranges, hashing with collision checks, or a pre-generated key pool
- Caching hot links and the 301 vs 302 trade-off with analytics
- Storage sizing and key length

### Curveballs
- The ID allocator is down for ten minutes
- One link goes viral at 500k redirects/s
- Product wants per-link analytics by country

### Common misses
- Collision handling
- Storage math over 10 years
- Abuse and rate limiting on link creation
