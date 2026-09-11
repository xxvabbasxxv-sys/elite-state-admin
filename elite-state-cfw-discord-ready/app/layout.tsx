import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Elite State CFW | مركز الإدارة",
  description: "بوابة إدارة Elite State CFW — التعليمات والإعلانات والطاقم والصلاحيات.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
