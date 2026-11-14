import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getIdentity } from "../../../../cursor/identity";
import { SeatTable } from "@/components/SeatTable";
import { getProfile, projectSnapshot } from "@/lib/study";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const h = await headers();
  const identity = await getIdentity(
    new Request("http://localhost", { headers: h }),
  );
  if (!identity.verified) {
    return (
      <main className="shell">
        <div className="error">Signed out — open this app as private or team.</div>
      </main>
    );
  }

  const { id } = await params;
  const snap = await projectSnapshot(id, identity.sub);
  if (!snap) notFound();

  const profile = await getProfile(identity.sub);
  const isOwner = snap.project.owner_sub === identity.sub;

  return (
    <main className="shell">
      <Link className="back" href="/">
        ← All projects
      </Link>
      <div className="topbar">
        <div>
          <p className="brand">{snap.project.name}</p>
          <p className="lede">{snap.project.site}</p>
          {snap.project.is_sample ? (
            <div className="badge">Sample data</div>
          ) : null}
        </div>
        <div className="viewer">
          <div>
            Viewing as <strong>{identity.name || "viewer"}</strong>
          </div>
          {profile ? (
            <div>
              {profile.name} · {profile.type}
            </div>
          ) : null}
          <div className="meta" style={{ marginTop: "0.35rem" }}>
            operator {snap.project.owner_name}
          </div>
        </div>
      </div>

      <div className="stats">
        <span>
          open <strong>{snap.open}</strong>
        </span>
        <span>
          claimed <strong>{snap.claimed}</strong>
        </span>
        <span>
          delivered <strong>{snap.delivered}</strong>
        </span>
      </div>

      {snap.credits.length > 0 ? (
        <p className="credits">
          Firm credit on this table:{" "}
          <span>{snap.credits.join(", ")}</span>
        </p>
      ) : (
        <p className="credits">No firm credit yet — deliveries land here.</p>
      )}

      <section className="section" style={{ marginTop: "0.5rem" }}>
        <h2>Study seats</h2>
        <p className="hint">
          Scope and budget stay visible. Claim fills a seat; delivery credits
          the firm.
        </p>
        <SeatTable
          projectId={snap.project.id}
          seats={snap.seats}
          profile={profile}
          isOwner={isOwner}
        />
      </section>

      <section className="section deliveries">
        <h2>Deliveries</h2>
        <p className="hint">Artifacts attached to seats, with firm credit.</p>
        {snap.deliveries.length === 0 ? (
          <p className="empty">No deliveries yet.</p>
        ) : (
          <ul>
            {snap.deliveries.map((d) => (
              <li key={d.id}>
                <strong>{d.credit}</strong>
                {d.path ? ` · ${d.path}` : ""}
                {d.note ? ` — ${d.note}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
