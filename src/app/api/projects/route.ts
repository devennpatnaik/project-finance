import { requireProfile, requireViewer } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { createProject, getProfile, listProjectsForViewer } from "@/lib/study";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await requireViewer(request);
  if (identity instanceof Response) {
    identity.headers.set("Cache-Control", "private, no-store");
    return identity;
  }
  const profile = await getProfile(identity.sub);
  if (!profile) {
    return jsonOk({ projects: [], profile: null });
  }
  const projects = await listProjectsForViewer(identity.sub);
  return jsonOk({ projects, profile });
}

export async function POST(request: Request) {
  const auth = await requireProfile(request);
  if (auth instanceof Response) {
    auth.headers.set("Cache-Control", "private, no-store");
    return auth;
  }
  let body: { name?: string; site?: string };
  try {
    body = (await request.json()) as { name?: string; site?: string };
  } catch {
    return jsonError("Invalid JSON body");
  }
  try {
    const project = await createProject(
      auth.profile,
      body.name ?? "",
      body.site ?? "",
    );
    return jsonOk({ project }, 201);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed", 400);
  }
}
