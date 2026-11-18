import { checkAccess } from "@/lib/server";
import { speechConfigured, speechFetch } from "@/lib/speech";

export const dynamic = "force-dynamic";

/* Whether voice is available, and which voices Alex can use. Never errors: voice off is a valid answer. */
export async function GET(req: Request) {
  const denied = checkAccess(req); if (denied) return denied;
  if (!speechConfigured()) return Response.json({ enabled: false, reason: "not_configured", voices: [] });
  try {
    const health = await (await speechFetch("/health", { timeoutMs: 4000 })).json();
    if (!health?.ok) return Response.json({ enabled: false, reason: "starting", voices: [] });
    const v = await (await speechFetch("/voices", { timeoutMs: 4000 })).json();
    return Response.json({ enabled: true, voices: v.voices || [], defaultVoice: v.default });
  } catch {
    return Response.json({ enabled: false, reason: "unreachable", voices: [] });
  }
}
