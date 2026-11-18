---
title: Design a ticket booking system
category: Payments
difficulty: Hard
summary: Sell seats for a hot concert on-sale without double-booking anyone.
tags: [reservations, flash-sale]
focus: [storage, scoping]
---

## Opening

Let's design a ticketing system for concerts. Where would you start?

## Hidden spec

### Users and core use case
- Fans buying seats for concerts; demand spikes massively when popular shows go on sale.

### In scope
- Browse events and see seat availability
- Hold seats while the buyer pays
- Complete purchase through a payment provider
- Release held seats if payment doesn't complete

### Out of scope
- Resale marketplace
- Dynamic pricing

### Scale
- Normal days: ~100 purchases/s
- Hot on-sale: 2M people arrive in the first minute for 50k seats
- 10k events listed

### Non-functional
- A seat is never sold twice
- Holds expire reliably
- The site stays up during the rush, even if people wait

### Crux
- Seat reservation with holds and TTL, and the locking strategy (optimistic vs pessimistic)
- Handling the on-sale spike: virtual waiting room, admission control
- Payment and booking consistency

### Curveballs
- Payment provider slows to 10 s per transaction during the rush
- Bots grab most holds in the first seconds
- A venue changes its seat map an hour before the on-sale

### Common misses
- Hold expiry races with payment completion
- Availability display that lies under load
- Fairness in the queue
