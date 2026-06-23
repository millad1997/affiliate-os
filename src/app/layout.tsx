import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://droverlabs.app"),
  title: "Drover",
  description:
    "TikTok Shop affiliate creator program management for DTC brands — creator discovery, performance-weighted scoring, compliance-conscious briefs, and a complete audit trail.",
  openGraph: {
    title: "Drover",
    description: "TikTok Shop affiliate creator program management for DTC brands.",
    url: "https://droverlabs.app",
    siteName: "Drover",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
