import { z } from "zod";
import { safeWebUrl } from "@/content/blocks/schema";

/**
 * Report-Typen sind Daten, kein Code: Jeder Typ beschreibt seine strukturierten
 * Formularfelder. Neue Typen lassen sich ohne Migration anlegen; die sechs Standardtypen
 * werden per Seed eingespielt (idempotent, über `key`).
 */

export const FIELD_TYPES = ["text", "textarea", "date", "select", "tags", "url"] as const;

export const fieldDefinitionSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-zA-Z0-9]{1,40}$/),
    label: z.string().min(1).max(80),
    type: z.enum(FIELD_TYPES),
    required: z.boolean().default(false),
    help: z.string().max(200).optional(),
    options: z.array(z.object({ value: z.string().min(1).max(60), label: z.string().min(1).max(80) })).optional(),
    maxLength: z.number().int().positive().max(5_000).optional(),
  })
  .strict()
  .superRefine((field, ctx) => {
    if (field.type === "select" && (!field.options || field.options.length === 0)) {
      ctx.addIssue({ code: "custom", message: "Auswahlfelder brauchen Optionen", path: ["options"] });
    }
    if (field.type !== "select" && field.options) {
      ctx.addIssue({ code: "custom", message: "Optionen nur bei Auswahlfeldern", path: ["options"] });
    }
  });

export const fieldSchemaSchema = z
  .array(fieldDefinitionSchema)
  .max(30)
  .superRefine((fields, ctx) => {
    const keys = new Set<string>();
    fields.forEach((f, i) => {
      if (keys.has(f.key))
        ctx.addIssue({ code: "custom", message: `Doppelter Feldschlüssel ${f.key}`, path: [i, "key"] });
      keys.add(f.key);
    });
  });

export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;

/**
 * Baut aus den Felddefinitionen eines Report-Typs den Validator für `structuredFields`.
 * Im Modus `draft` sind Pflichtfelder noch optional (Entwürfe dürfen unvollständig sein);
 * im Modus `final` werden sie erzwungen. Unbekannte Felder werden immer abgelehnt.
 */
export function buildStructuredFieldsSchema(fields: FieldDefinition[], mode: "draft" | "final") {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    let schema: z.ZodType;
    switch (field.type) {
      case "text":
      case "textarea": {
        const max = field.maxLength ?? (field.type === "text" ? 300 : 5_000);
        schema = z.string().trim().max(max);
        break;
      }
      case "date":
        schema = z.iso.date();
        break;
      case "select": {
        const values = (field.options ?? []).map((o) => o.value);
        schema = z.string().refine((v) => values.includes(v), { message: "Ungültige Auswahl" });
        break;
      }
      case "tags":
        schema = z.array(z.string().trim().min(1).max(60)).max(30);
        break;
      case "url":
        schema = safeWebUrl;
        break;
    }
    const required = mode === "final" && field.required;
    if (required) {
      shape[field.key] =
        field.type === "tags"
          ? (schema as z.ZodArray<z.ZodString>).min(1, "Pflichtfeld")
          : schema.refine((v) => v !== "", { message: "Pflichtfeld" });
    } else {
      // Leere Strings in Entwürfen erlauben, ohne die Typprüfung aufzugeben.
      shape[field.key] = z.union([z.literal(""), schema]).optional();
    }
  }
  return z.object(shape).strict();
}

export const REPORT_TYPE_KEYS = [
  "learning",
  "activity",
  "project",
  "case-analysis",
  "reflection",
  "milestone",
] as const;
export type ReportTypeKey = (typeof REPORT_TYPE_KEYS)[number];

type ReportTypeSeed = {
  key: ReportTypeKey;
  name: string;
  description: string;
  sortOrder: number;
  fields: z.input<typeof fieldSchemaSchema>;
};

const period = { key: "occurredOn", label: "Datum / Zeitraum", type: "date", required: true } as const;
const tools = { key: "tools", label: "Werkzeuge & Technologien", type: "tags" } as const;

