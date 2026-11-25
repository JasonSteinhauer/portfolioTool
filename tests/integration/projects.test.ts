import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { seedReportTypes } from "@/lib/db/seed";
import type { Actor } from "@/modules/auth/policy";
import { addLink, getMapData, listLinks, removeLink } from "@/modules/links/service";
import {
  assignReportToProject,
  createProject,
  deleteProject,
  getProject,
  listProjectReports,
  listProjects,
  ProjectNotFoundError,
  updateProject,
} from "@/modules/projects/service";
import { createReport, getReport, ReportNotFoundError } from "@/modules/reports/service";

const client = postgres(inject("testDatabaseUrl"), { max: 2, onnotice: () => {} });
const db = drizzle(client, { schema });

const alice: Actor = { type: "user", userId: "user_projects_alice", role: "owner" };
const mallory: Actor = { type: "user", userId: "user_projects_mallory", role: "owner" };

const project = (title: string, extra: Record<string, string> = {}) => ({
  title,
  summary: "Synthetisches Testprojekt.",
  status: "active",
  startedOn: "2026-10-01",
  endedOn: "",
  ...extra,
});

beforeAll(async () => {
  await seedReportTypes(db);
  await db.insert(schema.users).values([
    { id: alice.userId, name: "Alice", email: "alice-projects@example.test" },
    { id: mallory.userId, name: "Mallory", email: "mallory-projects@example.test" },
  ]);
});

afterAll(async () => {
  await client.end();
});

describe("Projekte", () => {
  it("legt an, validiert, bearbeitet und zählt Reports", async () => {
    const invalid = await createProject(db, alice, project("", { endedOn: "2026-01-01" }));
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(Object.keys(invalid.fieldErrors)).toEqual(expect.arrayContaining(["title", "endedOn"]));

    const created = await createProject(db, alice, project("Lab-Umgebung"));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const second = await createProject(db, alice, project("Lab-Umgebung"));
    if (!second.ok) throw new Error("zweites Projekt fehlgeschlagen");
    const [a, b] = await Promise.all([getProject(db, alice, created.id), getProject(db, alice, second.id)]);
    expect(a.slug).not.toBe(b.slug);

    const report = await createReport(db, alice, { typeKey: "learning" });
    await assignReportToProject(db, alice, report.id, created.id);
    expect((await listProjectReports(db, alice, created.id)).map((r) => r.id)).toEqual([report.id]);
    const listed = await listProjects(db, alice);
    expect(listed.find((p) => p.id === created.id)?.reportCount).toBe(1);

    const updated = await updateProject(db, alice, created.id, project("Lab-Umgebung v2", { status: "completed" }));
    expect(updated.ok).toBe(true);
    expect((await getProject(db, alice, created.id)).status).toBe("completed");
  });

  it("schützt fremde Projekte und Reports", async () => {
    const own = await createProject(db, alice, project("Privat"));
    if (!own.ok) throw new Error();
    const foreignReport = await createReport(db, mallory, { typeKey: "learning" });
    await expect(getProject(db, mallory, own.id)).rejects.toBeInstanceOf(ProjectNotFoundError);
    await expect(assignReportToProject(db, alice, foreignReport.id, own.id)).rejects.toBeInstanceOf(
      ReportNotFoundError,
    );
    const malloryProject = await createProject(db, mallory, project("Fremd"));
    if (!malloryProject.ok) throw new Error();
    const report = await createReport(db, alice, { typeKey: "learning" });
    await expect(assignReportToProject(db, alice, report.id, malloryProject.id)).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
  });

  it("löscht ein Projekt und behält die Reports", async () => {
    const p = await createProject(db, alice, project("Wegwerf"));
    if (!p.ok) throw new Error();
    const report = await createReport(db, alice, { typeKey: "learning" });
    await assignReportToProject(db, alice, report.id, p.id);
    await deleteProject(db, alice, p.id);
    await expect(getProject(db, alice, p.id)).rejects.toBeInstanceOf(ProjectNotFoundError);
    expect((await getReport(db, alice, report.id)).projectId).toBeNull();
    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.targetId, p.id));
    expect(audit.map((e) => e.action)).toEqual(expect.arrayContaining(["project.created", "project.deleted"]));
  });
});

