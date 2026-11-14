import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";

type DbGlobal = {
  studyTablePool?: pg.Pool;
  studyTableLocal?: Promise<PGlite>;
};

const g = globalThis as typeof globalThis & DbGlobal;

export async function sql<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (databaseUrl !== "") {
    g.studyTablePool ??= new pg.Pool({ connectionString: databaseUrl, max: 5 });
    return (await g.studyTablePool.query(text, params)).rows as T[];
  }
  g.studyTableLocal ??= startLocal().catch((error: unknown) => {
    g.studyTableLocal = undefined;
    throw error;
  });
  return (await (await g.studyTableLocal).query<T>(text, params)).rows;
}

async function startLocal(): Promise<PGlite> {
  const db = new PGlite();
  const files = (await readdir("migrations").catch(() => []))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await db.exec(await readFile(`migrations/${file}`, "utf8"));
  }
  return db;
}
