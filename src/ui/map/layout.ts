import type { MapData } from "@/modules/links/service";

/**
 * Ordnet Projekte und Reports in Ebenen von oben nach unten an (reine Funktion, ohne DOM).
 *
 * - Ebene 0: Projekte (plus „Ohne Projekt“, falls nötig).
 * - Ebene n: Reports, deren längster Weg über Verknüpfungen von einer Wurzel aus n-1 lang ist.
 * - Innerhalb einer Ebene: nach Projekt gruppiert, dann möglichst unter den Eltern (Baryzentrum).
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
  /** Report-Typ bzw. „Projekt“. */
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
};

function edgePath(a: LayoutNode, b: LayoutNode): string {
  const x1 = a.x + NODE_W / 2;
  const y1 = a.y + NODE_H;
  const x2 = b.x + NODE_W / 2;
  const y2 = b.y;
  const mid = y1 + Math.min(ROW_GAP, (y2 - y1) / 2);
  return `M${x1} ${y1} C${x1} ${mid},${x2} ${y2 - (mid - y1)},${x2} ${y2}`;
}

export function layoutMap(data: MapData): Layout {
  const reportIds = new Set(data.reports.map((r) => r.id));
  const links = data.links.filter((l) => reportIds.has(l.source) && reportIds.has(l.target) && l.source !== l.target);
  const external = new Set(data.externalIds);
  const projectIds = new Set(data.projects.map((p) => p.id));

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

  // --- Gruppen (Projekt-Reihenfolge) -------------------------------------------------
  const groupOf = (r: MapData["reports"][number]) =>
    r.projectId && projectIds.has(r.projectId) ? r.projectId : external.has(r.id) ? "__ext__" : NO_PROJECT;
  const hasUnassigned = data.reports.some((r) => groupOf(r) === NO_PROJECT);
  const groupOrder = [...data.projects.map((p) => p.id), NO_PROJECT, "__ext__"];
  const groupIndex = new Map(groupOrder.map((g, i) => [g, i]));

  // --- Knoten anlegen ----------------------------------------------------------------
  const nodes = new Map<string, LayoutNode>();
  const topNodes: LayoutNode[] = data.projects.map((p) => ({
    id: p.id,
    kind: "project",
    title: p.title,
    label: "Projekt",
    status: p.status,
    layer: 0,
    x: 0,
    y: MARGIN_Y,
    external: false,
    virtual: false,
  }));
  if (hasUnassigned) {
    topNodes.push({
      id: NO_PROJECT,
      kind: "project",
      title: "Ohne Projekt",
      label: "Sammelstelle",
      status: "",
      layer: 0,
      x: 0,
      y: MARGIN_Y,
      external: false,
      virtual: true,
    });
  }
  for (const n of topNodes) nodes.set(n.id, n);

  const byLayer: LayoutNode[][] = [topNodes];
  for (const r of data.reports) {
    const layer = depth.get(r.id)! + 1;
    const node: LayoutNode = {
      id: r.id,
      kind: "report",
      title: r.title,
      label: r.typeName,
      status: r.status,
      layer,
      x: 0,
      y: MARGIN_Y + layer * (NODE_H + ROW_GAP),
      external: external.has(r.id),
      virtual: false,
    };
    nodes.set(r.id, node);
    (byLayer[layer] ??= []).push(node);
  }
  for (let i = 0; i < byLayer.length; i++) byLayer[i] ??= [];

  // --- Kanten: Projekt → Report nur, wenn der Report keinen Eltern-Report im selben Projekt hat.
  const edgeList: { source: string; target: string; kind: LayoutEdge["kind"] }[] = [];
  const reportById = new Map(data.reports.map((r) => [r.id, r]));
  for (const r of data.reports) {
    const g = groupOf(r);
    if (g === "__ext__") continue;
    const sameGroupParent = parents.get(r.id)!.some((p) => groupOf(reportById.get(p)!) === g);
    if (!sameGroupParent) edgeList.push({ source: g, target: r.id, kind: "project" });
  }
  for (const l of links) edgeList.push({ source: l.source, target: l.target, kind: "link" });
  const incoming = new Map<string, string[]>();
  for (const e of edgeList) (incoming.get(e.target) ?? incoming.set(e.target, []).get(e.target)!).push(e.source);

  // --- Reihenfolge & Position --------------------------------------------------------
  const step = NODE_W + GAP_X;
  const place = (layer: LayoutNode[], desired: (n: LayoutNode) => number) => {
    let next = MARGIN_X;
    for (const n of layer) {
      n.x = Math.max(desired(n), next);
      next = n.x + step;
    }
  };
  // 1. Durchgang: dicht packen, Ebene für Ebene nach Gruppe + Eltern-Mitte sortiert.
  place(topNodes, () => MARGIN_X);
  const mean = (n: LayoutNode) => {
    const xs = (incoming.get(n.id) ?? []).map((p) => nodes.get(p)?.x).filter((x): x is number => x !== undefined);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.POSITIVE_INFINITY;
  };
  for (let i = 1; i < byLayer.length; i++) {
    const layer = byLayer[i];
    const group = (n: LayoutNode) => groupIndex.get(groupOf(reportById.get(n.id)!)) ?? 99;
    layer.sort((a, b) => group(a) - group(b) || mean(a) - mean(b) || a.title.localeCompare(b.title, "de"));
    place(layer, () => MARGIN_X);
  }
  // 2. Projekte über ihre Reports der ersten Ebene ziehen.
  const projectTarget = (p: LayoutNode) => {
    const xs = edgeList.filter((e) => e.source === p.id).map((e) => nodes.get(e.target)!.x);
    return xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : MARGIN_X;
  };
  topNodes.sort((a, b) => projectTarget(a) - projectTarget(b));
  place(topNodes, projectTarget);
  // 3. Reports unter ihre Eltern ziehen (ohne Überlappung).
  for (let i = 1; i < byLayer.length; i++) {
    place(byLayer[i], (n) => {
      const m = mean(n);
      return Number.isFinite(m) ? m : MARGIN_X;
    });
  }

  const all = [...nodes.values()];
  const width = Math.max(...all.map((n) => n.x + NODE_W), MARGIN_X + NODE_W) + MARGIN_X / 2;
  const layers = byLayer.filter((l) => l.length > 0).length;
  const height = MARGIN_Y * 2 + (byLayer.length - 1) * (NODE_H + ROW_GAP) + NODE_H;

  const edges: LayoutEdge[] = edgeList.map((e) => ({
    ...e,
    path: edgePath(nodes.get(e.source)!, nodes.get(e.target)!),
  }));
  return { nodes: all, edges, width, height, layers };
}
