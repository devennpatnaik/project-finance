import { headers } from "next/headers";
import { getIdentity, requireIdentity } from "../../cursor/identity";
import type { Profile } from "./model";
import { getProfile, syncProfileEmail } from "./study";

type VerifiedIdentity = Extract<
  Awaited<ReturnType<typeof getIdentity>>,
  { verified: true }
>;

export async function requireViewer(
  request?: Request,
): Promise<VerifiedIdentity | Response> {
  if (request) {
    return requireIdentity(request);
  }
  const h = await headers();
  const fake = new Request("http://localhost", { headers: h });
  return requireIdentity(fake);
}

export async function requireProfile(
  request?: Request,
): Promise<{ identity: VerifiedIdentity; profile: Profile } | Response> {
  const identity = await requireViewer(request);
  if (identity instanceof Response) return identity;
  await syncProfileEmail(identity.sub, identity.email);
  const profile = await getProfile(identity.sub);
  if (!profile) {
    return Response.json(
      { error: "Set up your operator or firm profile first" },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return { identity, profile };
}
