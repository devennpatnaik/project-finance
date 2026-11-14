"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SetupForm({
  defaultName,
}: {
  defaultName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(defaultName || "River Ops");
  const [type, setType] = useState<"operator" | "firm">("operator");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/me", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, type }),
    });
    const data = (await res.json()) as { error?: string };
    setPending(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save profile");
      return;
    }
    router.refresh();
  }

  return (
    <form className="panel form-grid" onSubmit={onSubmit}>
      <label>
        Display name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="River Ops"
        />
      </label>
      <label>
        Role
        <select
          value={type}
          onChange={(e) => setType(e.target.value as "operator" | "firm")}
        >
          <option value="operator">Operator</option>
          <option value="firm">Study firm</option>
        </select>
      </label>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Enter table"}
      </button>
      {error ? <div className="error" style={{ gridColumn: "1 / -1" }}>{error}</div> : null}
    </form>
  );
}
