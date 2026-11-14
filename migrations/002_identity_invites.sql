-- Bind seat invites to Cursor identity (sub / email), not display names.
alter table profiles add column if not exists email text;

alter table seat_invites add column if not exists firm_sub text;
alter table seat_invites add column if not exists firm_email text;

create index if not exists seat_invites_firm_sub_idx on seat_invites (firm_sub);
create index if not exists seat_invites_firm_email_lower_idx on seat_invites (lower(firm_email));
