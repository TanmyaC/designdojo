// Prompt builders ported from the original POC (interview-room.html).
// The prompt text lives in prompt-text.json, copied verbatim from the POC.
import "server-only";
import P from "./prompt-text.json";
import type { PromptSession as Sess } from "./types";
import { COMP } from "./constants";

export const APP_NOTE = `APP CONTEXT: You are running inside a practice web app, not a chat with slash commands. The candidate uses buttons: "Ask for a hint" and "End interview". The app shows a timer, so the candidate does not send /time; you are told the elapsed minutes on every turn. The rubric and competencies are included below; ignore any mention of Project knowledge files. The candidate often dictates their answers using their device's dictation, so messages may contain transcription errors (e.g. 'cash' for cache, 'Cassandra' misspelt, missing punctuation) and spoken filler. Interpret them charitably by technical context, never penalise transcription errors, and judge the substance. Keep your replies conversational and avoid tables or long lists during the interview. The candidate also has a shared whiteboard; when a message includes a BOARD section, that is the current state of their diagram (boxes, databases, queues, notes and labelled arrows), and you can see it the way an interviewer sees a shared screen.`;

const STYLE: Record<string,string> = {
  Supportive: "INTERVIEWER STYLE: Supportive. Be warm and patient. If the candidate stalls for more than one turn, offer a small nudge as a question without being asked. This is good for first runs; still never give away the design.",
  Neutral: "INTERVIEWER STYLE: Neutral. Answer what is asked and nudge on time, as a typical interviewer would.",
  Tough: "INTERVIEWER STYLE: Tough. Interrupt hand-waving, challenge every number and every component choice, and push one level deeper than usual. Stay professional, never rude.",
};
const RUBRIC: Record<string,string> = {
  default: "",
  bigtech: "RUBRIC FLAVOUR: Big-tech loop. Hold the bar of a large-company loop: expect scale numbers, explicit trade-offs, multi-region thinking and operational maturity at the stated level.",
  startup: "RUBRIC FLAVOUR: Startup generalist. Reward pragmatic, simple designs that ship fast and evolve; penalise over-engineering more heavily than missing hyperscale features.",
};
function extras(s: Sess): string {
  const out=[STYLE[s.style||"Neutral"]||"", RUBRIC[s.rubric||"default"]||""].filter(Boolean);
  return out.length?"\n\n"+out.join("\n"):"";
}
function boardBlock(s: Sess): string {
  const b=(s.board||"").trim(), e=(s.estimates||"").trim();
  let o="";
  if(b) o+=`\n\nBOARD (the candidate's whiteboard right now; ids in square brackets):\n${b}`;
  if(e) o+=`\n\nCANDIDATE'S ESTIMATES NOTE:\n${e}`;
  return o;
}
function transcriptText(s: Sess): string {
  return s.transcript.map(t=> t.who==="alex"?`Alex (interviewer): ${t.text}` : t.who==="me"?`Candidate: ${t.text}` : `[${t.text}]`).join("\n\n");
}
export function specPrompt(s: Sess, question: string): string {
  return `${P.iv_intro}\n\n${APP_NOTE}${extras(s)}\n\n${P.iv_phases}\n\n${P.patterns}\n\nTASK: The interview is starting. Do the SETUP step only.
Question given by the candidate: ${question?JSON.stringify(question):"(none — pick one from the Pattern Library, prioritising archetypes and weaknesses the history shows they haven't practised)"}
Candidate level: ${s.level}. Interview length: ${s.duration} minutes.
Candidate history (most recent first):\n${s.historyBrief}

Reply with ONLY a JSON object, no other text:
{"question":"the interview question in one line","archetypes":["C"],"real_problem":"...","users":"...",
"functional_in_scope":["..."],"functional_out_of_scope":["..."],
"scale":{"dau":"...","peak_qps":"...","read_write_ratio":"...","data_size":"...","retention":"...","other":"..."},
"non_functional":{"latency":"...","availability":"...","consistency":"..."},
"crux":["..."],"curveballs":["..."],"target_weakness":"which past weakness this session targets, or empty",
"opening_line":"Alex's vague 1–2 sentence opening, ending with an invitation to start"}`;
}
export function turnPrompt(s: Sess, msg: string, hasImage: boolean): string {
  const probed=COMP.filter(c=>s.probed[c.key]).map(c=>c.name);
  return `${P.iv_intro}\n\n${APP_NOTE}\n\n${P.iv_rules}\n\n${P.iv_phases}\n\n${P.rubric}\n\n${P.edge}${extras(s)}

HIDDEN SPEC (private — never reveal or hint at it directly):\n${JSON.stringify(s.spec)}
CANON FACTS you have already stated (stay consistent with these):\n${s.facts.length?s.facts.map(f=>"- "+f).join("\n"):"- none yet"}
Candidate level: ${s.level}. Elapsed: ${s.elapsedMin.toFixed(0)} of ${s.duration} minutes. Hints used: ${s.hints}. Current phase: ${s.phase}.
Competencies probed so far: ${probed.length?probed.join(", "):"none"} (make sure all four get probed before the end).

TRANSCRIPT SO FAR:\n${transcriptText(s)}

NEW INPUT FROM THE CANDIDATE:\n${msg}${boardBlock(s)}${hasImage?"\n\n(The candidate attached an image of their diagram with this message. Read it carefully and probe vague or unlabelled parts.)":""}

Respond as Alex with your next interviewer turn. Reply with ONLY a JSON object:
{"reply":"your message to the candidate (short, in character, light markdown allowed)",
"new_facts":["any NEW facts about the problem you stated in this reply (requirements, numbers, constraints); empty array if none"],
"probed":["competency keys this reply probes: storage | distributed | observability | scoping"],
"phase":"scoping | high_level | deep_dive | wrap_up",
"diagram_notes":"if an image was attached: a factual description of what the diagram shows; otherwise empty string",
"board_comment":{"node_id":"id of ONE board element your question is about, only if a BOARD was included and pinning a short comment to it helps; otherwise empty string","text":"the comment, max 15 words, or empty string"}}`;
}
export function debriefPrompt(s: Sess): string {
  return `${P.iv_intro}\n\n${APP_NOTE}\n\n${P.rubric}\n\n${P.debrief}${extras(s)}${s.quoteEvidence===false?"":"\nEVIDENCE: for every green and red flag, quote the candidate's own words verbatim (short quotes) as the evidence."}

The candidate has ended the interview. Step out of character and produce the DEBRIEF, following the rubric strictly and citing evidence from the transcript. Be honest; an inflated debrief is useless.
Candidate level: ${s.level}. Planned length: ${s.duration} min. Actual: ${s.elapsedMin.toFixed(0)} min. Hints used: ${s.hints}.
HIDDEN SPEC:\n${JSON.stringify(s.spec)}
CANON FACTS:\n${s.facts.map(f=>"- "+f).join("\n")||"- none"}
TRANSCRIPT:\n${transcriptText(s)}${boardBlock(s)}

Reply with ONLY a JSON object:
{"verdict":"Strong Hire | Hire | Lean Hire | Lean No Hire | No Hire","verdict_reason":"2–3 sentences",
"spec_reveal":{"real_problem":"...","scale":"...","crux":"...","how_close":"how close the candidate's scoping got"},
"competencies":[{"key":"storage","name":"Storage","rating":3,"green":[{"flag":"...","evidence":"what they said"}],"red":[{"flag":"...","evidence":"..."}],"strong_would_add":"..."}, ... one entry for each of storage, distributed, observability, scoping; rating 1-4 or null for N/A with the reason in strong_would_add],
"missed":{"critical":["..."],"nice_to_have":["..."]},
"moments":[{"type":"good | bad","text":"..."}],
"time_management":"how time split across phases vs the ideal budget",
"top3":["...","...","..."],
"session_log":{"summary":"one sentence","recurring_gaps":["short gap labels, e.g. 'no SLOs', 'storage estimate off by 1000x'"]}}`;
}
const SLIM_RULES = `OUTPUT RULES FOR THIS APP (these override any earlier format or visual instructions):
- SLIM. The page shows the high-level design first, then the low-level design. Every section has a "Deep dive" button, so give only the essential answer here. No preamble, no repetition, no textbook background.
- STAY WITHIN THE FOUR MIRO COMPETENCIES: Storage; Distributed systems & scalability; Observability & reliability; Problem scoping, collaboration & feedback. Leave out security, auth, cost, CI/CD, team process, compliance and UI unless the agreed scope makes them central to the problem.
- Every text field is at most 25 words unless stated. Prefer numbers to adjectives. Name a technology only with the one property you rely on (e.g. "Kafka: ordered per partition, keyed by board_id").
- DIAGRAMS ARE DATA, NOT CODE. Never write Mermaid or any diagram source. The app draws diagrams from the JSON fields you return.
- Reply with ONLY the JSON object requested, no other text.`;
const SA_BASE = (): string =>`${P.sa_intro}\n\n${P.sa_principles}\n\n${SLIM_RULES}`;
function scopeBlock(s: Sess): string {
  return `QUESTION: ${s.question}\nLEVEL: ${s.level}\nAGREED SCOPE (hidden spec revealed in the debrief):\n${JSON.stringify(s.spec,null,1)}\nCLARIFICATIONS AND FACTS STATED IN THE INTERVIEW (canon):\n${s.facts.map(f=>"- "+f).join("\n")||"- none"}`;
}
export function modelPrompt(s: Sess): string {
  return `${SA_BASE()}

PIPELINE STEP 1 of 2 — INDEPENDENT DESIGN. You are deliberately NOT shown the candidate's design, so that you design from the agreed scope alone. Give the crux the most care, and answer every curveball in the scope inside the relevant section.

${scopeBlock(s)}

Return this JSON (respect the maximum counts; fewer is fine):
{
 "summary": "2-3 sentences: the core approach and how it handles the crux",
 "hld": {
  "requirements": {"functional": ["max 5"], "non_functional": ["max 4, with targets"], "out_of_scope": ["max 3"]},
  "estimates": [{"metric": "e.g. Peak write QPS", "value": "~12k/s", "math": "100M DAU x 10 / 86,400 x 1.5"}],   // max 6, show arithmetic
  "architecture": {
    "layers": [{"name": "Clients", "nodes": [{"id": "web", "label": "Web & mobile", "kind": "client"}]}],
    // 3-5 layers left to right (e.g. Clients, Edge, Services, Async, Data); max 5 nodes per layer; labels max 4 words
    // kind is one of: client, edge, service, queue, cache, store, external
    "edges": [{"from": "web", "to": "lb", "label": "HTTPS"}]   // max 14, label max 2 short words, ids must exist
    // order layers and nodes so most edges connect ADJACENT layers; avoid edges that skip a layer (put async/queue layers after the stores they read from, or beside the services that use them)
  },
  "components": [{"name": "Review service", "role": "max 15 words, stateless/stateful"}],   // max 7
  "apis": [{"signature": "POST /items/{id}/reviews", "note": "max 12 words, e.g. idempotency key"}]   // max 5
 },
 "lld": {
  "storage": {"choice": "store(s) chosen", "why": "access patterns + consistency", "rejected": "alternative and why not",
     "entities": [{"name": "reviews", "key": "PK / partition key", "fields": "key fields with sizes", "note": "max 15 words"}],   // max 4
     "points": ["replication, consistency per read path, caching + invalidation, hot keys; max 5"]},
  "flow": {"title": "the most important flow, e.g. Submit a review", "actors": ["Client", "API", "DB"],   // max 6 actors
     "steps": [{"from": "Client", "to": "API", "label": "POST review (idempotency key)", "kind": "sync"}],   // 6-12 steps; kind: sync | async | reply | fail
     "notes": ["concurrency, ordering, idempotency; max 3"]},
  "scaling": [{"risk": "single point of failure or 10x bottleneck", "mitigation": "max 20 words"}],   // max 5
  "observability": {"slos": ["max 3"], "alerts": ["what pages someone, max 3"], "signals": ["leading indicators, technical and user metrics, max 4"]},
  "tradeoffs": [{"decision": "", "gain": "", "cost": ""}]   // max 4
 },
 "requirements_coverage": [{"requirement": "copied exactly from hld.requirements", "type": "functional | non_functional",
    "how": "max 30 words: the specific mechanism in THIS design that satisfies it, with numbers for non-functional targets (e.g. 'Redis serves aggregates: ~1 ms reads keep p99 under 150 ms at 35k QPS')",
    "where": "the section that delivers it: architecture | apis | storage | flow | scaling | observability",
    "status": "met | partially met", "caveat": "only if partially met: what is not fully covered and why, max 20 words"}],
    // EXACTLY one entry for every functional and every non_functional requirement listed above, in the same order. Be honest: use "partially met" when the design has a real gap.
 "deep_dive_topics": ["5-6 specific topics worth a deep dive for this question"]
}`;
}
export function cmpPrompt(s: Sess): string {
  return `${SA_BASE()}

PIPELINE STEP 2 of 2 — COMPARE. The model solution is finished (below). Now read the interview and compare the candidate's design against it. Be strict and specific: quote or paraphrase what the candidate actually said.

${scopeBlock(s)}

MODEL SOLUTION (JSON):
${JSON.stringify(s.solution?.model)}

INTERVIEW TRANSCRIPT:
${transcriptText(s)}${boardBlock(s)}

DEBRIEF (from the interviewer):
${JSON.stringify(s.debrief)}

Return this JSON:
{
 "overall": "2 sentences: was the candidate's overall direction right, and the single most important change",
 "rows": [{"area": "e.g. Storage choice", "yours": "max 15 words", "model": "max 15 words", "verdict": "MATCHES | ALSO VALID | FLAWED | WRONG", "why": "max 25 words"}],   // 4-8 rows, the decisions that matter most
 "missed": [{"competency": "storage | distributed | observability | scoping", "item": "max 15 words", "severity": "critical | important | nice",
             "why": "max 25 words, specific to this question", "say": "one sentence to say next time", "prompted": false}],   // max 10; prompted=true if they only covered it after Alex prompted
 "open_challenges": [{"challenge": "a probe or curveball they did not resolve", "answer": "max 50 words"}]   // max 4
}`;
}
export function deepPrompt(s: Sess, title: string, extra?: string): string {
  return `${SA_BASE().replace("- Reply with ONLY the JSON object requested, no other text.","")}

The candidate wants a DEEP DIVE into one part of the model solution.
${scopeBlock(s)}

MODEL SOLUTION (JSON):
${JSON.stringify(s.solution?.model)}

DEEP DIVE TOPIC: ${title}${extra?"\n"+extra:""}

Write at most 350 words of Markdown at Staff-level depth: the mechanics, the numbers, the failure modes, and one or two sentences on how to say this in the interview. Short paragraphs or bullets; a small table only if it truly helps. No diagrams or diagram code. Stay within the four competencies.`;
}
export function followPrompt(s: Sess, msg: string): string {
  const hist=s.followups.map(f=>(f.who==="me"?"Candidate: ":"Sam: ")+f.text).join("\n\n");
  return `${SA_BASE().replace("- Reply with ONLY the JSON object requested, no other text.","")}

You support: deep dives into one topic; a spoken 45-minute rehearsal script with timeboxes and check-in lines; a side-by-side comparison TABLE of the candidate's final design and the model; an 8-question quiz (ask the questions, then grade the answers when the candidate replies).

${scopeBlock(s)}

MODEL SOLUTION (JSON):
${JSON.stringify(s.solution?.model)}

COMPARISON WITH THE CANDIDATE (JSON):
${JSON.stringify(s.solution?.cmp)}

DEBRIEF:
${JSON.stringify(s.debrief)}

INTERVIEW TRANSCRIPT (for reference):
${transcriptText(s).slice(-60000)}

CONVERSATION WITH SAM SO FAR:
${hist||"(none)"}

NEW REQUEST FROM THE CANDIDATE:
${msg}

Answer as Sam in concise Markdown (at most 400 words unless the request needs more, such as a full rehearsal script). No diagrams or diagram code.`;
}