export const DEFAULT_REPORT_TYPES: ReportTypeSeed[] = [
  {
    key: "learning",
    name: "Lernbericht",
    description: "Was du gelernt hast, woher und wie du es angewendet hast.",
    sortOrder: 10,
    fields: [
      period,
      { key: "topic", label: "Thema", type: "text", required: true, maxLength: 200 },
      { key: "source", label: "Quelle", type: "text", help: "Kurs, Buch, Lab, Kollege …", maxLength: 300 },
      { key: "keyTakeaways", label: "Wichtigste Erkenntnisse", type: "textarea", maxLength: 2_000 },
      tools,
    ],
  },
  {
    key: "activity",
    name: "Tätigkeitsbericht",
    description: "Eine konkrete Tätigkeit im Betrieb oder Studium.",
    sortOrder: 20,
    fields: [
      period,
      { key: "context", label: "Kontext / Abteilung", type: "text", maxLength: 200 },
      { key: "task", label: "Aufgabe", type: "textarea", required: true, maxLength: 2_000 },
      { key: "outcome", label: "Ergebnis", type: "textarea", maxLength: 2_000 },
      tools,
    ],
  },
  {
    key: "project",
    name: "Projektbericht",
    description: "Stand, Entscheidungen und Ergebnisse eines Projekts.",
    sortOrder: 30,
    fields: [
      period,
      { key: "goal", label: "Ziel", type: "textarea", required: true, maxLength: 2_000 },
      { key: "role", label: "Deine Rolle", type: "text", maxLength: 200 },
      { key: "result", label: "Ergebnis", type: "textarea", maxLength: 2_000 },
      { key: "repositoryUrl", label: "Repository / Link", type: "url" },
      tools,
    ],
  },
  {
    key: "case-analysis",
    name: "Fallanalyse",
    description: "Strukturierte Analyse eines Falls, Vorfalls oder einer Untersuchung.",
    sortOrder: 40,
    fields: [
      period,
      { key: "context", label: "Ausgangslage", type: "textarea", required: true, maxLength: 3_000 },
      { key: "question", label: "Fragestellung", type: "textarea", required: true, maxLength: 1_000 },
      {
        key: "severity",
        label: "Einstufung",
        type: "select",
        options: [
          { value: "info", label: "Info" },
          { value: "low", label: "Niedrig" },
          { value: "medium", label: "Mittel" },
          { value: "high", label: "Hoch" },
          { value: "critical", label: "Kritisch" },
        ],
      },
      { key: "method", label: "Vorgehen / Methodik", type: "textarea", maxLength: 3_000 },
      { key: "conclusion", label: "Schlussfolgerung", type: "textarea", maxLength: 3_000 },
      { key: "lessonsLearned", label: "Lessons Learned", type: "textarea", maxLength: 2_000 },
      tools,
    ],
  },
  {
    key: "reflection",
    name: "Reflexionsbericht",
    description: "Rückblick: was lief gut, was nicht, was ändert sich.",
    sortOrder: 50,
    fields: [
      period,
      { key: "subject", label: "Worauf blickst du zurück?", type: "text", required: true, maxLength: 200 },
      { key: "wentWell", label: "Was lief gut?", type: "textarea", maxLength: 2_000 },
      { key: "toImprove", label: "Was würdest du anders machen?", type: "textarea", maxLength: 2_000 },
      { key: "nextSteps", label: "Konsequenzen", type: "textarea", maxLength: 2_000 },
    ],
  },
  {
    key: "milestone",
    name: "Meilenstein / Erfolg",
    description: "Ein Abschluss, Zertifikat oder erreichtes Ziel – mit Nachweis.",
    sortOrder: 60,
    fields: [
      period,
      { key: "achievement", label: "Was wurde erreicht?", type: "text", required: true, maxLength: 200 },
      { key: "evidence", label: "Nachweis", type: "textarea", help: "Wodurch ist es belegt?", maxLength: 1_000 },
      { key: "evidenceUrl", label: "Link zum Nachweis", type: "url" },
    ],
  },
];
