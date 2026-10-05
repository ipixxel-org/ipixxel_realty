import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "@/app/openpage.css";
import { PresenceTracker } from "@/components/presence-tracker";

// This has to be a top-level sibling route, not nested under app/org/ —
// app/org/layout.tsx unconditionally wraps every child in <OrgAdminShell>,
// and the builder is its own full-screen app with its own chrome (rail nav +
// topnav), never meant to render inside a dashboard shell.
const roboto = Roboto({
  weight: ["300", "400", "500", "700", "900"],
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "OpenPage Builder",
  description: "Edit your organisation's landing pages.",
};

export default function OrgBuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`ps-app ${roboto.variable} ${roboto.className}`}
      style={
        {
          ["--font-playfair" as string]: "var(--font-inter), Roboto, sans-serif",
        } as React.CSSProperties
      }
    >
      <PresenceTracker />
      {children}
    </div>
  );
}
