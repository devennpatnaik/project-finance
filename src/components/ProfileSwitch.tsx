"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Profile } from "@/lib/model";

export function ProfileSwitch({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [name, setName] = useState(profile.name);
  const [type, setType] = useState(profile.type);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
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
      setError(data.error ?? "Update failed");
      return;
    }
    router.refresh();
  }

  return (
    <form className="panel form-grid" onSubmit={save}>
      <label>
        Acting as
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
        />
      </label>
      <label>
        Role
        <select
          value={type}
          onChange={(e) => setType(e.target.value as Profile["type"])}
        >
          <option value="operator">Operator</option>
          <option value="firm">Study firm</option>
        </select>
      </label>
      <button className="btn secondary" type="submit" disabled={pending}>
        {pending ? "Updating…" : "Update identity"}
      </button>
      {error ? (
        <div className="error" style={{ gridColumn: "1 / -1" }}>
          {error}
        </div>
      ) : null}
    </form>
  );
}
