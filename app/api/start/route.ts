import { askJSON, handle, AppError } from "@/lib/claude";
import { specPrompt } from "@/lib/prompts";
import type { PromptSession, Spec } from "@/lib/types";
import { getQuestion } from "@/lib/catalog";

export const maxDuration = 300;

export async function POST(req: Request) {
  return handle(req, async (b: { session: PromptSession; question: string; questionId?: string; customSpec?: string }) => {
    // Catalog questions: title, hidden spec and opening come from questions/<id>.md on the server.
    const cq = getQuestion(b.questionId);
    const q = cq ? cq.title : String(b.question || "").slice(0, 2000);
    const notes = cq ? cq.hiddenSpec : String(b.customSpec || "").slice(0, 4000);
    const spec = await askJSON<Spec>(specPrompt(b.session, q, notes, cq?.opening || ""), { effort: "medium", signal: req.signal });
    if (!spec || typeof spec.opening_line !== "string") throw new AppError("invalid_json", "No opening line", 502);
    return Response.json({ spec });
  });
}
