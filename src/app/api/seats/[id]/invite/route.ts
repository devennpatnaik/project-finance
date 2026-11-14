import { requireProfile } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { inviteToSeat } from "@/lib/study";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireProfile(request);
  if (auth instanceof Response) {
    auth.headers.set("Cache-Control", "private, no-store");
    return auth;
  }
  let body: { firm?: string };
  try {
    body = (await request.json()) as { firm?: string };
  } catch {
    return jsonError("Invalid JSON body");
  }
  const { id } = await context.params;
  try {
    const seat = await inviteToSeat(auth.profile, id, body.firm ?? "");
    return jsonOk({ seat });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed", 400);
  }
}
