import { askJSON, handle, AppError } from "@/lib/claude";
import { cmpPrompt, modelPrompt } from "@/lib/prompts";
import type { PromptSession } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return handle(req, async (b: { session: PromptSession; step: "model" | "cmp" }) => {
    if (b.step === "model") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: d, usage } = await askJSON<any>(modelPrompt(b.session), { effort: "high", maxTokens: 64000, signal: req.signal, meta: { route: "solution", call: "model", sessionId: b.session.id } });
      if (!d || !d.hld || !d.lld) throw new AppError("invalid_json", "Model solution missing hld/lld", 502);
      return Response.json({ result: d, usage });
    }
    if (!b.session.solution?.model) throw new AppError("bad_request", "Model solution must exist before comparing", 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: d, usage } = await askJSON<any>(cmpPrompt(b.session), { effort: "medium", maxTokens: 32000, signal: req.signal, meta: { route: "solution", call: "compare", sessionId: b.session.id } });
    if (!d || !Array.isArray(d.rows)) throw new AppError("invalid_json", "Comparison missing rows", 502);
    return Response.json({ result: d, usage });
  });
}
