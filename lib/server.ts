import "server-only";

/** The optional ACCESS_CODE gate shared by every API route. Returns a 401 response, or null when the request may proceed. */
export function checkAccess(req: Request): Response | null {
  const code = process.env.ACCESS_CODE;
  if (code && req.headers.get("x-access-code") !== code) {
    return Response.json({ error: { code: "access_code", message: "Access code required" } }, { status: 401 });
  }
  return null;
}
