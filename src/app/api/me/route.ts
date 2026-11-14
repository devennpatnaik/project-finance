import { requireViewer } from "@/lib/auth";
import { jsonError, jsonOk, NO_STORE } from "@/lib/http";
import { getProfile, upsertProfile } from "@/lib/study";
import type { ProfileType } from "@/lib/model";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await requireViewer(request);
  if (identity instanceof Response) {
    identity.headers.set("Cache-Control", "private, no-store");
    return identity;
  }
  const profile = await getProfile(identity.sub);
  return jsonOk({
    name: identity.name,
    email: identity.email,
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
    );
    return jsonOk({ profile });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed", 400);
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: NO_STORE });
}
