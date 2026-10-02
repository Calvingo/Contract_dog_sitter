import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Silicon Paws Retreat | Dog Boarding & Booking",
  description:
    "Book a dog boarding stay, manage your dog profiles, and keep track of reservations at Silicon Paws Retreat.",
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
