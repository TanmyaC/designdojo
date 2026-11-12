import { handle, streamText, AppError } from "@/lib/claude";
import { deepPrompt, followPrompt } from "@/lib/prompts";
import type { PromptSession } from "@/lib/types";

export const maxDuration = 300;

/* Streams Markdown from Sam, the solution architect: section deep dives and follow-up questions. */
export async function POST(req: Request) {
  return handle(req, async (b: { session: PromptSession; kind: "deep" | "follow"; title?: string; extra?: string; message?: string }) => {
    if (!b.session.solution?.model) throw new AppError("bad_request", "No model solution yet", 400);
    const prompt = b.kind === "deep" ? deepPrompt(b.session, String(b.title || ""), b.extra) : followPrompt(b.session, String(b.message || ""));
    return new Response(streamText(prompt, { effort: "medium", signal: req.signal }), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  });
}
