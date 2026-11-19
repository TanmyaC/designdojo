import { askJSON, handle, AppError, type ImageInput } from "@/lib/claude";
import { CACHED_LAYOUT, turnPrompt, turnRequest } from "@/lib/prompts";
import type { PromptSession } from "@/lib/types";
import { list, txt } from "@/lib/normalize";

export const maxDuration = 300;

interface TurnReply { reply: string; new_facts?: string[]; probed?: string[]; phase?: string; diagram_notes?: string; board_comment?: { node_id?: string; text?: string } }

/* If the reply wasn't clean JSON, try to recover the "reply" string. */
function salvage(raw?: string): TurnReply | null {
  if (!raw) return null;
  const m = raw.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (m) { try { return { reply: JSON.parse('"' + m[1] + '"') }; } catch { /* fall through */ } }
  const s = raw.trim();
  if (s && !/^[\[{`]/.test(s)) return { reply: s };
  return null;
}

export async function POST(req: Request) {
  return handle(req, async (b: { session: PromptSession; message: string; image?: ImageInput }) => {
    const image = b.image && /^image\/(png|jpeg|gif|webp)$/.test(b.image.media_type) ? b.image : undefined;
    const message = String(b.message || "");
    // The cached layout carries the image inside the request; the legacy string prompt gets it attached by askJSON.
    const prompt = CACHED_LAYOUT ? turnRequest(b.session, message, image) : turnPrompt(b.session, message, !!image);
    const { data: r, usage } = await askJSON<TurnReply>(prompt, {
      effort: "low", maxTokens: 16000, image: CACHED_LAYOUT ? undefined : image, signal: req.signal, salvage,
      meta: { route: "turn", sessionId: b.session.id, turnIndex: b.session.transcript.length },
    });
    const reply = txt(r?.reply).trim();
    if (!r || !reply) throw new AppError("invalid_json", "Empty reply", 502);
    const bc = r.board_comment && typeof r.board_comment === "object" ? r.board_comment : undefined;
    return Response.json({
      reply, new_facts: list(r.new_facts), probed: list(r.probed), phase: txt(r.phase), diagram_notes: txt(r.diagram_notes),
      board_comment: bc ? { node_id: txt(bc.node_id), text: txt(bc.text) } : undefined, usage,
    });
  });
}
