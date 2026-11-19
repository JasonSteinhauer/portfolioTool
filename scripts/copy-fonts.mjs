/**
 * Kopiert die selbst gehosteten Schriften aus den @fontsource-Paketen nach src/app/fonts.
 * Läuft automatisch nach `pnpm install` (postinstall). Die .woff2-Dateien werden nicht
 * committet – so bleibt das Repo frei von Binärdateien und die Versionen sind im Lockfile gepinnt.
 * Lizenz aller drei Schriften: SIL Open Font License 1.1 (siehe src/app/fonts/LICENSE-OFL.txt).
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "src", "app", "fonts");
const files = [
  ["inter", "inter-latin-wght-normal.woff2"],
  ["inter", "inter-latin-wght-italic.woff2"],
  ["space-grotesk", "space-grotesk-latin-wght-normal.woff2"],
  ["jetbrains-mono", "jetbrains-mono-latin-wght-normal.woff2"],
];

mkdirSync(target, { recursive: true });
for (const [pkg, file] of files) {
  const source = join(root, "node_modules", "@fontsource-variable", pkg, "files", file);
  if (!existsSync(source)) {
    console.error(`Schrift fehlt: ${source} – wurde "pnpm install" vollständig ausgeführt?`);
    process.exit(1);
  }
  copyFileSync(source, join(target, file));
}
console.log(`✓ ${files.length} Schriftdateien nach src/app/fonts kopiert`);
