import type { MapData } from "@/modules/links/service";

/**
 * Ordnet Projekte, Unterprojekte und Reports in Ebenen von oben nach unten an (reine Funktion, ohne DOM).
 *
 * - Oben die Projekte, darunter ihre Unterprojekte (je Ebene eine Zeile; plus „Ohne Projekt“, falls nötig).
 * - Darunter die Reports: ein Report liegt eine Ebene unter seinem tiefsten Eltern-Report.
 * - Innerhalb einer Ebene nach Projekt-Baum gruppiert, dann möglichst unter den Eltern (Baryzentrum).
 */

export const NODE_W = 232;
export const NODE_H = 84;
export const GAP_X = 32;
export const ROW_GAP = 88;
export const MARGIN_X = 104;
export const MARGIN_Y = 32;
export const NO_PROJECT = "__none__";

export type LayoutNode = {
  id: string;
  kind: "project" | "report";
  title: string;
  /** Report-Typ bzw. „Projekt“ / „Unterprojekt“. */
  label: string;
  status: string;
  layer: number;
  x: number;
  y: number;
  external: boolean;
  /** Platzhalter „Ohne Projekt“. */
  virtual: boolean;
};

export type LayoutEdge = {
  source: string;
  target: string;
  kind: "project" | "link";
  path: string;
};

export type Layout = {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
  layers: number;
  /** Anzahl der Zeilen, die Projekte/Unterprojekte belegen (≥ 1). */
  projectRows: number;
};

function edgePath(a: LayoutNode, b: LayoutNode, kind: LayoutEdge["kind"] = "link"): string {
  const x1 = a.x + NODE_W / 2;
  const y1 = a.y + NODE_H;
  const x2 = b.x + NODE_W / 2;
  const y2 = b.y;
  // Projekt-Kanten über mehrere Zeilen: sofort in der ersten Lücke abbiegen, dann senkrecht in der
  // eigenen Spalte nach unten – so laufen sie nicht durch Unterprojekte anderer Spalten.
  if (kind === "project" && y2 - y1 > ROW_GAP + 1) {
    const g = ROW_GAP;
    return `M${x1} ${y1} C${x1} ${y1 + g / 2},${x2} ${y1 + g / 2},${x2} ${y1 + g} L${x2} ${y2}`;
  }
  const mid = y1 + Math.min(ROW_GAP, (y2 - y1) / 2);
  return `M${x1} ${y1} C${x1} ${mid},${x2} ${y2 - (mid - y1)},${x2} ${y2}`;
}

const rowY = (layer: number) => MARGIN_Y + layer * (NODE_H + ROW_GAP);

