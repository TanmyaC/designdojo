import { askJSON, handle, AppError } from "@/lib/claude";
import { specPrompt } from "@/lib/prompts";
import type { PromptSession, Spec } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: Request) {
  return handle(req, async (b: { session: PromptSession; question: string; customSpec?: string }) => {
    let q = String(b.question || "").slice(0, 2000);
    if (b.customSpec) q += `\n(Interviewer's private notes from the candidate for this custom question: ${String(b.customSpec).slice(0, 4000)})`;
    const spec = await askJSON<Spec>(specPrompt(b.session, q), { effort: "medium", signal: req.signal });
    if (!spec || typeof spec.opening_line !== "string") throw new AppError("invalid_json", "No opening line", 502);
    return Response.json({ spec });
  });
}
