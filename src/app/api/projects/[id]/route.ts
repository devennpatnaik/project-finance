import { requireViewer } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getProfile, projectSnapshot } from "@/lib/study";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const identity = await requireViewer(request);
  if (identity instanceof Response) {
    identity.headers.set("Cache-Control", "private, no-store");
    return identity;
  }
  const { id } = await context.params;
  const snap = await projectSnapshot(id, identity.sub);
  if (!snap) return jsonError("Project not found", 404);
  const profile = await getProfile(identity.sub);
  return jsonOk({ ...snap, profile });
}
