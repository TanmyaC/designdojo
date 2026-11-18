---
title: Design presence and live cursors
category: Real-time
difficulty: Medium
summary: Show who is online and where their cursor is on boards with hundreds of viewers.
tags: [websockets, pub-sub]
focus: [distributed, scoping]
---

## Opening

Let's design the presence feature for a collaborative app: who's here and where their cursor is. Where would you like to start?

## Hidden spec

### Users and core use case
- People in a shared document or board who want to see who else is there and what they're pointing at.

### In scope
- Show who is currently viewing a board
- Show live cursor positions of others
- Show idle and away status

### Out of scope
- Persisting cursor history
- The editing protocol itself

### Scale
- 5M concurrent users across 1M open boards
- Cursors update up to 20 times per second per user
- Some boards have 300 viewers at once

### Non-functional
- Cursor movements visible in under 100 ms
- Losing some cursor updates is fine; showing someone online after they left is not
- Must not overload clients on busy boards

### Crux
- Ephemeral, lossy channel separate from durable edits
- Fan-out per board and throttling or batching cursor updates
- Detecting disconnects with heartbeats and timeouts

### Curveballs
- A 300-person workshop: everyone moves their cursor at once
- A presence server restarts
- Mobile clients go to the background without closing the connection

### Common misses
- Throttling on both sender and receiver
- Stale presence after abrupt disconnects
- Bandwidth math for large boards
