import { sql } from "./db";
import {
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

export async function getProfile(sub: string): Promise<Profile | null> {
  const rows = await sql<Profile>(
    "select sub, name, type, created_at::text from profiles where sub = $1",
    [sub],
  );
  return rows[0] ?? null;
}

export async function upsertProfile(
  sub: string,
  name: string,
  type: ProfileType,
): Promise<Profile> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");
  if (type !== "operator" && type !== "firm") {
    throw new Error("Type must be operator or firm");
  }
  const rows = await sql<Profile>(
    `insert into profiles (sub, name, type)
     values ($1, $2, $3)
     on conflict (sub) do update set name = excluded.name, type = excluded.type
     returning sub, name, type, created_at::text`,
    [sub, trimmed, type],
  );
  const profile = rows[0]!;
  if (type === "operator") {
    await ensureSampleProject(profile);
  }
  return profile;
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
          where lower(i.firm_name) = lower((select name from profiles where sub = $1))
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
  const trimmedName = name.trim();
  const trimmedSite = site.trim();
  if (!trimmedName || !trimmedSite) {
    throw new Error("Name and site are required");
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
     join profiles p on p.sub = $2
     where s.project_id = $1 and lower(i.firm_name) = lower(p.name)
     limit 1`,
    [project.id, viewerSub],
  );
  return invited.length > 0;
}

export async function listSeats(projectId: string): Promise<Seat[]> {
  const seats = await sql<Seat>(
    `select id, project_id, role, scope, status,
            budget_min::float8 as budget_min,
            budget_max::float8 as budget_max,
            claimed_by_sub, claimed_by_name,
            claimed_at::text, created_at::text
     from seats
     where project_id = $1
     order by created_at asc`,
    [projectId],
  );
  for (const seat of seats) {
    seat.invites = await sql<SeatInvite>(
      `select id, seat_id, firm_name, invited_by_sub, invited_by_name, invited_at::text
       from seat_invites where seat_id = $1 order by invited_at asc`,
      [seat.id],
    );
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
  const id = shortId("seat");
  const rows = await sql<Seat>(
    `insert into seats (id, project_id, role, scope, status, budget_min, budget_max)
     values ($1, $2, 'study', $3, 'open', $4, $5)
     returning id, project_id, role, scope, status,
               budget_min::float8 as budget_min,
               budget_max::float8 as budget_max,
               claimed_by_sub, claimed_by_name,
               claimed_at::text, created_at::text`,
    [id, project.id, scope, budgetMin ?? null, budgetMax ?? null],
  );
  const seat = rows[0]!;
  seat.invites = [];
  return seat;
}

export async function inviteToSeat(
  profile: Profile,
  seatId: string,
  firmName: string,
): Promise<Seat> {
  if (profile.type !== "operator") {
    throw new Error("Only an operator can invite firms to a seat");
  }
  const firm = firmName.trim();
  if (!firm) throw new Error("Firm name is required");
  const seat = await getSeat(seatId);
  await getOwnedProject(seat.project_id, profile.sub);
  if (seat.status === "delivered") {
    throw new Error(`Seat ${seatId} is already delivered`);
  }
  await sql(
    `insert into seat_invites (id, seat_id, firm_name, invited_by_sub, invited_by_name)
     values ($1, $2, $3, $4, $5)`,
    [shortId("inv"), seatId, firm, profile.sub, profile.name],
  );
  return (await getSeat(seatId))!;
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
  const projectRows = await sql<Project>(
    `select id, name, site, owner_sub, owner_name, is_sample, created_at::text
     from projects where id = $1`,
    [seat.project_id],
  );
  const project = projectRows[0];
  if (!project) throw new Error("Project not found");

  const canSee = await canViewProject(project, profile.sub);
  if (!canSee) {
    throw new Error("You do not have access to this project table");
  }

  const rows = await sql<Seat>(
    `update seats
     set status = 'claimed',
         claimed_by_sub = $2,
         claimed_by_name = $3,
         claimed_at = now()
     where id = $1 and status = 'open'
     returning id, project_id, role, scope, status,
               budget_min::float8 as budget_min,
               budget_max::float8 as budget_max,
               claimed_by_sub, claimed_by_name,
               claimed_at::text, created_at::text`,
    [seatId, profile.sub, profile.name],
  );
  if (!rows[0]) throw new Error(`Seat ${seatId} is not open`);
  return getSeat(seatId);
}

export async function addDelivery(
  profile: Profile,
  seatId: string,
  opts: { path?: string; note?: string; credit?: string },
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
  if (!opts.path?.trim() && !opts.note?.trim()) {
    throw new Error("Provide a path and/or note for the delivery artifact");
  }

  const credit =
    opts.credit?.trim() ||
    seat.claimed_by_name ||
    (profile.type === "firm" ? profile.name : undefined);
  if (!credit) {
    throw new Error("Could not determine credit firm; pass a credit name");
  }

  const id = shortId("dlv");
  const rows = await sql<Delivery>(
    `insert into deliveries (id, seat_id, project_id, path, note, credit, credit_sub)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, seat_id, project_id, path, note, credit, credit_sub, delivered_at::text`,
    [
      id,
      seat.id,
      seat.project_id,
      opts.path?.trim() || null,
      opts.note?.trim() || null,
      credit,
      seat.claimed_by_sub ?? (profile.type === "firm" ? profile.sub : null),
    ],
  );

  await sql(
    `update seats
     set status = 'delivered',
         claimed_by_name = coalesce(claimed_by_name, $2),
         claimed_by_sub = coalesce(claimed_by_sub, $3),
         claimed_at = coalesce(claimed_at, now())
     where id = $1`,
    [seat.id, credit, seat.claimed_by_sub ?? profile.sub],
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
    `select id, project_id, role, scope, status,
            budget_min::float8 as budget_min,
            budget_max::float8 as budget_max,
            claimed_by_sub, claimed_by_name,
            claimed_at::text, created_at::text
     from seats where id = $1`,
    [seatId],
  );
  const seat = rows[0];
  if (!seat) throw new Error(`Seat not found: ${seatId}`);
  seat.invites = await sql<SeatInvite>(
    `select id, seat_id, firm_name, invited_by_sub, invited_by_name, invited_at::text
     from seat_invites where seat_id = $1 order by invited_at asc`,
    [seat.id],
  );
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
