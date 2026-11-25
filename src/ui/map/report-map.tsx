import Link from "next/link";
import { cn } from "@/ui/cn";
import { MARGIN_Y, NODE_H, NODE_W, ROW_GAP, type Layout, type LayoutNode } from "./layout";

const STATUS: Record<string, string> = {
  draft: "Entwurf",
  final: "Abgeschlossen",
  archived: "Archiviert",
  planned: "Geplant",
  active: "Aktiv",
  paused: "Pausiert",
  completed: "Abgeschlossen",
};

/**
 * Karte der Projekte und Reports (von oben nach unten).
 *
 * Alles wird über SVG-Attribute positioniert – die strikte CSP der Produktion erlaubt keine
 * Inline-Styles. Knoten sind echte HTML-Links (in `foreignObject`), damit die Karte mit der
 * Tastatur bedienbar bleibt; Linien und Ebenen-Beschriftung sind Dekoration (aria-hidden).
 */
export function ReportMap({
  layout,
  selectedId,
  hrefFor,
}: {
  layout: Layout;
  selectedId?: string;
  hrefFor: (node: LayoutNode) => string;
}) {
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
    <div
      role="region"
      aria-label="Karte der Projekte und Reports"
      tabIndex={0}
      className={cn(
        "max-h-[75vh] overflow-auto border-2 border-line-subtle bg-[#1b1c1f] focus-visible:border-accent focus-visible:outline-none",
        "bg-[radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1px)] bg-[length:20px_20px]",
      )}
      data-testid="report-map"
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
              {i === 0 ? "PROJEKTE" : `EBENE ${i}`}
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
          const status = STATUS[n.status] ?? "";
          return (
            <foreignObject key={n.id} x={n.x} y={n.y} width={NODE_W} height={NODE_H}>
              <Link
                href={hrefFor(n)}
                scroll={false}
                aria-current={selected ? "true" : undefined}
                data-node-kind={n.kind}
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
                  selected && "border-solid border-accent shadow-[var(--shadow-accent)]",
                  dim && "opacity-50",
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
                {status ? (
                  <span className={cn("text-[12px]", n.status === "final" ? "text-success" : "text-text-secondary")}>
                    {n.status === "final" ? "● " : "○ "}
                    {status}
                  </span>
                ) : null}
              </Link>
            </foreignObject>
          );
        })}
      </svg>
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
