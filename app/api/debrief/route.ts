import { askJSON, handle, AppError } from "@/lib/claude";
import { debriefPrompt } from "@/lib/prompts";
import type { Debrief, PromptSession } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: Request) {
  return handle(req, async (b: { session: PromptSession }) => {
    const d = await askJSON<Debrief>(debriefPrompt(b.session), { effort: "high", maxTokens: 48000, signal: req.signal });
    if (!d || !Array.isArray(d.competencies)) throw new AppError("invalid_json", "No competencies in debrief", 502);
    return Response.json({ debrief: d });
  });
}
