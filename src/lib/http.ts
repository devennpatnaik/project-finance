import { headers } from "next/headers";

export const NO_STORE = {
  "Cache-Control": "private, no-store",
} as const;

export function jsonOk<T>(data: T, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE });
}

export function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}

export async function markPrivate(): Promise<void> {
  const h = await headers();
  h.set?.("Cache-Control", "private, no-store");
}