describe("Verknüpfungen", () => {
  it("verknüpft, verhindert Kreise und listet beide Richtungen", async () => {
    const [a, b, c] = await Promise.all(
      ["learning", "activity", "reflection"].map((typeKey) => createReport(db, alice, { typeKey })),
    );
    expect(await addLink(db, alice, a.id, b.id)).toEqual({ ok: true });
    expect(await addLink(db, alice, b.id, c.id)).toEqual({ ok: true });
    // Doppelt ist harmlos.
    expect(await addLink(db, alice, a.id, b.id)).toEqual({ ok: true });

    const cycle = await addLink(db, alice, c.id, a.id);
    expect(cycle.ok).toBe(false);
    expect((await addLink(db, alice, a.id, a.id)).ok).toBe(false);

    const ofB = await listLinks(db, alice, b.id);
    expect(ofB.buildsOn.map((r) => r.id)).toEqual([a.id]);
    expect(ofB.leadsTo.map((r) => r.id)).toEqual([c.id]);

    await removeLink(db, alice, a.id, b.id);
    expect((await listLinks(db, alice, b.id)).buildsOn).toEqual([]);
    // Jetzt ist c → a kein Kreis mehr.
    expect(await addLink(db, alice, c.id, a.id)).toEqual({ ok: true });
  });

  it("verknüpft keine fremden Reports", async () => {
    const own = await createReport(db, alice, { typeKey: "learning" });
    const foreign = await createReport(db, mallory, { typeKey: "learning" });
    await expect(addLink(db, alice, own.id, foreign.id)).rejects.toBeInstanceOf(ReportNotFoundError);
    await expect(addLink(db, mallory, own.id, foreign.id)).rejects.toBeInstanceOf(ReportNotFoundError);
  });

  it("liefert Kartendaten – gefiltert mit externen Nachbarn", async () => {
    const p1 = await createProject(db, alice, project("Karte A"));
    const p2 = await createProject(db, alice, project("Karte B"));
    if (!p1.ok || !p2.ok) throw new Error();
    const [r1, r2, r3] = await Promise.all(
      ["learning", "activity", "reflection"].map((typeKey) => createReport(db, alice, { typeKey })),
    );
    await assignReportToProject(db, alice, r1.id, p1.id);
    await assignReportToProject(db, alice, r2.id, p1.id);
    await assignReportToProject(db, alice, r3.id, p2.id);
    await addLink(db, alice, r1.id, r2.id);
    await addLink(db, alice, r2.id, r3.id);

    const filtered = await getMapData(db, alice, { projectId: p1.id });
    expect(filtered.projects.map((p) => p.id)).toEqual([p1.id]);
    expect(filtered.reports.map((r) => r.id).sort()).toEqual([r1.id, r2.id, r3.id].sort());
    expect(filtered.externalIds).toEqual([r3.id]);
    expect(filtered.links).toHaveLength(2);

    const foreign = await getMapData(db, mallory, { projectId: p1.id });
    expect(foreign.projects).toEqual([]);
    expect(foreign.reports.find((r) => r.id === r1.id)).toBeUndefined();
  });
});

describe("Entwicklung", () => {
  it("legt Fachgebiete und Kompetenzen an und belegt sie mit Reports", async () => {
    const dev = await import("@/modules/development/service");
    expect(await dev.createSubjectArea(db, alice, { name: "Security Operations" })).toEqual({ ok: true });
    expect((await dev.createSubjectArea(db, alice, { name: "Security Operations" })).ok).toBe(false);
    const [area] = await dev.listSubjectAreas(db, alice);
    expect(await dev.createCompetency(db, alice, { name: "Log-Analyse", subjectAreaId: area.id })).toEqual({
      ok: true,
    });
    // Fremdes Fachgebiet wird abgelehnt.
    expect((await dev.createCompetency(db, mallory, { name: "X", subjectAreaId: area.id })).ok).toBe(false);

    const [comp] = await dev.listCompetencies(db, alice);
    const report = await createReport(db, alice, { typeKey: "case-analysis" });
    expect(await dev.attachCompetency(db, alice, report.id, comp.id, "Muster erkannt")).toEqual({ ok: true });
    // Erneut zuordnen aktualisiert nur die Notiz.
    expect(await dev.attachCompetency(db, alice, report.id, comp.id, "Muster bestätigt")).toEqual({ ok: true });
    const [withEvidence] = await dev.listCompetencies(db, alice);
    expect(withEvidence.evidence).toEqual([expect.objectContaining({ reportId: report.id, note: "Muster bestätigt" })]);

    const foreign = await createReport(db, mallory, { typeKey: "learning" });
    await expect(dev.attachCompetency(db, alice, foreign.id, comp.id, "")).rejects.toBeInstanceOf(ReportNotFoundError);
    expect((await dev.attachCompetency(db, mallory, foreign.id, comp.id, "")).ok).toBe(false);

    const timeline = await dev.getTimeline(db, alice);
    expect(timeline.find((e) => e.kind === "report" && e.id === report.id)).toMatchObject({
      competencies: ["Log-Analyse"],
    });
    expect(timeline.some((e) => e.kind === "project" && e.event === "start")).toBe(true);
    expect((await dev.getTimeline(db, mallory)).some((e) => e.id === report.id)).toBe(false);

    await dev.detachCompetency(db, alice, report.id, comp.id);
    expect(await dev.listReportCompetencies(db, alice, report.id)).toEqual([]);
    await dev.deleteCompetency(db, mallory, comp.id);
    expect(await dev.listCompetencies(db, alice)).toHaveLength(1);
  });
});

