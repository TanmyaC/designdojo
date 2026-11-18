---
title: Design a collaborative whiteboard
category: Real-time
difficulty: Hard
summary: Many people edit one board at once and see each other’s changes in under 200 ms.
featured: true
levels: [Senior, Staff]
tags: [websockets, crdt, presence]
focus: [distributed, storage]
---

## Opening

Let's design a collaborative online whiteboard where a whole team can draw together. Where would you like to start?

## Hidden spec

### Users and core use case
- Teams sketching and planning together on an infinite canvas: shapes, sticky notes, connectors, live cursors.

### In scope
- Create and edit objects on a shared board in real time
- See other people's cursors and selections
- Board history: undo your own changes, view recent versions
- Works across web and desktop clients

### Out of scope
- Video or voice calls
- Fine-grained permissions beyond view and edit
- Third-party integrations

### Scale
- 20M daily active users; 1M boards open at peak
- Typical board: 1–10 concurrent editors; large workshops up to 300
- Each active editor sends ~10 ops/s while dragging
- Boards up to 100k objects; median ~2k objects, ~1 MB snapshot

### Non-functional
- Edits visible to others in under 200 ms (p95) within a region
- 99.95% availability for editing
- Every client converges to the same board state; no lost edits

### Crux
- Routing everyone on one board to the same place (sticky connection servers or a pub/sub per board) and fanning out ops
- Conflict resolution: server-ordered ops, OT or CRDT, and why
- Persisting as snapshot + op log, and resyncing a client after reconnect

### Curveballs
- A connection server holding 50 busy boards crashes. What do users see and how do they recover?
- Product wants offline editing on desktop with merge on reconnect
- One board in a 300-person all-hands has 80k objects and lags

### Common misses
- Presence (cursors) sent through the durable op path instead of a lossy channel
- No backpressure for slow clients
- Huge-board loading: no viewport or lazy loading
