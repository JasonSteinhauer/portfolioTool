import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import "./globals.css";

// Selbst gehostete Schriften (SIL OFL 1.1), per postinstall aus npm kopiert – keine Laufzeit-Requests an Dritte.
const inter = localFont({
  src: [
    { path: "./fonts/inter-latin-wght-normal.woff2", style: "normal", weight: "100 900" },
    { path: "./fonts/inter-latin-wght-italic.woff2", style: "italic", weight: "100 900" },
  ],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = localFont({
  src: "./fonts/space-grotesk-latin-wght-normal.woff2",
  weight: "300 700",
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  weight: "100 800",
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Development Portfolio", template: "%s · Development Portfolio" },
  description: "Privates Entwicklungsportfolio",
  // Privates System: nie indexieren, auch nicht versehentlich.
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: "#202124",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Liest den Request-Header → erzwingt dynamisches Rendering, damit jede Antwort
  // zur pro Request erzeugten CSP-Nonce passt (Next.js setzt sie automatisch an seine Skripte).
  await headers();

  return (
    <html lang="de" className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-bg text-text-primary antialiased">{children}</body>
    </html>
  );
}
