import { describe, expect, it } from "vitest";
import type { MapData } from "@/modules/links/service";
import { layoutMap, NODE_H, NODE_W, NO_PROJECT } from "@/ui/map/layout";

const report = (id: string, projectId: string | null = null) => ({
  id,
  title: id,
  typeName: "Lernbericht",
  status: "draft",
  projectId,
});

function overlaps(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < NODE_H;
}

describe("Karten-Layout", () => {
  const data: MapData = {
    projects: [
      { id: "p1", title: "Projekt 1", status: "active" },
      { id: "p2", title: "Projekt 2", status: "active" },
    ],
    reports: [report("a", "p1"), report("b", "p1"), report("c", "p1"), report("d", "p2"), report("e")],
    links: [
      { source: "a", target: "c" },
      { source: "b", target: "c" },
      { source: "c", target: "d" },
    ],
    externalIds: [],
  };

  it("ordnet Ebenen nach dem längsten Weg von oben nach unten", () => {
    const layout = layoutMap(data);
    const layer = Object.fromEntries(layout.nodes.map((n) => [n.id, n.layer]));
    expect(layer).toMatchObject({ p1: 0, p2: 0, a: 1, b: 1, c: 2, d: 3, e: 1 });
    expect(layout.nodes.find((n) => n.id === NO_PROJECT)?.virtual).toBe(true);
    for (const e of layout.edges) {
      const s = layout.nodes.find((n) => n.id === e.source)!;
      const t = layout.nodes.find((n) => n.id === e.target)!;
      expect(t.y).toBeGreaterThan(s.y);
    }
  });

  it("zeichnet Projektkanten nur zu Reports ohne Eltern im selben Projekt", () => {
    const projectEdges = layoutMap(data)
      .edges.filter((e) => e.kind === "project")
      .map((e) => `${e.source}>${e.target}`)
      .sort();
    // d hat einen Eltern-Report (c) – aber aus Projekt 1, daher gehört d sichtbar zu Projekt 2.
    expect(projectEdges).toEqual(["p1>a", "p1>b", "p2>d", `${NO_PROJECT}>e`].sort());
  });

  it("lässt keine Knoten überlappen und hält die Fläche groß genug", () => {
    const layout = layoutMap(data);
    for (const a of layout.nodes)
      for (const b of layout.nodes) if (a !== b) expect(overlaps(a, b), `${a.id}/${b.id}`).toBe(false);
    for (const n of layout.nodes) {
      expect(n.x + NODE_W).toBeLessThanOrEqual(layout.width);
      expect(n.y + NODE_H).toBeLessThanOrEqual(layout.height);
    }
  });

  it("übersteht Kreise in fehlerhaften Daten", () => {
    const layout = layoutMap({
      projects: [],
      reports: [report("x"), report("y")],
      links: [
        { source: "x", target: "y" },
        { source: "y", target: "x" },
      ],
      externalIds: [],
    });
    expect(layout.nodes).toHaveLength(3);
  });

  it("kommt mit leerer Karte zurecht", () => {
    const layout = layoutMap({ projects: [], reports: [], links: [], externalIds: [] });
    expect(layout.nodes).toEqual([]);
    expect(layout.width).toBeGreaterThan(0);
  });
});

describe("Karten-Layout mit Unterprojekten", () => {
  it("legt Unterprojekte unter ihr Projekt und Reports darunter", () => {
    const layout = layoutMap({
      projects: [
        { id: "p1", title: "Studium", status: "active", parentProjectId: null },
        { id: "p2", title: "Praxisphase", status: "active", parentProjectId: "p1" },
        { id: "p3", title: "KI-Triage", status: "active", parentProjectId: "p2" },
      ],
      reports: [report("a", "p3"), report("b", "p1")],
      links: [],
      externalIds: [],
    });
    expect(layout.projectRows).toBe(3);
    const node = (id: string) => layout.nodes.find((n) => n.id === id)!;
    expect([node("p1").layer, node("p2").layer, node("p3").layer]).toEqual([0, 1, 2]);
    expect(node("p2").label).toBe("Unterprojekt");
    expect(node("a").layer).toBe(3);
    expect(node("b").layer).toBe(3);
    const projectEdges = layout.edges.map((e) => `${e.source}>${e.target}`).sort();
    expect(projectEdges).toEqual(["p1>b", "p1>p2", "p2>p3", "p3>a"]);
    for (const a of layout.nodes)
      for (const b of layout.nodes) if (a !== b) expect(overlaps(a, b), `${a.id}/${b.id}`).toBe(false);
  });

  it("übersteht Projekt-Kreise in fehlerhaften Daten", () => {
    const layout = layoutMap({
      projects: [
        { id: "x", title: "X", status: "active", parentProjectId: "y" },
        { id: "y", title: "Y", status: "active", parentProjectId: "x" },
      ],
      reports: [],
      links: [],
      externalIds: [],
    });
    expect(layout.nodes).toHaveLength(2);
  });
});

describe("Karten-Layout: Reports neben fremden Unterprojekten", () => {
  it("stellt einen Report des Projekts neben – nicht unter – ein Unterprojekt", () => {
    const layout = layoutMap({
      projects: [
        { id: "soc", title: "Arbeit im SOC", status: "active", parentProjectId: null },
        { id: "siem", title: "SIEM lernen", status: "active", parentProjectId: "soc" },
      ],
      reports: [report("taetigkeit", "soc"), report("siem-1", "siem")],
      links: [],
      externalIds: [],
    });
    const node = (id: string) => layout.nodes.find((n) => n.id === id)!;
    // Der Report des Unterprojekts steht unter dem Unterprojekt …
    expect(node("siem-1").x).toBe(node("siem").x);
    // … der Report des Hauptprojekts daneben.
    expect(Math.abs(node("taetigkeit").x - node("siem").x)).toBeGreaterThanOrEqual(NODE_W);
    // Das Hauptprojekt steht mittig über beidem.
    expect(node("soc").x).toBeCloseTo((node("taetigkeit").x + node("siem").x) / 2);
  });

  it("reserviert auch für leere Unterprojekte eine eigene Spalte", () => {
    const layout = layoutMap({
      projects: [
        { id: "soc", title: "Arbeit im SOC", status: "active", parentProjectId: null },
        { id: "siem", title: "SIEM lernen", status: "active", parentProjectId: "soc" },
      ],
      reports: [report("taetigkeit", "soc")],
      links: [],
      externalIds: [],
    });
    const node = (id: string) => layout.nodes.find((n) => n.id === id)!;
    expect(Math.abs(node("taetigkeit").x - node("siem").x)).toBeGreaterThanOrEqual(NODE_W);
  });
});
