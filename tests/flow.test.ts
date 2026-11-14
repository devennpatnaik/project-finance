import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import {
  addDelivery,
  claimSeat,
  createProject,
  getProject,
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
    const operator = await upsertProfile(
      "user:op",
      "River Ops",
      "operator",
      "op@example.com",
    );
    assert.equal(operator.type, "operator");
    assert.equal(operator.email, "op@example.com");

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

    await inviteToSeat(operator, seat.id, {
      firmEmail: "geo@example.com",
    });

    const firm = await upsertProfile(
      "user:firm",
      "GeoFirm",
      "firm",
      "geo@example.com",
    );
    const firmProjects = await listProjectsForViewer(firm.sub);
    assert.ok(
      firmProjects.some((p) => p.id === project.id),
      "invited firm sees project",
    );

    const claimed = await claimSeat(firm, seat.id);
    assert.equal(claimed.status, "claimed");
    assert.equal(claimed.claimed_by_name, "GeoFirm");
    assert.equal(claimed.claimed_by_sub, firm.sub);

    const delivery = await addDelivery(firm, seat.id, {
      path: "reports/geo-v1.pdf",
      note: "Borehole summary",
    });
    assert.equal(delivery.credit, "GeoFirm");
    assert.equal(delivery.credit_sub, firm.sub);

    const snap = await projectSnapshot(project.id, operator.sub);
    assert.ok(snap);
    assert.equal(snap!.delivered, 1);
    assert.deepEqual(snap!.credits, ["GeoFirm"]);
    assert.equal(snap!.seats.find((s) => s.id === seat.id)?.status, "delivered");
  });

  it("display-name spoofing does not grant project access or seat claim", async () => {
    const operator = await upsertProfile(
      "user:op2",
      "Ops Two",
      "operator",
      "op2@example.com",
    );
    const project = await createProject(operator, "Dam C", "Mid reach");
    const seat = await openSeat(operator, project.id, "feasibility", 10_000, 20_000);
    await inviteToSeat(operator, seat.id, { firmEmail: "real-firm@example.com" });

    const spoof = await upsertProfile(
      "user:spoof",
      "real-firm@example.com",
      "firm",
      "spoof@example.com",
    );
    const listed = await listProjectsForViewer(spoof.sub);
    assert.ok(
      !listed.some((p) => p.id === project.id),
      "spoofed display name must not reveal project",
    );
    assert.equal(await getProject(project.id, spoof.sub), null);
    await assert.rejects(
      () => claimSeat(spoof, seat.id),
      /not invited/i,
    );

    const real = await upsertProfile(
      "user:real-firm",
      "Acme Geo",
      "firm",
      "real-firm@example.com",
    );
    assert.ok(
      (await listProjectsForViewer(real.sub)).some((p) => p.id === project.id),
    );
    const claimed = await claimSeat(real, seat.id);
    assert.equal(claimed.claimed_by_sub, real.sub);

    const delivery = await addDelivery(real, seat.id, {
      path: "out.pdf",
      note: "done",
    });
    assert.equal(delivery.credit, "Acme Geo");
    assert.equal(delivery.credit_sub, real.sub);
  });

  it("rejects oversized text and enforces create caps", async () => {
    const operator = await upsertProfile(
      "user:op3",
      "Ops Three",
      "operator",
      "op3@example.com",
    );
    await assert.rejects(
      () => createProject(operator, "x".repeat(101), "site"),
      /at most 100/i,
    );
    const project = await createProject(operator, "Dam D", "Upper");
    const seat = await openSeat(operator, project.id, "feed");
    await assert.rejects(
      () =>
        inviteToSeat(operator, seat.id, {
          firmEmail: "not-an-email",
        }),
      /valid email/i,
    );
  });
});
