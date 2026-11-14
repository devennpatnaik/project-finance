import { sql } from "./db";
import {
  LIMITS,
  formatBudget,
  isStudyScope,
  shortId,
  type Delivery,
  type Profile,
  type ProfileType,
  type Project,
  type Seat,
  type SeatInvite,
  type StudyScope,
} from "./model";

function clampText(label: string, value: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  if (trimmed.length > max) {
    throw new Error(`${label} must be at most ${max} characters`);
  }
  return trimmed;
}

function optionalText(
  label: string,
  value: string | undefined | null,
  max: number,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new Error(`${label} must be at most ${max} characters`);
  }
  return trimmed;
}

const PROFILE_SELECT =
  "sub, name, type, email, created_at::text";
const INVITE_SELECT =
  "id, seat_id, firm_name, firm_sub, firm_email, invited_by_sub, invited_by_name, invited_at::text";
const SEAT_SELECT = `id, project_id, role, scope, status,
            budget_min::float8 as budget_min,
            budget_max::float8 as budget_max,
            claimed_by_sub, claimed_by_name,
            claimed_at::text, created_at::text`;

export async function getProfile(sub: string): Promise<Profile | null> {
  const rows = await sql<Profile>(
    `select ${PROFILE_SELECT} from profiles where sub = $1`,
    [sub],
  );
  return rows[0] ?? null;
}

export async function upsertProfile(
  sub: string,
  name: string,
  type: ProfileType,
  email?: string | null,
): Promise<Profile> {
  const trimmed = clampText("Name", name, LIMITS.name);
  if (type !== "operator" && type !== "firm") {
    throw new Error("Type must be operator or firm");
  }
  const normalizedEmail =
    email?.trim() && email.trim().length > 0
      ? clampText("Email", email, LIMITS.firmEmail).toLowerCase()
      : null;
  const rows = await sql<Profile>(
    `insert into profiles (sub, name, type, email)
     values ($1, $2, $3, $4)
     on conflict (sub) do update set
       name = excluded.name,
       type = excluded.type,
       email = coalesce(excluded.email, profiles.email)
     returning ${PROFILE_SELECT}`,
    [sub, trimmed, type, normalizedEmail],
  );
  const profile = rows[0]!;
  if (type === "operator") {
    await ensureSampleProject(profile);
  }
  return profile;
}

/** Keep profile.email in sync with verified Cursor identity email. */
export async function syncProfileEmail(
  sub: string,
  email: string | null | undefined,
): Promise<void> {
  if (!email?.trim()) return;
  const normalized = clampText("Email", email, LIMITS.firmEmail).toLowerCase();
  await sql(`update profiles set email = $2 where sub = $1`, [
    sub,
    normalized,
  ]);
}

async function ensureSampleProject(profile: Profile): Promise<void> {
  const existing = await sql<{ id: string }>(
    "select id from projects where owner_sub = $1 and is_sample = true limit 1",
    [profile.sub],
  );
  if (existing.length) return;

  const projectId = shortId("prj");
  await sql(
    `insert into projects (id, name, site, owner_sub, owner_name, is_sample)
     values ($1, $2, $3, $4, $5, true)`,
    [
      projectId,
      "Dam A (sample)",
      "Upper gorge, River X — sample data",
      profile.sub,
      profile.name,
    ],
  );

  const seats: Array<{
    scope: StudyScope;
    budgetMin: number;
    budgetMax: number;
  }> = [
    { scope: "site-assessment", budgetMin: 10_000, budgetMax: 25_000 },
    { scope: "feasibility", budgetMin: 50_000, budgetMax: 120_000 },
    { scope: "geotechnical", budgetMin: 40_000, budgetMax: 90_000 },
  ];

  for (const seat of seats) {
    await sql(
      `insert into seats (id, project_id, role, scope, status, budget_min, budget_max)
       values ($1, $2, 'study', $3, 'open', $4, $5)`,
      [shortId("seat"), projectId, seat.scope, seat.budgetMin, seat.budgetMax],
    );
  }
}

/** Invite match: firm_sub = viewer.sub OR lower(firm_email) = lower(viewer email). */
function inviteMatchSql(viewerSubParam: string, emailExpr: string): string {
  return `(i.firm_sub = ${viewerSubParam}
          or (i.firm_email is not null and ${emailExpr} is not null
              and lower(i.firm_email) = lower(${emailExpr})))`;
}

