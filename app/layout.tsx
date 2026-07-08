import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0e17",
};

export const metadata: Metadata = {
  title: "Dellmology Pro — Command Center",
  description: "Advanced IDX Market Intelligence & Bandarmology Dashboard. Real-time trading signals, Whale detection, and AI-powered analysis.",
  keywords: ["trading", "IDX", "bandarmology", "whale detection", "stock analysis"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DellPro",
  },
  openGraph: {
    title: "Dellmology Pro — Command Center",
    description: "Premium IDX Market Intelligence Terminal",
    type: "website",
  },
};

import ChatOracle from "./components/ChatOracle";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body>
        {children}
        <ChatOracle />
      </body>
    </html>
  );
}
