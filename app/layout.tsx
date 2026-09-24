import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource-variable/newsreader";
import "./globals.css";

export const metadata: Metadata = {
  title: "Faultline — the handoff, on record",
  description: "Inspect a three-agent pipeline from source evidence to GenLayer judgment and deterministic DEMO settlement.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