export async function listProjectsForViewer(sub: string): Promise<Project[]> {
  return sql<Project>(
    `select id, name, site, owner_sub, owner_name, is_sample, created_at::text
     from projects
     where owner_sub = $1
        or id in (
          select project_id from seats where claimed_by_sub = $1
        )
        or id in (
          select s.project_id
          from seats s
          join seat_invites i on i.seat_id = s.id
          left join profiles p on p.sub = $1
          where ${inviteMatchSql("$1", "p.email")}
        )
     order by created_at asc`,
    [sub],
  );
}

export async function createProject(
  profile: Profile,
  name: string,
  site: string,
): Promise<Project> {
  if (profile.type !== "operator") {
    throw new Error("Only an operator can create projects");
  }
  const trimmedName = clampText("Name", name, LIMITS.name);
  const trimmedSite = clampText("Site", site, LIMITS.site);
  const count = await sql<{ n: string }>(
    `select count(*)::text as n from projects
     where owner_sub = $1 and is_sample = false`,
    [profile.sub],
  );
  if (Number(count[0]?.n ?? 0) >= LIMITS.projectsPerOperator) {
    throw new Error(
      `At most ${LIMITS.projectsPerOperator} projects per operator`,
    );
  }
  const id = shortId("prj");
  const rows = await sql<Project>(
    `insert into projects (id, name, site, owner_sub, owner_name, is_sample)
     values ($1, $2, $3, $4, $5, false)
     returning id, name, site, owner_sub, owner_name, is_sample, created_at::text`,
    [id, trimmedName, trimmedSite, profile.sub, profile.name],
  );
  return rows[0]!;
}

export async function getProject(
  id: string,
  viewerSub: string,
): Promise<Project | null> {
  const rows = await sql<Project>(
    `select id, name, site, owner_sub, owner_name, is_sample, created_at::text
     from projects where id = $1`,
    [id],
  );
  const project = rows[0];
  if (!project) return null;
  if (await canViewProject(project, viewerSub)) return project;
  return null;
}

async function canViewProject(
  project: Project,
  viewerSub: string,
): Promise<boolean> {
  if (project.owner_sub === viewerSub) return true;
  const claimed = await sql<{ id: string }>(
    "select id from seats where project_id = $1 and claimed_by_sub = $2 limit 1",
    [project.id, viewerSub],
  );
  if (claimed.length) return true;
  const invited = await sql<{ id: string }>(
    `select i.id
     from seat_invites i
     join seats s on s.id = i.seat_id
     left join profiles p on p.sub = $2
     where s.project_id = $1 and ${inviteMatchSql("$2", "p.email")}
     limit 1`,
    [project.id, viewerSub],
  );
  return invited.length > 0;
}

async function loadInvites(seatId: string): Promise<SeatInvite[]> {
  return sql<SeatInvite>(
    `select ${INVITE_SELECT}
     from seat_invites where seat_id = $1 order by invited_at asc`,
    [seatId],
  );
}

export async function listSeats(projectId: string): Promise<Seat[]> {
  const seats = await sql<Seat>(
    `select ${SEAT_SELECT}
     from seats
     where project_id = $1
     order by created_at asc`,
    [projectId],
  );
  for (const seat of seats) {
    seat.invites = await loadInvites(seat.id);
  }
  return seats;
}

export async function listDeliveries(projectId: string): Promise<Delivery[]> {
  return sql<Delivery>(
    `select id, seat_id, project_id, path, note, credit, credit_sub, delivered_at::text
     from deliveries
     where project_id = $1
     order by delivered_at asc`,
    [projectId],
  );
}

export async function openSeat(
  profile: Profile,
  projectId: string,
  scope: string,
  budgetMin?: number | null,
  budgetMax?: number | null,
): Promise<Seat> {
  if (profile.type !== "operator") {
    throw new Error("Only an operator can open seats");
  }
  const project = await getOwnedProject(projectId, profile.sub);
  if (!isStudyScope(scope)) {
    throw new Error(
      `Unknown scope "${scope}". Use one of: site-assessment, feasibility, environmental, geotechnical, feed`,
    );
  }
  if (
    budgetMin != null &&
    budgetMax != null &&
    Number(budgetMin) > Number(budgetMax)
  ) {
    throw new Error("budget-min cannot exceed budget-max");
  }
  const count = await sql<{ n: string }>(
    `select count(*)::text as n from seats where project_id = $1`,
    [project.id],
  );
  if (Number(count[0]?.n ?? 0) >= LIMITS.seatsPerProject) {
    throw new Error(`At most ${LIMITS.seatsPerProject} seats per project`);
  }
  const id = shortId("seat");
  const rows = await sql<Seat>(
    `insert into seats (id, project_id, role, scope, status, budget_min, budget_max)
     values ($1, $2, 'study', $3, 'open', $4, $5)
     returning ${SEAT_SELECT}`,
    [id, project.id, scope, budgetMin ?? null, budgetMax ?? null],
  );
  const seat = rows[0]!;
  seat.invites = [];
  return seat;
}

