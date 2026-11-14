# Study Table

Web product for the empty project table: operators open study seats, firms claim and deliver, firm credit lands on the project record. Port of the Study table CLI onto Cursor publish-app with Postgres.

## Stack

- Next.js App Router + TypeScript
- Postgres when `DATABASE_URL` is set (published app); PGlite in-memory when unset (local)
- Cursor app identity (`cursor/identity`) — key rows by `identity.sub`

## Local

```bash
npm install
env -u DATABASE_URL npm run dev
```

Simulated viewer comes from `cursor/identity.dev.ts`.

```bash
env -u DATABASE_URL npm test
```

## Product

- Projects list for the signed-in viewer
- Create project (name, site)
- Project page = the table: seats (role / scope / status / budget), invite / claim, deliveries with firm credit
- Study scopes: site-assessment, feasibility, environmental, geotechnical, feed
- Statuses: open → claimed → delivered
- Sample project seeded for new operators (marked **Sample data**)

## Build

`npm run build` runs `next build` then `scripts/migrate.mjs` (no-op without `DATABASE_URL`).
