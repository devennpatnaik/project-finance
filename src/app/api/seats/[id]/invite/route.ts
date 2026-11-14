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
  let body: { email?: string; sub?: string; firm?: string; label?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("Invalid JSON body");
  }
  const { id } = await context.params;
  // Accept email or Cursor identity sub — never treat free-text "firm" as auth.
  const firmEmail = body.email?.trim() || undefined;
  const firmSub = body.sub?.trim() || undefined;
  const legacy = body.firm?.trim();
  const looksLikeEmail = legacy?.includes("@");
  try {
    const seat = await inviteToSeat(auth.profile, id, {
      firmEmail: firmEmail || (looksLikeEmail ? legacy : undefined),
      firmSub: firmSub || (!looksLikeEmail && legacy ? legacy : undefined),
      label: body.label,
    });
    return jsonOk({ seat });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed", 400);
  }
}