describe("Unterprojekte", () => {
  it("verschachtelt bis 3 Ebenen, verhindert Kreise und sortiert Geschwister", async () => {
    const mod = await import("@/modules/projects/service");
    const make = async (title: string, parentProjectId = "") => {
      const r = await createProject(db, alice, project(title, { parentProjectId }));
      if (!r.ok) throw new Error(JSON.stringify(r.fieldErrors));
      return r.id;
    };
    const top = await make("Studium (Baum)");
    const mid = await make("Praxisphase (Baum)", top);
    const leaf = await make("KI-Triage (Baum)", mid);

    // Ebene 4 ist zu tief.
    const tooDeep = await createProject(db, alice, project("Zu tief", { parentProjectId: leaf }));
    expect(tooDeep.ok).toBe(false);
    if (!tooDeep.ok) expect(tooDeep.fieldErrors.parentProjectId).toMatch(/3 Ebenen/);
    // Kreis: Studium unter KI-Triage hängen.
    const cycle = await updateProject(db, alice, top, project("Studium (Baum)", { parentProjectId: leaf }));
    expect(cycle.ok).toBe(false);
    // Fremdes Elternprojekt.
    const foreign = await createProject(db, mallory, project("Fremd-Kind", { parentProjectId: top }));
    expect(foreign.ok).toBe(false);

    const tree = mod.toProjectTree(await listProjects(db, alice));
    const ids = tree.map((p) => p.id);
    expect(ids.indexOf(top)).toBeLessThan(ids.indexOf(mid));
    expect(ids.indexOf(mid)).toBeLessThan(ids.indexOf(leaf));
    expect(tree.find((p) => p.id === leaf)?.depth).toBe(3);
    expect(await mod.projectAncestors(db, alice, leaf)).toEqual([
      { id: top, title: "Studium (Baum)" },
      { id: mid, title: "Praxisphase (Baum)" },
    ]);

    // Reports inkl. Unterprojekte und Karte des Projekts samt Unterprojekten.
    const r = await createReport(db, alice, { typeKey: "learning" });
    await assignReportToProject(db, alice, r.id, leaf);
    expect(await listProjectReports(db, alice, top)).toEqual([]);
    expect((await listProjectReports(db, alice, top, { includeSubprojects: true })).map((x) => x.id)).toEqual([r.id]);
    const map = await getMapData(db, alice, { projectId: top });
    expect(map.projects.map((p) => p.id).sort()).toEqual([top, mid, leaf].sort());
    expect(map.reports.map((x) => x.id)).toEqual([r.id]);

    // Sortieren unter Geschwistern.
    const sibling = await make("Zweites Unterprojekt", top);
    await mod.moveProject(db, alice, sibling, -1);
    let children = (await listProjects(db, alice)).filter((p) => p.parentProjectId === top);
    expect(children.sort((a, b) => a.sortOrder - b.sortOrder).map((p) => p.id)).toEqual([sibling, mid]);
    await mod.moveProject(db, alice, sibling, -1); // schon oben: keine Änderung
    children = (await listProjects(db, alice)).filter((p) => p.parentProjectId === top);
    expect(children.sort((a, b) => a.sortOrder - b.sortOrder).map((p) => p.id)).toEqual([sibling, mid]);

    // Löschen: Unterprojekte rücken nach oben.
    await deleteProject(db, alice, mid);
    expect((await getProject(db, alice, leaf)).parentProjectId).toBe(top);
  });
});

describe("Verschieben (Karte)", () => {
  it("hängt Projekte um und lehnt Kreise, zu tiefe Bäume und Fremdes ab", async () => {
    const mod = await import("@/modules/projects/service");
    const make = async (title: string, parentProjectId = "") => {
      const r = await createProject(db, alice, project(title, { parentProjectId }));
      if (!r.ok) throw new Error(JSON.stringify(r.fieldErrors));
      return r.id;
    };
    const a = await make("DnD A");
    const b = await make("DnD B");
    const b1 = await make("DnD B1", b);
    const b2 = await make("DnD B2", b1);

    expect(await mod.setProjectParent(db, alice, a, b)).toEqual({ ok: true });
    expect((await getProject(db, alice, a)).parentProjectId).toBe(b);
    expect((await mod.setProjectParent(db, alice, b, b2)).ok).toBe(false); // Kreis
    expect((await mod.setProjectParent(db, alice, b1, a)).ok).toBe(false); // B1+B2 unter A (Ebene 2) = 4 Ebenen
    expect(await mod.setProjectParent(db, alice, a, null)).toEqual({ ok: true });
    expect((await getProject(db, alice, a)).parentProjectId).toBeNull();

    const foreign = await createProject(db, mallory, project("DnD fremd"));
    if (!foreign.ok) throw new Error();
    await expect(mod.setProjectParent(db, alice, a, foreign.id)).rejects.toBeInstanceOf(ProjectNotFoundError);
    await expect(mod.setProjectParent(db, mallory, a, null)).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});
