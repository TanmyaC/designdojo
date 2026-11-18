import { checkAccess } from "@/lib/server";
import { speechErrorResponse, speechFetch } from "@/lib/speech";

const MAX_BYTES = 5 * 1024 * 1024;

/* WAV (16 kHz mono from the browser) -> text. */
export async function POST(req: Request) {
  const denied = checkAccess(req); if (denied) return denied;
  let form: FormData;
  try { form = await req.formData(); } catch { return Response.json({ error: { code: "bad_request", message: "Expected multipart form data" } }, { status: 400 }); }
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || !audio.size) return Response.json({ error: { code: "bad_request", message: "No audio" } }, { status: 400 });
  if (audio.size > MAX_BYTES) return Response.json({ error: { code: "speech_input", message: "Audio too long" } }, { status: 413 });
  const out = new FormData();
  out.append("audio", audio, "speech.wav");
  out.append("prompt", String(form.get("prompt") ?? "").slice(0, 300));
  try {
    const r = await speechFetch("/stt", { method: "POST", body: out, timeoutMs: 60000 });
    const j = await r.json();
    return Response.json({ text: String(j.text ?? ""), duration: j.duration });
  } catch (e) { return speechErrorResponse(e); }
}
