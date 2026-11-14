"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { STUDY_SCOPES, formatBudget, type Profile, type Seat } from "@/lib/model";

export function SeatTable({
  projectId,
  seats,
  profile,
  isOwner,
}: {
  projectId: string;
  seats: Seat[];
  profile: Profile | null;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<(typeof STUDY_SCOPES)[number]>("feasibility");
  const [budgetMin, setBudgetMin] = useState("50000");
  const [budgetMax, setBudgetMax] = useState("120000");
  const [inviteBySeat, setInviteBySeat] = useState<Record<string, string>>({});
  const [noteBySeat, setNoteBySeat] = useState<Record<string, string>>({});
  const [pathBySeat, setPathBySeat] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function refreshAfter(action: () => Promise<Response>) {
    setError(null);
    const res = await action();
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Action failed");
      setPending(null);
      return;
    }
    setPending(null);
    router.refresh();
  }

  async function openSeat(e: React.FormEvent) {
    e.preventDefault();
    setPending("open");
    await refreshAfter(() =>
      fetch("/api/seats", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          scope,
          budgetMin: budgetMin ? Number(budgetMin) : null,
          budgetMax: budgetMax ? Number(budgetMax) : null,
        }),
      }),
    );
  }

  return (
    <div>
      {isOwner && profile?.type === "operator" ? (
        <form className="panel form-grid" onSubmit={openSeat} style={{ marginBottom: "1rem" }}>
          <label>
            Study scope
            <select
              value={scope}
              onChange={(e) =>
                setScope(e.target.value as (typeof STUDY_SCOPES)[number])
              }
            >
              {STUDY_SCOPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            Budget min
            <input
              inputMode="numeric"
              value={budgetMin}
              onChange={(e) => setBudgetMin(e.target.value)}
              placeholder="10000"
            />
          </label>
          <label>
            Budget max
            <input
              inputMode="numeric"
              value={budgetMax}
              onChange={(e) => setBudgetMax(e.target.value)}
              placeholder="25000"
            />
          </label>
          <button className="btn" type="submit" disabled={pending === "open"}>
            {pending === "open" ? "Opening…" : "Open seat"}
          </button>
        </form>
      ) : null}

      {error ? <div className="error">{error}</div> : null}

      <div className="table-wrap">
        <table className="seats">
          <thead>
            <tr>
              <th>Scope</th>
              <th>Role</th>
              <th>Status</th>
              <th>Budget</th>
              <th>Claim / invite</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {seats.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  Empty table — open a study seat to start.
                </td>
              </tr>
            ) : (
              seats.map((seat) => (
                <tr key={seat.id}>
                  <td>
                    <strong>{seat.scope}</strong>
                  </td>
                  <td>{seat.role}</td>
                  <td>
                    <span className={`status ${seat.status}`}>{seat.status}</span>
                    {seat.claimed_by_name ? (
                      <div className="meta" style={{ color: "var(--ink-muted)", fontSize: "0.8rem" }}>
                        {seat.claimed_by_name}
                      </div>
                    ) : null}
                    {seat.invites && seat.invites.length > 0 ? (
                      <div className="meta" style={{ color: "var(--ink-muted)", fontSize: "0.8rem" }}>
                        invited: {seat.invites.map((i) => i.firm_name).join(", ")}
                      </div>
                    ) : null}
                  </td>
                  <td>{formatBudget(seat)}</td>
                  <td>
                    {isOwner && profile?.type === "operator" && seat.status !== "delivered" ? (
                      <div className="inline-actions">
                        <input
                          placeholder="Firm name"
                          value={inviteBySeat[seat.id] ?? ""}
                          onChange={(e) =>
                            setInviteBySeat((m) => ({
                              ...m,
                              [seat.id]: e.target.value,
                            }))
                          }
                        />
                        <button
                          className="btn ghost"
                          type="button"
                          disabled={pending === `invite-${seat.id}`}
                          onClick={() => {
                            setPending(`invite-${seat.id}`);
                            void refreshAfter(() =>
                              fetch(`/api/seats/${seat.id}/invite`, {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({
                                  firm: inviteBySeat[seat.id] ?? "",
                                }),
                              }),
                            );
                          }}
                        >
                          Invite
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: "var(--ink-muted)" }}>—</span>
                    )}
                  </td>
                  <td>
                    {profile?.type === "firm" && seat.status === "open" ? (
                      <button
                        className="btn secondary"
                        type="button"
                        disabled={pending === `claim-${seat.id}`}
                        onClick={() => {
                          setPending(`claim-${seat.id}`);
                          void refreshAfter(() =>
                            fetch(`/api/seats/${seat.id}/claim`, {
                              method: "POST",
                            }),
                          );
                        }}
                      >
                        Claim
                      </button>
                    ) : null}

                    {seat.status === "claimed" &&
                    (profile?.sub === seat.claimed_by_sub ||
                      (isOwner && profile?.type === "operator")) ? (
                      <div className="inline-actions">
                        <input
                          placeholder="Path"
                          value={pathBySeat[seat.id] ?? ""}
                          onChange={(e) =>
                            setPathBySeat((m) => ({
                              ...m,
                              [seat.id]: e.target.value,
                            }))
                          }
                        />
                        <input
                          placeholder="Note"
                          value={noteBySeat[seat.id] ?? ""}
                          onChange={(e) =>
                            setNoteBySeat((m) => ({
                              ...m,
                              [seat.id]: e.target.value,
                            }))
                          }
                        />
                        <button
                          className="btn"
                          type="button"
                          disabled={pending === `deliver-${seat.id}`}
                          onClick={() => {
                            setPending(`deliver-${seat.id}`);
                            void refreshAfter(() =>
                              fetch("/api/deliveries", {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({
                                  seatId: seat.id,
                                  path: pathBySeat[seat.id],
                                  note: noteBySeat[seat.id],
                                }),
                              }),
                            );
                          }}
                        >
                          Deliver
                        </button>
                      </div>
                    ) : null}

                    {seat.status === "delivered" ? (
                      <span className="status delivered">credited</span>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