export type InviteTarget = {
  /** Cursor identity.sub of the firm. */
  firmSub?: string;
  /** Cursor identity email of the firm. */
  firmEmail?: string;
  /** Optional display label only (not used for authorization). */
  label?: string;
};

export async function inviteToSeat(
  profile: Profile,
  seatId: string,
  target: InviteTarget,
): Promise<Seat> {
  if (profile.type !== "operator") {
    throw new Error("Only an operator can invite firms to a seat");
  }
  const firmSub = optionalText("Firm identity", target.firmSub, LIMITS.firmSub);
  const firmEmailRaw = optionalText(
    "Firm email",
    target.firmEmail,
    LIMITS.firmEmail,
  );
  const firmEmail = firmEmailRaw ? firmEmailRaw.toLowerCase() : null;
  if (!firmSub && !firmEmail) {
    throw new Error("Invite by firm email or Cursor identity id");
  }
  if (firmEmail && !firmEmail.includes("@")) {
    throw new Error("Firm email must be a valid email address");
  }

  let display =
    optionalText("Label", target.label, LIMITS.name) ||
    firmEmail ||
    firmSub ||
    "invited firm";

  if (firmSub) {
    const known = await getProfile(firmSub);
    if (known) {
      display = known.name;
      if (known.type !== "firm") {
        throw new Error("Invite target must be a firm profile");
      }
    }
  } else if (firmEmail) {
    const known = await sql<Profile>(
      `select ${PROFILE_SELECT} from profiles where lower(email) = lower($1) limit 1`,
      [firmEmail],
    );
    if (known[0] && known[0].type !== "firm") {
      throw new Error("Invite target must be a firm profile");
    }
    if (known[0]) display = known[0].name;
  }

  const seat = await getSeat(seatId);
  await getOwnedProject(seat.project_id, profile.sub);
  if (seat.status === "delivered") {
    throw new Error(`Seat ${seatId} is already delivered`);
  }

  const inviteCount = await sql<{ n: string }>(
    `select count(*)::text as n from seat_invites where seat_id = $1`,
    [seatId],
  );
  if (Number(inviteCount[0]?.n ?? 0) >= LIMITS.invitesPerSeat) {
    throw new Error(`At most ${LIMITS.invitesPerSeat} invites per seat`);
  }

  const dup = await sql<{ id: string }>(
    `select id from seat_invites
     where seat_id = $1
       and (
         ($2::text is not null and firm_sub = $2)
         or ($3::text is not null and firm_email is not null and lower(firm_email) = lower($3))
       )
     limit 1`,
    [seatId, firmSub, firmEmail],
  );
  if (dup.length) {
    throw new Error("That firm is already invited to this seat");
  }

  await sql(
    `insert into seat_invites
       (id, seat_id, firm_name, firm_sub, firm_email, invited_by_sub, invited_by_name)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      shortId("inv"),
      seatId,
      display,
      firmSub,
      firmEmail,
      profile.sub,
      profile.name,
    ],
  );
  return (await getSeat(seatId))!;
}

async function hasInviteForFirm(
  seatId: string,
  profile: Profile,
): Promise<boolean> {
  const rows = await sql<{ id: string }>(
    `select id from seat_invites
     where seat_id = $1
       and (
         firm_sub = $2
         or (firm_email is not null and $3::text is not null
             and lower(firm_email) = lower($3))
       )
     limit 1`,
    [seatId, profile.sub, profile.email],
  );
  return rows.length > 0;
}

export async function claimSeat(
  profile: Profile,
  seatId: string,
): Promise<Seat> {
  if (profile.type !== "firm") {
    throw new Error("Only a firm can claim a seat");
  }
  const seat = await getSeat(seatId);
  if (seat.status !== "open") {
    throw new Error(`Seat ${seatId} is ${seat.status}, not open`);
  }

  const invited = await hasInviteForFirm(seatId, profile);
  if (!invited) {
    throw new Error(
      "You are not invited to this seat (invite must match your Cursor identity)",
    );
  }

  const rows = await sql<Seat>(
    `update seats
     set status = 'claimed',
         claimed_by_sub = $2,
         claimed_by_name = $3,
         claimed_at = now()
     where id = $1 and status = 'open'
     returning ${SEAT_SELECT}`,
    [seatId, profile.sub, profile.name],
  );
  if (!rows[0]) throw new Error(`Seat ${seatId} is not open`);
  return getSeat(seatId);
}

export async function addDelivery(
  profile: Profile,
  seatId: string,
  opts: { path?: string; note?: string },
): Promise<Delivery> {
  const seat = await getSeat(seatId);
  if (seat.status === "open") {
    throw new Error(`Seat ${seatId} is still open; claim it before delivering`);
  }
  if (seat.status === "delivered") {
    throw new Error(`Seat ${seatId} is already delivered`);
  }
  const isOwner = await sql<{ owner_sub: string }>(
    "select owner_sub from projects where id = $1",
    [seat.project_id],
  );
  const ownerSub = isOwner[0]?.owner_sub;
  const isClaimant = seat.claimed_by_sub === profile.sub;
  const isOperatorOwner =
    profile.type === "operator" && ownerSub === profile.sub;
  if (!isClaimant && !isOperatorOwner) {
    throw new Error("Only the claiming firm or project operator can deliver");
  }

  const path = optionalText("Path", opts.path, LIMITS.path);
  const note = optionalText("Note", opts.note, LIMITS.note);
  if (!path && !note) {
    throw new Error("Provide a path and/or note for the delivery artifact");
  }

  // Credit only the authenticated claiming firm — never a client-supplied name.
  const creditSub = seat.claimed_by_sub;
  if (!creditSub) {
    throw new Error("Seat has no claiming firm to credit");
  }
  const creditProfile = await getProfile(creditSub);
  const credit =
    creditProfile?.name?.trim() || seat.claimed_by_name?.trim() || null;
  if (!credit) {
    throw new Error("Could not determine credit firm from claiming identity");
  }

  const deliveryCount = await sql<{ n: string }>(
    `select count(*)::text as n from deliveries where project_id = $1`,
    [seat.project_id],
  );
  if (Number(deliveryCount[0]?.n ?? 0) >= LIMITS.deliveriesPerProject) {
    throw new Error(
      `At most ${LIMITS.deliveriesPerProject} deliveries per project`,
    );
  }

  const id = shortId("dlv");
  const rows = await sql<Delivery>(
    `insert into deliveries (id, seat_id, project_id, path, note, credit, credit_sub)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, seat_id, project_id, path, note, credit, credit_sub, delivered_at::text`,
    [id, seat.id, seat.project_id, path, note, credit, creditSub],
  );

  await sql(
    `update seats
     set status = 'delivered',
         claimed_by_name = coalesce(claimed_by_name, $2),
         claimed_by_sub = coalesce(claimed_by_sub, $3),
         claimed_at = coalesce(claimed_at, now())
     where id = $1`,
    [seat.id, credit, creditSub],
  );

  return rows[0]!;
}

async function getOwnedProject(
  projectId: string,
  ownerSub: string,
): Promise<Project> {
  const rows = await sql<Project>(
    `select id, name, site, owner_sub, owner_name, is_sample, created_at::text
     from projects where id = $1`,
    [projectId],
  );
  const project = rows[0];
  if (!project) throw new Error(`Project not found: ${projectId}`);
  if (project.owner_sub !== ownerSub) {
    throw new Error("Only the project operator can change this table");
  }
  return project;
}

export async function getSeat(seatId: string): Promise<Seat> {
  const rows = await sql<Seat>(
    `select ${SEAT_SELECT} from seats where id = $1`,
    [seatId],
  );
  const seat = rows[0];
  if (!seat) throw new Error(`Seat not found: ${seatId}`);
  seat.invites = await loadInvites(seat.id);
  return seat;
}

export async function projectSnapshot(projectId: string, viewerSub: string) {
  const project = await getProject(projectId, viewerSub);
  if (!project) return null;
  const seats = await listSeats(project.id);
  const deliveries = await listDeliveries(project.id);
  const credits = [...new Set(deliveries.map((d) => d.credit))];
  return {
    project,
    seats,
    deliveries,
    credits,
    open: seats.filter((s) => s.status === "open").length,
    claimed: seats.filter((s) => s.status === "claimed").length,
    delivered: seats.filter((s) => s.status === "delivered").length,
    budgetLabel: (seat: Seat) => formatBudget(seat),
  };
}
