import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ego — Your Digital Twin",
  description:
    "AI-Powered Digital Twin that thinks, speaks, and responds like you. 100% local, zero cost, privacy-first.",
  keywords: ["digital twin", "AI", "voice clone", "RAG", "local AI"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body className="antialiased">
        <main className="relative">{children}</main>
      </body>
    </html>
  );
}
