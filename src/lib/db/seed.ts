import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { DEFAULT_REPORT_TYPES, fieldSchemaSchema } from "@/modules/reports/report-types";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Spielt die Standard-Report-Typen ein. Idempotent: bestehende Typen (per `key`) werden
 * aktualisiert, nie gelöscht – Reports verweisen auf sie.
 */
export async function seedReportTypes(db: Db): Promise<number> {
  for (const type of DEFAULT_REPORT_TYPES) {
    const fieldSchema = fieldSchemaSchema.parse(type.fields);
    await db
      .insert(schema.reportTypes)
      .values({
        key: type.key,
        name: type.name,
        description: type.description,
        sortOrder: type.sortOrder,
        fieldSchema,
      })
      .onConflictDoUpdate({
        target: schema.reportTypes.key,
        set: {
          name: type.name,
          description: type.description,
          sortOrder: type.sortOrder,
          fieldSchema,
          updatedAt: new Date(),
        },
      });
  }
  return DEFAULT_REPORT_TYPES.length;
}
