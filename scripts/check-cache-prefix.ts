/* Checks that the cached prompt layouts stay cacheable, with no API calls.

   For each route it builds turn N and turn N+1 of the same conversation and checks that
   everything up to turn N's last cache breakpoint is byte-for-byte the start of turn N+1.
   If a change puts something that varies per turn into the cached part, this fails.

   Run: npm run check:cache */
import { deepRequest, followRequest, turnRequest } from "../lib/prompts";
import type { ClaudeRequest } from "../lib/claude";
import type { PromptSession } from "../lib/types";

type Block = { type: string; cache_control?: { ttl?: string } | null; [k: string]: unknown };

/* The request in the order the API reads it, one entry per content block. */
function flatten(r: ClaudeRequest): { where: string; block: Block }[] {
  const out: { where: string; block: Block }[] = [];
  (r.system || []).forEach((b, i) => out.push({ where: `system[${i}]`, block: b as unknown as Block }));
  r.messages.forEach((m, i) => {
    const content = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    (content as unknown as Block[]).forEach((b, j) => out.push({ where: `messages[${i}](${m.role})[${j}]`, block: b }));
  });
  return out;
}

/* Block bytes without the marker: moving a breakpoint does not change the cached content. */
const bytes = (b: Block) => { const { cache_control: _c, ...rest } = b; void _c; return JSON.stringify(rest); };

let failed = 0;
function check(name: string, a: ClaudeRequest, b: ClaudeRequest) {
  const fa = flatten(a), fb = flatten(b);
  const problems: string[] = [];
  for (const [label, f] of [["N", fa], ["N+1", fb]] as const) {
    const marks = f.filter((x) => x.block.cache_control);
    if (marks.length > 4) problems.push(`turn ${label} has ${marks.length} breakpoints (max 4)`);
    const firstShort = marks.findIndex((x) => x.block.cache_control?.ttl !== "1h");
    if (firstShort >= 0 && marks.slice(firstShort).some((x) => x.block.cache_control?.ttl === "1h"))
      problems.push(`turn ${label}: a 1h breakpoint comes after a 5m one`);
  }
  // Role boundaries matter too, so compare message index and role, not only block bytes.
  const key = (x: { where: string; block: Block }) => x.where.replace(/\[\d+\]$/, "") + "|" + bytes(x.block);
  const lastMark = fa.map((x) => !!x.block.cache_control).lastIndexOf(true);
  if (lastMark < 0) problems.push("turn N has no breakpoint");
  for (let i = 0; i <= lastMark; i++) {
    if (!fb[i] || key(fa[i]) !== key(fb[i])) { problems.push(`prefix differs at ${fa[i].where}; everything from here is re-written instead of read`); break; }
  }
  if (problems.length) { failed++; console.log(`FAIL ${name}\n  - ${problems.join("\n  - ")}`); }
  else console.log(`ok   ${name}: ${lastMark + 1} blocks reusable, ${fa.filter((x) => x.block.cache_control).length} breakpoints`);
}

/* A sample session. Object keys are built in a different order for turn N+1 to show the
   spec is serialised the same way whatever order its keys arrive in. */
const spec = { question: "Design a URL shortener", scale: { dau: "10M", peak_qps: "20k" }, crux: ["hot keys"], opening_line: "Let's design a URL shortener." };
const specReordered = { opening_line: spec.opening_line, crux: spec.crux, scale: { peak_qps: "20k", dau: "10M" }, question: spec.question };
const base: PromptSession = {
  id: "1700000000000", question: "Design a URL shortener", level: "Senior", duration: 45,
  spec, facts: ["Links never expire"], probed: { scoping: true }, phase: "scoping", hints: 0, elapsedMin: 6,
  transcript: [
    { who: "alex", text: "Let's design a URL shortener. Where would you like to start?" },
    { who: "me", text: "Who uses it, and how many links a day?" },
    { who: "alex", text: "About 100 million new links a day." },
  ],
  historyBrief: "- none", style: "Neutral", rubric: "default", board: "", estimates: "",
  solution: { model: { summary: "Key-value store with a counter-based id service", hld: {}, lld: {} }, cmp: null },
  followups: [{ who: "me", text: "Quiz me" }, { who: "sam", text: "Question 1: what's your read/write ratio?" }],
};
const next: PromptSession = {
  ...base, spec: specReordered, facts: [...base.facts, "Reads outnumber writes 100:1"], probed: { scoping: true, storage: true },
  phase: "high_level", hints: 1, elapsedMin: 9, board: "[n1] box: API", estimates: "100M/day ≈ 1.2k writes/s",
  transcript: [...base.transcript,
    { who: "me", text: "Then writes are about 1.2k a second." },
    { who: "event", text: "Moved to high-level design · 08:40" },
    { who: "alex", text: "Good. What does the write path look like?" }],
  followups: [...base.followups, { who: "me", text: "100:1" }, { who: "sam", text: "Right. Question 2: …" }],
};

check("turn", turnRequest(base, "Writes are about 1.2k a second."), turnRequest(next, "I'd put a cache in front.", { media_type: "image/png", data: "iVBORw0KGgo=" }));
// Sam runs after the interview, when facts and spec no longer change; only the chat grows.
const later: PromptSession = { ...base, spec: specReordered, followups: next.followups };
check("sam deep", deepRequest(base, "Storage"), deepRequest(later, "Id generation"));
check("sam follow", followRequest(base, "100:1"), followRequest(later, "Next question"));

if (failed) { console.log(`\n${failed} layout check(s) failed.`); process.exit(1); }
console.log("\nAll cached layouts keep a stable prefix.");
