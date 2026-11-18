---
title: Design a payment ledger
category: Payments
difficulty: Hard
summary: Move money between accounts exactly once, with an auditable history.
levels: [Senior, Staff]
tags: [idempotency, double-entry]
---

## Opening

Let's design the ledger behind a payments product: moving money between accounts. Where would you like to start?

## Hidden spec

### Users and core use case
- A wallet product: users hold balances, pay each other and top up from cards through an external payment provider.

### In scope
- Transfer money between user accounts
- Top up from a card through an external payment provider
- Show balance and transaction history
- Refunds

### Out of scope
- Currency conversion
- Fraud detection models
- Regulatory reporting

### Scale
- 10M accounts
- Average 2k transfers/s; 20k/s during sales events
- Keep every entry forever

### Non-functional
- Never create or lose money: debits equal credits
- Exactly-once effect for every transfer, even with retries
- Balance reads in under 100 ms; transfers in under 1 s p99

### Crux
- Double-entry ledger design and how balances are derived or maintained
- Idempotency keys and exactly-once effects across retries and crashes
- Consistency with the external provider: outbox or saga, and reconciliation

### Curveballs
- The provider times out but may have charged the card
- A hot merchant account receives 5k payments per second
- Auditors ask for the balance of every account as of last midnight

### Common misses
- Retries creating duplicate transfers
- Reconciliation with the provider's records
- Concurrency on the same account balance
