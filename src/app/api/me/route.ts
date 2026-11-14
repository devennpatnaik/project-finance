import { requireViewer } from "@/lib/auth";
import { jsonError, jsonOk, NO_STORE } from "@/lib/http";
import { getProfile, syncProfileEmail, upsertProfile } from "@/lib/study";
import type { ProfileType } from "@/lib/model";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await requireViewer(request);
  if (identity instanceof Response) {
    identity.headers.set("Cache-Control", "private, no-store");
    return identity;
  }
  await syncProfileEmail(identity.sub, identity.email);
  const profile = await getProfile(identity.sub);
  return jsonOk({
    name: identity.name,
    email: identity.email,
    sub: identity.sub,
    simulated: identity.simulated,
    profile,
  });
}

export async function POST(request: Request) {
  const identity = await requireViewer(request);
  if (identity instanceof Response) {
    identity.headers.set("Cache-Control", "private, no-store");
    return identity;
  }
  let body: { name?: string; type?: ProfileType };
  try {
    body = (await request.json()) as { name?: string; type?: ProfileType };
  } catch {
    return jsonError("Invalid JSON body");
  }
  try {
    const profile = await upsertProfile(
      identity.sub,
      (body.name?.trim() || identity.name || "Viewer").trim(),
      body.type === "firm" ? "firm" : "operator",
      identity.email,
    );
    return jsonOk({ profile });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed", 400);
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: NO_STORE });
}
