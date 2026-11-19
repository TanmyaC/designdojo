import { handle, streamText, AppError } from "@/lib/claude";
import { CACHED_LAYOUT, deepPrompt, deepRequest, followPrompt, followRequest } from "@/lib/prompts";
import type { PromptSession } from "@/lib/types";

export const maxDuration = 300;

/* Streams Markdown from Sam, the solution architect: section deep dives and follow-up questions. */
export async function POST(req: Request) {
  return handle(req, async (b: { session: PromptSession; kind: "deep" | "follow"; title?: string; extra?: string; message?: string }) => {
    if (!b.session.solution?.model) throw new AppError("bad_request", "No model solution yet", 400);
    const deep = b.kind === "deep", title = String(b.title || ""), message = String(b.message || "");
    const prompt = CACHED_LAYOUT
      ? (deep ? deepRequest(b.session, title, b.extra) : followRequest(b.session, message))
      : (deep ? deepPrompt(b.session, title, b.extra) : followPrompt(b.session, message));
    const meta = { route: "sam", call: deep ? "deep" : "follow", sessionId: b.session.id, turnIndex: (b.session.followups || []).length };
    return new Response(streamText(prompt, { effort: "medium", signal: req.signal, meta }), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  });
}
