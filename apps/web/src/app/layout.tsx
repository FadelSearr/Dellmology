import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import dynamic from 'next/dynamic';

const MainLayout = dynamic(() => import('@/components/layout/MainLayout').then(m => m.MainLayout), { ssr: false });
const AINarrativeTerminal = dynamic(() => import('@/components/intelligence/AINarrativeTerminal').then(m => m.AINarrativeTerminal), { ssr: false });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dellmology Pro",
  description: "Whale & Flow Engine Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <MainLayout />
        {children}
        <AINarrativeTerminal />
      </body>
    </html>
  );
}
