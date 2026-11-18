import { askJSON, handle, AppError } from "@/lib/claude";
import { debriefPrompt } from "@/lib/prompts";
import type { PromptSession } from "@/lib/types";
import { normalizeDebrief } from "@/lib/normalize";

export const maxDuration = 300;

export async function POST(req: Request) {
  return handle(req, async (b: { session: PromptSession }) => {
    const raw = await askJSON<unknown>(debriefPrompt(b.session), { effort: "high", maxTokens: 64000, signal: req.signal });
    const d = normalizeDebrief(raw);
    if (!d || !d.competencies?.length) throw new AppError("invalid_json", "No competencies in debrief", 502, JSON.stringify(raw).slice(0, 4000));
    return Response.json({ debrief: d });
  });
}
