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

function edgePath(a: LayoutNode, b: LayoutNode): string {
  const x1 = a.x + NODE_W / 2;
  const y1 = a.y + NODE_H;
  const x2 = b.x + NODE_W / 2;
  const y2 = b.y;
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
  const groupIndex = new Map([...preorder, NO_PROJECT, "__ext__"].map((g, i) => [g, i]));

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

  // --- Positionen ----------------------------------------------------------------------
  const step = NODE_W + GAP_X;
  const place = (layer: LayoutNode[], desired: (n: LayoutNode) => number) => {
    let next = MARGIN_X;
    for (const n of layer) {
      n.x = Math.max(desired(n), next);
      next = n.x + step;
    }
  };
  const meanOf = (ids: string[] | undefined) => {
    const xs = (ids ?? []).map((id) => nodes.get(id)?.x).filter((x): x is number => x !== undefined);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.NaN;
  };
  const centerOverChildren = (n: LayoutNode) => {
    const xs = (outgoing.get(n.id) ?? []).map((id) => nodes.get(id)!.x);
    return xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : Number.NaN;
  };
  const groupRank = (n: LayoutNode) =>
    n.kind === "report" ? (groupIndex.get(groupOf(reportById.get(n.id)!)) ?? 99) : (groupIndex.get(n.id) ?? 99);
  const reportLayers = byLayer.slice(projectRows);
  const projectLayers = byLayer.slice(0, projectRows);

  // 1. Reports dicht packen: nach Projekt-Baum, dann Eltern-Mitte, dann Titel.
  for (const layer of reportLayers) {
    const m = (n: LayoutNode) => {
      const v = meanOf(incoming.get(n.id));
      return Number.isNaN(v) ? Number.POSITIVE_INFINITY : v;
    };
    layer.sort((a, b) => groupRank(a) - groupRank(b) || m(a) - m(b) || a.title.localeCompare(b.title, "de"));
    place(layer, () => MARGIN_X);
  }
  // 2. Projekte von unten nach oben über ihre Kinder ziehen (Reihenfolge = Baum).
  const placeProjects = () => {
    for (let i = projectLayers.length - 1; i >= 0; i--) {
      const layer = projectLayers[i];
      layer.sort((a, b) => groupRank(a) - groupRank(b));
      place(layer, (n) => {
        const c = centerOverChildren(n);
        return Number.isNaN(c) ? MARGIN_X : c;
      });
    }
  };
  placeProjects();
  // 3. Reports unter ihre Eltern ziehen (ohne Überlappung), dann Projekte erneut zentrieren.
  for (const layer of reportLayers) {
    place(layer, (n) => {
      const v = meanOf(incoming.get(n.id));
      return Number.isNaN(v) ? MARGIN_X : v;
    });
  }
  placeProjects();

  const all = [...nodes.values()];
  const width = Math.max(...all.map((n) => n.x + NODE_W), MARGIN_X + NODE_W) + MARGIN_X / 2;
  const height = MARGIN_Y * 2 + (byLayer.length - 1) * (NODE_H + ROW_GAP) + NODE_H;
  const edges: LayoutEdge[] = edgeList.map((e) => ({
    ...e,
    path: edgePath(nodes.get(e.source)!, nodes.get(e.target)!),
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
