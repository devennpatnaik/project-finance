import Link from "next/link";
import { headers } from "next/headers";
import { getIdentity } from "../../cursor/identity";
import { CreateProjectForm } from "@/components/CreateProjectForm";
import { ProfileSwitch } from "@/components/ProfileSwitch";
import { SetupForm } from "@/components/SetupForm";
import { getProfile, listProjectsForViewer } from "@/lib/study";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const h = await headers();
  const identity = await getIdentity(
    new Request("http://localhost", { headers: h }),
  );

  if (!identity.verified) {
    return (
      <main className="shell">
        <div className="topbar">
          <div>
            <p className="brand">Study Table</p>
            <p className="lede">
              Sign in through Cursor to open empty project tables, seat study
              firms, and credit deliveries.
            </p>
          </div>
        </div>
        <div className="error">Signed out — open this app as private or team.</div>
      </main>
    );
  }

  const profile = await getProfile(identity.sub);
  const projects = profile ? await listProjectsForViewer(identity.sub) : [];

  return (
    <main className="shell">
      <div className="topbar">
        <div>
          <p className="brand">Study Table</p>
          <p className="lede">
            Empty project tables. Operators open study seats; firms claim scope
            and deliver with credit. Build rights stay out of scope.
          </p>
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
          {identity.simulated ? <div className="badge">Simulated local viewer</div> : null}
        </div>
      </div>

      {!profile ? (
        <section className="section">
          <h2>Set your seat at the table</h2>
          <p className="hint">
            Choose operator to open projects, or firm to claim and deliver study
            work.
          </p>
          <SetupForm defaultName={identity.name || ""} />
        </section>
      ) : (
        <>
          <section className="section">
            <h2>Identity</h2>
            <p className="hint">
              Switch between operator and firm to walk the invite → claim →
              deliver loop.
            </p>
            <ProfileSwitch profile={profile} />
          </section>

          {profile.type === "operator" ? (
            <section className="section">
              <h2>Open a project table</h2>
              <p className="hint">Name the project and site. Seats come next.</p>
              <CreateProjectForm />
            </section>
          ) : null}

          <section className="section">
            <h2>Projects</h2>
            <p className="hint">Tables you own, were invited to, or have claimed.</p>
            {projects.length === 0 ? (
              <p className="empty">No projects yet.</p>
            ) : (
              <ul className="project-list">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`}>
                      <span>
                        <strong>{p.name}</strong>
                        {p.is_sample ? (
                          <span className="sample-tag">Sample data</span>
                        ) : null}
                        <div className="meta">{p.site}</div>
                      </span>
                      <span className="meta">owner {p.owner_name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
