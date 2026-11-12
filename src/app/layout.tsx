import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Pryse", template: "%s | Pryse" },
  description: "Invoicing and e-signing for Maanda Attorneys Inc.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#111111" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
