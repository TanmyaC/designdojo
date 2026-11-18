---
title: Design a notification system
category: Infrastructure
difficulty: Medium
summary: Send push, email and SMS at scale with user preferences and retries.
tags: [queues, retries, push]
focus: [observability, distributed]
---

## Opening

Let's design a system that sends notifications to our users. Where would you like to start?

## Hidden spec

### Users and core use case
- Product teams trigger notifications; users receive push, email and SMS and control what they get.

### In scope
- Send push, email and SMS through external providers
- Respect user preferences and quiet hours
- Retry failed sends
- Track delivery status

### Out of scope
- Writing notification content or templates
- Marketing campaign tools

### Scale
- 500M notifications per day, peaks of 50k/s
- Providers have their own rate limits
- 200M users with preferences

### Non-functional
- Time-sensitive notifications delivered in under 10 s
- No duplicates for the same event
- Losing a notification is worse than a delay

### Crux
- Queue per channel with retries, backoff and dead-lettering
- Deduplication and idempotency across retries
- Respecting provider rate limits and failing over between providers

### Curveballs
- The SMS provider is down for an hour
- A bug triggers 10M notifications to the same user segment
- Product wants a daily digest instead of instant sends

### Common misses
- Preference checks at send time, not only at enqueue
- Throttling per user
- Delivery tracking and analytics
