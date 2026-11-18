---
title: Design a metrics and monitoring system
category: Infrastructure
difficulty: Hard
summary: Ingest millions of data points per second, roll them up and alert on them.
levels: [Senior, Staff]
tags: [time-series, aggregation, alerting]
---

## Opening

Let's design a metrics and monitoring system for our services. Where would you like to begin?

## Hidden spec

### Users and core use case
- Engineers instrumenting services, building dashboards and getting paged by alerts.

### In scope
- Ingest metrics from many services
- Query recent and historical data for dashboards
- Alert rules evaluated continuously
- Downsample old data

### Out of scope
- Logs and traces
- Anomaly detection with machine learning

### Scale
- 5M data points per second
- 10M active time series
- Keep raw data 15 days, rollups for 1 year

### Non-functional
- Data queryable within 10 s of being sent
- Dashboards over the last hour load in under 1 s
- Alerting must keep working when the system is under stress

### Crux
- Write path: buffering, partitioning by series, time-series storage and compression
- Rollups and downsampling, and querying across them
- Alert evaluation that is reliable and not blocked by heavy queries

### Curveballs
- A deploy adds a label with user ids and series count jumps 50x
- An outage elsewhere makes every service report errors at once
- Late data arrives 20 minutes after the fact

### Common misses
- High-cardinality labels
- Monitoring the monitoring system
- Cost of raw storage