export function layoutMap(data: MapData): Layout {
  const reportIds = new Set(data.reports.map((r) => r.id));
  const links = data.links.filter((l) => reportIds.has(l.source) && reportIds.has(l.target) && l.source !== l.target);
  const external = new Set(data.externalIds);
  const projectIds = new Set(data.projects.map((p) => p.id));
  const parentOf = (id: string) => {
    const parent = data.projects.find((p) => p.id === id)?.parentProjectId ?? null;
    return parent && projectIds.has(parent) && parent !== id ? parent : null;
  };

  // --- Projekt-Baum: Ebene je Projekt und Vorordnung (für die Gruppierung) -----------
  const projectDepth = new Map<string, number>();
  const preorder: string[] = [];
  const visit = (parent: string | null, depth: number) => {
    for (const p of data.projects) {
      if (parentOf(p.id) !== parent || projectDepth.has(p.id)) continue;
      projectDepth.set(p.id, depth);
      preorder.push(p.id);
      visit(p.id, depth + 1);
    }
  };
  visit(null, 0);
  // Kreise in fehlerhaften Daten: übrig gebliebene Projekte oben einordnen.
  for (const p of data.projects) {
    if (!projectDepth.has(p.id)) {
      projectDepth.set(p.id, 0);
      preorder.push(p.id);
    }
  }
  const projectRows = Math.max(0, ...projectDepth.values()) + 1;

  // --- Tiefe je Report: längster Weg (Kahn, zyklenfest: Reste landen unten) -------------
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const r of data.reports) {
    parents.set(r.id, []);
    children.set(r.id, []);
  }
  for (const l of links) {
    parents.get(l.target)!.push(l.source);
    children.get(l.source)!.push(l.target);
  }
  const depth = new Map<string, number>();
  const indeg = new Map(data.reports.map((r) => [r.id, parents.get(r.id)!.length]));
  const queue = data.reports.filter((r) => indeg.get(r.id) === 0).map((r) => r.id);
  for (const id of queue) depth.set(id, 0);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const c of children.get(id)!) {
      depth.set(c, Math.max(depth.get(c) ?? 0, depth.get(id)! + 1));
      indeg.set(c, indeg.get(c)! - 1);
      if (indeg.get(c) === 0) queue.push(c);
    }
  }
  const maxDepth = Math.max(0, ...depth.values());
  for (const r of data.reports) if (!depth.has(r.id)) depth.set(r.id, maxDepth + 1);

  // --- Gruppen (Projekt-Baum-Reihenfolge) ---------------------------------------------
  const reportById = new Map(data.reports.map((r) => [r.id, r]));
  const groupOf = (r: MapData["reports"][number]) =>
    r.projectId && projectIds.has(r.projectId) ? r.projectId : external.has(r.id) ? "__ext__" : NO_PROJECT;
  const hasUnassigned = data.reports.some((r) => groupOf(r) === NO_PROJECT);

  // --- Knoten anlegen ----------------------------------------------------------------
  const nodes = new Map<string, LayoutNode>();
  const byLayer: LayoutNode[][] = Array.from({ length: projectRows }, () => []);
  for (const id of preorder) {
    const p = data.projects.find((x) => x.id === id)!;
    const layer = projectDepth.get(id)!;
    const node: LayoutNode = {
      id,
      kind: "project",
      title: p.title,
      label: layer === 0 ? "Projekt" : "Unterprojekt",
      status: p.status,
      layer,
      x: 0,
      y: rowY(layer),
      external: false,
      virtual: false,
    };
    nodes.set(id, node);
    byLayer[layer].push(node);
  }
  if (hasUnassigned) {
    const node: LayoutNode = {
      id: NO_PROJECT,
      kind: "project",
      title: "Ohne Projekt",
      label: "Sammelstelle",
      status: "",
      layer: 0,
      x: 0,
      y: rowY(0),
      external: false,
      virtual: true,
    };
    nodes.set(NO_PROJECT, node);
    byLayer[0].push(node);
  }
  for (const r of data.reports) {
    const layer = projectRows + depth.get(r.id)!;
    const node: LayoutNode = {
      id: r.id,
      kind: "report",
      title: r.title,
      label: r.typeName,
      status: r.status,
      layer,
      x: 0,
      y: rowY(layer),
      external: external.has(r.id),
      virtual: false,
    };
    nodes.set(r.id, node);
    (byLayer[layer] ??= []).push(node);
  }
  for (let i = 0; i < byLayer.length; i++) byLayer[i] ??= [];

  // --- Kanten --------------------------------------------------------------------------
  const edgeList: { source: string; target: string; kind: LayoutEdge["kind"] }[] = [];
  for (const id of preorder) {
    const parent = parentOf(id);
    if (parent) edgeList.push({ source: parent, target: id, kind: "project" });
  }
  // Projekt → Report nur, wenn der Report keinen Eltern-Report im selben Projekt hat.
  for (const r of data.reports) {
    const g = groupOf(r);
    if (g === "__ext__") continue;
    const sameGroupParent = parents.get(r.id)!.some((p) => groupOf(reportById.get(p)!) === g);
    if (!sameGroupParent) edgeList.push({ source: g, target: r.id, kind: "project" });
  }
  for (const l of links) edgeList.push({ source: l.source, target: l.target, kind: "link" });
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const e of edgeList) {
    (incoming.get(e.target) ?? incoming.set(e.target, []).get(e.target)!).push(e.source);
    (outgoing.get(e.source) ?? outgoing.set(e.source, []).get(e.source)!).push(e.target);
  }

  // --- Positionen: jedes Projekt bekommt einen eigenen Spaltenbereich -------------------
  // Innerhalb eines Projekts: zuerst die Unterprojekte (je eigener Bereich), daneben die eigenen
  // Reports. So steht ein Report nie unter einem Unterprojekt, zu dem er nicht gehört.
  const step = NODE_W + GAP_X;
  const colX = (col: number) => MARGIN_X + col * step;
  const reportLayers = byLayer.slice(projectRows);
  const reportsOfGroup = (group: string) =>
    reportLayers.map((layer) => layer.filter((n) => groupOf(reportById.get(n.id)!) === group));

  // Reports einer Gruppe Ebene für Ebene in ihre Spalten legen – möglichst unter ihre Eltern.
  const placeGroupReports = (group: string, firstCol: number): number => {
    const layers = reportsOfGroup(group);
    const width = Math.max(0, ...layers.map((l) => l.length));
    for (const layer of layers) {
      const desired = (n: LayoutNode) => {
        const xs = (incoming.get(n.id) ?? [])
          .map((id) => nodes.get(id))
          .filter((p): p is LayoutNode => Boolean(p && p.kind === "report" && groupOf(reportById.get(p.id)!) === group))
          .map((p) => p.x);
        return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.POSITIVE_INFINITY;
      };
      layer.sort((a, b) => desired(a) - desired(b) || a.title.localeCompare(b.title, "de"));
      // Freie Spalten im Gruppenbereich; jeder Report nimmt die nächstliegende freie Spalte zu seinem Wunsch.
      const free = Array.from({ length: width }, (_, i) => firstCol + i);
      for (const n of layer) {
        const want = desired(n);
        let best = 0;
        if (Number.isFinite(want)) {
          let dist = Number.POSITIVE_INFINITY;
          free.forEach((c, i) => {
            const d = Math.abs(colX(c) - want);
            if (d < dist) {
              dist = d;
              best = i;
            }
          });
        }
        n.x = colX(free.splice(best, 1)[0]);
      }
    }
    return width;
  };

  const childProjects = (parent: string | null) => preorder.filter((id) => parentOf(id) === parent);
  const placeProject = (id: string, firstCol: number): number => {
    let col = firstCol;
    for (const child of childProjects(id)) col = placeProject(child, col);
    col += placeGroupReports(id, col);
    if (col === firstCol) col += 1; // leeres Projekt: eine Spalte für sich selbst
    nodes.get(id)!.x = MARGIN_X + ((firstCol + col - 1) / 2) * step;
    return col;
  };

  let col = 0;
  const placed = new Set<string>();
  const placeRoot = (id: string) => {
    col = placeProject(id, col);
    for (const p of [id, ...preorder.filter((x) => parentOf(x) === id)]) placed.add(p);
  };
  for (const root of childProjects(null)) placeRoot(root);
  // Projekte aus fehlerhaften Kreisen: einzeln anhängen.
  for (const id of preorder) {
    if (!placed.has(id) && parentOf(id) !== null && !childProjects(null).includes(id)) {
      const reachableFromRoot = (() => {
        let cur: string | null = id;
        const seen = new Set<string>();
        while (cur && !seen.has(cur)) {
          seen.add(cur);
          cur = parentOf(cur);
        }
        return cur === null;
      })();
      if (!reachableFromRoot) {
        nodes.get(id)!.x = colX(col);
        col += 1 + placeGroupReports(id, col + 1);
      }
    }
  }
  if (hasUnassigned) {
    const start = col;
    col += Math.max(1, placeGroupReports(NO_PROJECT, col));
    nodes.get(NO_PROJECT)!.x = MARGIN_X + ((start + col - 1) / 2) * step;
  }
  col += placeGroupReports("__ext__", col);

  const all = [...nodes.values()];
  const width = Math.max(...all.map((n) => n.x + NODE_W), MARGIN_X + NODE_W) + MARGIN_X / 2;
  const height = MARGIN_Y * 2 + (byLayer.length - 1) * (NODE_H + ROW_GAP) + NODE_H;
  const edges: LayoutEdge[] = edgeList.map((e) => ({
    ...e,
    path: edgePath(nodes.get(e.source)!, nodes.get(e.target)!, e.kind),
  }));
  return {
    nodes: all,
    edges,
    width,
    height,
    layers: byLayer.filter((l) => l.length > 0).length,
    projectRows,
  };
}
