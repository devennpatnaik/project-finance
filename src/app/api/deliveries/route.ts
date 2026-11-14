import { requireProfile } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { addDelivery } from "@/lib/study";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireProfile(request);
  if (auth instanceof Response) {
    auth.headers.set("Cache-Control", "private, no-store");
    return auth;
  }
  let body: {
    seatId?: string;
    path?: string;
    note?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("Invalid JSON body");
  }
  try {
    const delivery = await addDelivery(auth.profile, body.seatId ?? "", {
      path: body.path,
      note: body.note,
    });
    return jsonOk({ delivery }, 201);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed", 400);
  }
}
