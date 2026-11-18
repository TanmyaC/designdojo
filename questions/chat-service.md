---
title: Design a chat service
category: Real-time
difficulty: Medium
summary: One-to-one and group messages with delivery receipts and offline sync.
tags: [websockets, delivery-receipts]
---

## Opening

Let's design a chat app with one-to-one and group conversations. Where would you start?

## Hidden spec

### Users and core use case
- People messaging friends and groups from phones and the web, often on flaky mobile networks.

### In scope
- One-to-one and group chats (up to 500 members)
- Sent, delivered and read receipts
- Messages sync across a user's devices
- Offline users get messages when they reconnect

### Out of scope
- Voice and video
- End-to-end encryption details, unless asked

### Scale
- 100M daily active users
- ~50 messages per user per day; peaks at 3x average
- 20M concurrent connections at peak

### Non-functional
- Delivery to online recipients in under 500 ms p95
- Messages are never lost and arrive in order within a chat
- 99.99% availability for sending

### Crux
- Connection management and routing a message to the recipient's connection server
- Per-chat ordering and idempotent delivery with client message ids
- Storage model for chat history and sync cursors per device

### Curveballs
- A connection server with 200k users crashes
- A 500-person group where everyone replies at once
- A user comes back online after two weeks with 40k unread messages

### Common misses
- Duplicate messages on client retries
- Fan-out cost for large groups
- Push notifications for offline users
