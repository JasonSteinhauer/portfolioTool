"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useSyncExternalStore, useTransition, type DragEvent } from "react";
import { moveNodeAction } from "@/app/app/projects/actions";
import { cn } from "@/ui/cn";
import { MARGIN_Y, NO_PROJECT, NODE_H, NODE_W, ROW_GAP, type Layout, type LayoutNode } from "./layout";

const STATUS: Record<string, string> = {
  draft: "Entwurf",
  final: "Abgeschlossen",
  archived: "Archiviert",
  planned: "Geplant",
  active: "Aktiv",
  paused: "Pausiert",
  completed: "Abgeschlossen",
};

const DRAG_TYPE = "application/x-dp-node";
const noopSubscribe = () => () => {};

/**
 * Karte der Projekte und Reports (von oben nach unten).
 *
 * - Positioniert nur über SVG-Attribute – die strikte CSP der Produktion erlaubt keine Inline-Styles.
 * - Knoten sind echte Links (in `foreignObject`): Tastatur und Screenreader funktionieren.
 * - Drag & Drop (Maus): Report auf ein Projekt ziehen = zuordnen; Projekt auf ein Projekt = Unterprojekt;
 *   auf „Ohne Projekt“ = lösen bzw. oberste Ebene. Gleichwertige Alternative ohne Ziehen bietet das
 *   Seitenfeld der Karte („Verschieben nach …“, WCAG 2.5.7).
 */
