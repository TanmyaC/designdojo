import { checkAccess } from "@/lib/server";
import { speechErrorResponse, speechFetch } from "@/lib/speech";

/* Text -> WAV for one sentence or short paragraph of Alex's reply. */
export async function POST(req: Request) {
  const denied = checkAccess(req); if (denied) return denied;
  let b: { text?: unknown; voice?: unknown; speed?: unknown };
  try { b = await req.json(); } catch { return Response.json({ error: { code: "bad_request", message: "Invalid JSON body" } }, { status: 400 }); }
  const text = String(b.text ?? "").trim().slice(0, 1000);
  if (!text) return Response.json({ error: { code: "bad_request", message: "No text" } }, { status: 400 });
  const speed = Math.min(1.6, Math.max(0.6, Number(b.speed) || 1));
  try {
    const r = await speechFetch("/tts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: typeof b.voice === "string" ? b.voice : undefined, speed }),
    });
    return new Response(r.body, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
  } catch (e) { return speechErrorResponse(e); }
}
