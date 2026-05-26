import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pocky & Mia Pet Boarding Service | Pet Boarding Agreement",
  description: "Pet boarding and daycare agreement form for Pocky & Mia Pet Boarding Service",
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