export function ReportMap({
  layout,
  selectedId,
  hrefs,
  draggable = false,
}: {
  layout: Layout;
  selectedId?: string;
  /** Ziel-URL je Knoten-ID. */
  hrefs: Record<string, string>;
  draggable?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragging, setDraggingState] = useState<LayoutNode | null>(null);
  // Ref zusätzlich zum State: Drag-Ereignisse folgen schneller aufeinander, als React neu rendert.
  const draggingRef = useRef<LayoutNode | null>(null);
  const setDragging = (n: LayoutNode | null) => {
    draggingRef.current = n;
    setDraggingState(n);
  };
  const [overId, setOverId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  // Erst nach der Hydrierung sind die Drag-Handler aktiv (Signal für Tests und Hilfstechnik).
  const ready = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const nodeById = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout.nodes]);
  // Projekt-Baum aus den Kanten (nur Projekt → Projekt), für die Kreisprüfung beim Ziehen.
  const projectChildren = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of layout.edges) {
      if (nodeById.get(e.source)?.kind === "project" && nodeById.get(e.target)?.kind === "project") {
        (map.get(e.source) ?? map.set(e.source, []).get(e.source)!).push(e.target);
      }
    }
    return map;
  }, [layout.edges, nodeById]);
  const currentParent = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of layout.edges) if (e.kind === "project") map.set(e.target, e.source);
    return map;
  }, [layout.edges]);

  const isDescendant = (ancestor: string, id: string) => {
    const stack = [...(projectChildren.get(ancestor) ?? [])];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const next = stack.pop()!;
      if (next === id) return true;
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(...(projectChildren.get(next) ?? []));
    }
    return false;
  };

  const canDropFor = (dragging: LayoutNode | null, target: LayoutNode) => {
    if (!dragging || target.kind !== "project" || target.id === dragging.id) return false;
    if (dragging.kind === "project" && !target.virtual && isDescendant(dragging.id, target.id)) return false;
    // Projekte der obersten Ebene haben keine Kante zu „Ohne Projekt“ – dorthin wäre ein No-op.
    if (dragging.kind === "project" && target.virtual && !currentParent.has(dragging.id)) return false;
    return currentParent.get(dragging.id) !== target.id;
  };
  /** In Ereignis-Handlern: aktueller Stand aus der Ref. */
  const canDrop = (target: LayoutNode) => canDropFor(draggingRef.current, target);

  const drop = (target: LayoutNode) => {
    const node = draggingRef.current;
    if (!node || !canDrop(target)) {
      setDragging(null);
      setOverId(null);
      return;
    }
    setDragging(null);
    setOverId(null);
    const destination = target.virtual
      ? node.kind === "report"
        ? "„Ohne Projekt“"
        : "die oberste Ebene"
      : `„${target.title}“`;
    const fd = new FormData();
    fd.set("kind", node.kind);
    fd.set("nodeId", node.id);
    fd.set("targetId", target.virtual ? "" : target.id);
    fd.set("doneMessage", `„${node.title}“ nach ${destination} verschoben.`);
    startTransition(async () => {
      const result = await moveNodeAction({}, fd);
      setStatus(result.error ? { text: result.error, error: true } : { text: result.message ?? "", error: false });
      router.refresh();
    });
  };

  const related = new Set<string>();
  if (selectedId) {
    for (const e of layout.edges) {
      if (e.source === selectedId) related.add(e.target);
      if (e.target === selectedId) related.add(e.source);
    }
  }
  const rows = Math.round((layout.height - MARGIN_Y * 2 - NODE_H) / (NODE_H + ROW_GAP)) + 1;
  const ordered = [...layout.nodes].sort((a, b) => a.layer - b.layer || a.x - b.x);

  return (
    <div className="flex flex-col gap-2">
      {draggable ? (
        <p className="text-xs text-text-secondary">
          Tipp: Reports auf ein Projekt ziehen, um sie zuzuordnen – Projekte auf ein Projekt, um sie unterzuordnen.
          „Ohne Projekt“ löst die Zuordnung.
        </p>
      ) : null}
      <div
        role="region"
        aria-label="Karte der Projekte und Reports"
        aria-busy={pending || undefined}
        tabIndex={0}
        className={cn(
          "max-h-[75vh] overflow-auto border-2 border-line-subtle bg-[#1b1c1f] focus-visible:border-accent focus-visible:outline-none",
          "bg-[radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1px)] bg-[length:20px_20px]",
          pending && "opacity-70",
        )}
        data-testid="report-map"
        data-ready={ready ? "true" : "false"}
      >
        <svg width={layout.width} height={layout.height} className="block">
          <g aria-hidden="true">
            {Array.from({ length: rows }, (_, i) => (
              <text
                key={i}
                x={12}
                y={MARGIN_Y + i * (NODE_H + ROW_GAP) + NODE_H / 2 + 4}
                className="fill-text-secondary font-mono text-[11px] tracking-[0.08em]"
              >
                {i === 0 ? "PROJEKTE" : i < layout.projectRows ? "UNTERPROJ." : `EBENE ${i - layout.projectRows + 1}`}
              </text>
            ))}
            <g fill="none">
              {layout.edges.map((e) => {
                const active = Boolean(selectedId && (e.source === selectedId || e.target === selectedId));
                return (
                  <path
                    key={`${e.source}-${e.target}`}
                    d={e.path}
                    stroke={e.kind === "link" ? "#e20074" : "rgba(255,255,255,0.32)"}
                    strokeDasharray={e.kind === "project" ? "6 6" : undefined}
                    strokeWidth={active ? 3 : 2}
                    opacity={selectedId && !active ? 0.35 : 1}
                  />
                );
              })}
            </g>
          </g>
          {ordered.map((n) => {
            const selected = n.id === selectedId;
            const dim = Boolean(selectedId && !selected && !related.has(n.id));
            const nodeStatus = STATUS[n.status] ?? "";
            const canDrag = draggable && !n.virtual;
            const dropTarget = canDropFor(dragging, n);
            const handlers = draggable
              ? {
                  onDragStart: (e: DragEvent) => {
                    if (!canDrag) return;
                    e.dataTransfer.setData(DRAG_TYPE, n.id);
                    e.dataTransfer.effectAllowed = "move";
                    setStatus(null);
                    setDragging(n);
                  },
                  onDragEnd: () => {
                    setDragging(null);
                    setOverId(null);
                  },
                  onDragEnter: (e: DragEvent) => {
                    if (canDrop(n)) e.preventDefault();
                  },
                  onDragOver: (e: DragEvent) => {
                    if (!canDrop(n)) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (overId !== n.id) setOverId(n.id);
                  },
                  onDragLeave: () => {
                    if (overId === n.id) setOverId(null);
                  },
                  onDrop: (e: DragEvent) => {
                    e.preventDefault();
                    drop(n);
                  },
                }
              : {};
            return (
              <foreignObject key={n.id} x={n.x} y={n.y} width={NODE_W} height={NODE_H}>
                <Link
                  href={hrefs[n.id] ?? "#"}
                  scroll={false}
                  draggable={canDrag}
                  aria-current={selected ? "true" : undefined}
                  data-node-kind={n.kind}
                  data-node-id={n.id === NO_PROJECT ? "none" : n.id}
                  data-drop-target={dropTarget || undefined}
                  {...handlers}
                  className={cn(
                    "box-border flex h-full w-full flex-col justify-center gap-0.5 overflow-hidden px-3.5 text-left text-text-primary",
                    "border-2 transition-[border-color,box-shadow,opacity] duration-[var(--motion-fast)]",
                    "hover:border-accent focus-visible:border-accent focus-visible:shadow-[var(--shadow-accent)] focus-visible:outline-none",
                    n.kind === "project" ? "bg-bg" : "bg-surface",
                    n.virtual || n.external
                      ? "border-dashed border-border-default"
                      : n.kind === "project"
                        ? "border-border-strong"
                        : "border-border-default",
                    canDrag && "cursor-grab active:cursor-grabbing",
                    selected && "border-solid border-accent shadow-[var(--shadow-accent)]",
                    dim && !dragging && "opacity-50",
                    dragging && !dropTarget && "opacity-40",
                    dropTarget && "border-dashed border-accent",
                    overId === n.id && "border-solid border-accent bg-accent/15 shadow-[var(--shadow-accent)]",
                  )}
                >
                  <span
                    className={cn(
                      "truncate font-mono text-[11px] uppercase tracking-[0.06em]",
                      n.kind === "project" ? "text-accent-text" : "text-text-secondary",
                    )}
                  >
                    {n.label}
                    {n.external ? " · anderes Projekt" : ""}
                  </span>
                  <span
                    className={cn(
                      "line-clamp-2 text-[14px] leading-snug",
                      n.kind === "project" ? "font-semibold" : "font-medium",
                    )}
                  >
                    {n.title}
                  </span>
                  {nodeStatus ? (
                    <span className={cn("text-[12px]", n.status === "final" ? "text-success" : "text-text-secondary")}>
                      {n.status === "final" ? "● " : "○ "}
                      {nodeStatus}
                    </span>
                  ) : null}
                </Link>
              </foreignObject>
            );
          })}
        </svg>
      </div>
      {draggable ? (
        <p role="status" aria-live="polite" className="min-h-5 text-sm" data-testid="map-status">
          {status ? <span className={status.error ? "text-danger" : "text-success"}>{status.text}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

export function MapLegend() {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-text-secondary">
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className="w-7 border-t-2 border-dashed border-white/50" />
        gehört zum Projekt
      </span>
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className="w-7 border-t-2 border-accent" />
        verknüpft – der untere Report baut auf dem oberen auf
      </span>
    </div>
  );
}
