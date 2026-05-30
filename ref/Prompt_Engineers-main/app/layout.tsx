import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brim Expense Intelligence",
  description: "Hackathon dashboard for expense intelligence and transaction review.",
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
