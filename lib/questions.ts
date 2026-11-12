export interface LibraryQuestion { id: string; title: string; cat: string; diff: "Easy" | "Medium" | "Hard"; desc: string }

export const LIBRARY: LibraryQuestion[] = [
  { id: "wb", title: "Design a collaborative whiteboard", cat: "Real-time", diff: "Hard", desc: "Many people edit one board at once and see each other’s changes in under 200 ms." },
  { id: "rl", title: "Design a distributed rate limiter", cat: "Infrastructure", diff: "Medium", desc: "Limit requests per API key across regions without a single point of failure." },
  { id: "nf", title: "Design a news feed", cat: "Feeds", diff: "Medium", desc: "Rank and serve a personalised feed to hundreds of millions of daily users." },
  { id: "url", title: "Design a URL shortener", cat: "Storage", diff: "Easy", desc: "Create short links, redirect fast, and count clicks at very high read volume." },
  { id: "chat", title: "Design a chat service", cat: "Real-time", diff: "Medium", desc: "One-to-one and group messages with delivery receipts and offline sync." },
  { id: "pay", title: "Design a payment ledger", cat: "Payments", diff: "Hard", desc: "Move money between accounts exactly once, with an auditable history." },
  { id: "kv", title: "Design a key-value store", cat: "Storage", diff: "Hard", desc: "Replicated, partitioned storage with tunable consistency." },
  { id: "notif", title: "Design a notification system", cat: "Infrastructure", diff: "Medium", desc: "Send push, email and SMS at scale with user preferences and retries." },
  { id: "ticket", title: "Design a ticket booking system", cat: "Payments", diff: "Hard", desc: "Sell seats for a hot concert on-sale without double-booking anyone." },
  { id: "metrics", title: "Design a metrics and monitoring system", cat: "Infrastructure", diff: "Hard", desc: "Ingest millions of data points per second, roll them up and alert on them." },
  { id: "typeahead", title: "Design typeahead search", cat: "Feeds", diff: "Medium", desc: "Suggest completions in under 50 ms as people type, ranked by popularity." },
  { id: "presence", title: "Design presence and live cursors", cat: "Real-time", diff: "Medium", desc: "Show who is online and where their cursor is on boards with hundreds of viewers." },
];

export const CATEGORIES = ["All", "Storage", "Real-time", "Feeds", "Infrastructure", "Payments"];
export const TOPICS = ["Storage", "Real-time", "Feeds", "Infrastructure", "Payments", "Other"];
