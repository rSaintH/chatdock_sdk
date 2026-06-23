import "@rscheln/chatdock-sdk/styles.css";
import "./styles.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "./shell";

export const metadata: Metadata = {
  title: "Chatdock SDK Next Basic",
  description: "Minimal runnable Next.js example for @rscheln/chatdock-sdk.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
