import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Study Table",
  description:
    "Empty project tables for study seats — invite firms, claim scope, deliver with credit.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
