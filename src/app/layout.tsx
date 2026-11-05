import type { Metadata, Viewport } from "next";
import "./globals.css";
import Shell from "@/components/Shell";
export const metadata: Metadata = {
  title: "Kagoj Ready — Know Before You Go",
  description:
    "Evidence-linked e-Passport preparation in Bangladesh. Read, confirm, compare and plan.",
  icons: {
    icon: "/favicon.png",
    apple: "/logo-192.png",
  },
};
export const viewport: Viewport = {
  themeColor: "#f4efe2",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="bn" data-scroll-behavior="smooth">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
