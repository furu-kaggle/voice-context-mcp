import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "voice-context-mcp",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
