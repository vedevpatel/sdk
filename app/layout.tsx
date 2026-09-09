import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Faultline — Break an agent between commit and acknowledgment",
  description:
    "A failure-injection lab for durable agent tool calls. Compare naive retries against idempotent, reconcile-first recovery.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
