"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [site, setSite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, site }),
    });
    const data = (await res.json()) as {
      error?: string;
      project?: { id: string };
    };
    setPending(false);
    if (!res.ok || !data.project) {
      setError(data.error ?? "Could not create project");
      return;
    }
    router.push(`/projects/${data.project.id}`);
    router.refresh();
  }

  return (
    <form className="panel form-grid" onSubmit={onSubmit}>
      <label>
        Project name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Dam A"
        />
      </label>
      <label>
        Site
        <input
          value={site}
          onChange={(e) => setSite(e.target.value)}
          required
          placeholder="Upper gorge, River X"
        />
      </label>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Opening…" : "Open table"}
      </button>
      {error ? (
        <div className="error" style={{ gridColumn: "1 / -1" }}>
          {error}
        </div>
      ) : null}
    </form>
  );
}
