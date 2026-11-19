import { askJSON, handle, AppError } from "@/lib/claude";
import { specPrompt } from "@/lib/prompts";
import type { PromptSession, Spec } from "@/lib/types";
import { getQuestion, pickQuestion } from "@/lib/catalog";

export const maxDuration = 300;

export async function POST(req: Request) {
  return handle(req, async (b: { session: PromptSession; question: string; questionId?: string; customSpec?: string; pick?: { weakest?: string | null; recent?: string[] } }) => {
    // Catalog questions: title, hidden spec and opening come from questions/<id>.md on the server.
    // "Let Alex choose" (no question and no id) picks one from the catalog for this candidate.
    const auto = !b.questionId && !String(b.question || "").trim();
    const cq = auto
      ? pickQuestion(String(b.session.level), b.pick?.weakest || null, Array.isArray(b.pick?.recent) ? b.pick.recent.map(String) : [])
      : getQuestion(b.questionId);
    const q = cq ? cq.title : String(b.question || "").slice(0, 2000);
    const notes = cq ? cq.hiddenSpec : String(b.customSpec || "").slice(0, 4000);
    const { data: spec, usage } = await askJSON<Spec>(specPrompt(b.session, q, notes, cq?.opening || ""), { effort: "medium", signal: req.signal, meta: { route: "start", sessionId: b.session.id } });
    if (!spec || typeof spec.opening_line !== "string") throw new AppError("invalid_json", "No opening line", 502);
    return Response.json({ spec, question: cq?.title, questionId: cq?.id, usage });
  });
}
