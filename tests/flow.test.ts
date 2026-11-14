import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import {
  addDelivery,
  claimSeat,
  createProject,
  inviteToSeat,
  listProjectsForViewer,
  openSeat,
  projectSnapshot,
  upsertProfile,
} from "../src/lib/study";

describe("study table PGlite flow", () => {
  before(() => {
    assert.equal(process.env.DATABASE_URL ?? "", "", "DATABASE_URL must be unset for PGlite");
  });

  it("migrations apply and create → seats → claim → deliver → credit", async () => {
    const operator = await upsertProfile("user:op", "River Ops", "operator");
    assert.equal(operator.type, "operator");

    const listed = await listProjectsForViewer(operator.sub);
    assert.ok(listed.some((p) => p.is_sample), "sample project seeded");
    const sample = listed.find((p) => p.is_sample)!;
    assert.match(sample.name, /sample/i);

    const project = await createProject(operator, "Dam B", "Lower reach");
    assert.equal(project.owner_sub, operator.sub);

    const seat = await openSeat(
      operator,
      project.id,
      "geotechnical",
      40_000,
      90_000,
    );
    assert.equal(seat.status, "open");
    assert.equal(seat.budget_min, 40_000);

    await inviteToSeat(operator, seat.id, "GeoFirm");

    const firm = await upsertProfile("user:firm", "GeoFirm", "firm");
    const firmProjects = await listProjectsForViewer(firm.sub);
    assert.ok(
      firmProjects.some((p) => p.id === project.id),
      "invited firm sees project",
    );

    const claimed = await claimSeat(firm, seat.id);
    assert.equal(claimed.status, "claimed");
    assert.equal(claimed.claimed_by_name, "GeoFirm");

    const delivery = await addDelivery(firm, seat.id, {
      path: "reports/geo-v1.pdf",
      note: "Borehole summary",
    });
    assert.equal(delivery.credit, "GeoFirm");

    const snap = await projectSnapshot(project.id, operator.sub);
    assert.ok(snap);
    assert.equal(snap!.delivered, 1);
    assert.deepEqual(snap!.credits, ["GeoFirm"]);
    assert.equal(snap!.seats.find((s) => s.id === seat.id)?.status, "delivered");
  });
});
