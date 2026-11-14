export const STUDY_SCOPES = [
  "site-assessment",
  "feasibility",
  "environmental",
  "geotechnical",
  "feed",
] as const;

/** Caps on stored text and create actions (security / resource limits). */
export const LIMITS = {
  name: 100,
  site: 200,
  path: 500,
  note: 2000,
  firmEmail: 254,
  firmSub: 200,
  seatsPerProject: 50,
  deliveriesPerProject: 200,
  invitesPerSeat: 20,
  projectsPerOperator: 50,
} as const;

export type StudyScope = (typeof STUDY_SCOPES)[number];
export type SeatRole = "study";
export type SeatStatus = "open" | "claimed" | "delivered";
export type ProfileType = "operator" | "firm";

export interface Profile {
  sub: string;
  name: string;
  type: ProfileType;
  email: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  site: string;
  owner_sub: string;
  owner_name: string;
  is_sample: boolean;
  created_at: string;
}

export interface SeatInvite {
  id: string;
  seat_id: string;
  /** Display-only label; never used for authorization. */
  firm_name: string;
  /** Cursor identity.sub of the invited firm (preferred auth bind). */
  firm_sub: string | null;
  /** Cursor identity email of the invited firm (auth bind). */
  firm_email: string | null;
  invited_by_sub: string;
  invited_by_name: string;
  invited_at: string;
}

export interface Seat {
  id: string;
  project_id: string;
  role: SeatRole;
  scope: StudyScope;
  status: SeatStatus;
  budget_min: number | null;
  budget_max: number | null;
  claimed_by_sub: string | null;
  claimed_by_name: string | null;
  claimed_at: string | null;
  created_at: string;
  invites?: SeatInvite[];
}

export interface Delivery {
  id: string;
  seat_id: string;
  project_id: string;
  path: string | null;
  note: string | null;
  credit: string;
  credit_sub: string | null;
  delivered_at: string;
}

export function isStudyScope(value: string): value is StudyScope {
  return (STUDY_SCOPES as readonly string[]).includes(value);
}

export function formatBudget(seat: {
  budget_min: number | null;
  budget_max: number | null;
}): string {
  if (seat.budget_min == null && seat.budget_max == null) return "—";
  if (seat.budget_min != null && seat.budget_max != null) {
    return `${formatMoney(seat.budget_min)}–${formatMoney(seat.budget_max)}`;
  }
  if (seat.budget_min != null) return `≥${formatMoney(seat.budget_min)}`;
  return `≤${formatMoney(seat.budget_max!)}`;
}

export function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function shortId(prefix: string): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
