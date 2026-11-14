import { requireProfile } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { openSeat } from "@/lib/study";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireProfile(request);
  if (auth instanceof Response) {
    auth.headers.set("Cache-Control", "private, no-store");
    return auth;
  }
  let body: {
    projectId?: string;
    scope?: string;
    budgetMin?: number | null;
    budgetMax?: number | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("Invalid JSON body");
  }
  try {
    const seat = await openSeat(
      auth.profile,
      body.projectId ?? "",
      body.scope ?? "",
      body.budgetMin,
      body.budgetMax,
    );
    return jsonOk({ seat }, 201);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed", 400);
  }
}
