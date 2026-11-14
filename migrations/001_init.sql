create table if not exists profiles (
  sub text primary key,
  name text not null,
  type text not null check (type in ('operator', 'firm')),
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id text primary key,
  name text not null,
  site text not null,
  owner_sub text not null references profiles (sub),
  owner_name text not null,
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists projects_owner_sub_idx on projects (owner_sub);

create table if not exists seats (
  id text primary key,
  project_id text not null references projects (id),
  role text not null default 'study' check (role = 'study'),
  scope text not null check (
    scope in (
      'site-assessment',
      'feasibility',
      'environmental',
      'geotechnical',
      'feed'
    )
  ),
  status text not null default 'open' check (status in ('open', 'claimed', 'delivered')),
  budget_min numeric,
  budget_max numeric,
  claimed_by_sub text,
  claimed_by_name text,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists seats_project_id_idx on seats (project_id);
create index if not exists seats_status_idx on seats (status);

create table if not exists seat_invites (
  id text primary key,
  seat_id text not null references seats (id),
  firm_name text not null,
  invited_by_sub text not null,
  invited_by_name text not null,
  invited_at timestamptz not null default now()
);

create index if not exists seat_invites_seat_id_idx on seat_invites (seat_id);

create table if not exists deliveries (
  id text primary key,
  seat_id text not null references seats (id),
  project_id text not null references projects (id),
  path text,
  note text,
  credit text not null,
  credit_sub text,
  delivered_at timestamptz not null default now()
);

create index if not exists deliveries_project_id_idx on deliveries (project_id);
create index if not exists deliveries_seat_id_idx on deliveries (seat_id);
