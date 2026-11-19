/** Verbindet Klassennamen und ignoriert leere Werte (ohne zusätzliche Abhängigkeit). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
