import type { Metadata } from "next";
import { Inter, Archivo } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const display = Archivo({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "The International Trinidadian Jab & Performance Academy",
    template: "%s | ITJPA",
  },
  description:
    "Learn directly under Master Instructor King Aaron, The Accredited King of Jab. Master fire breathing, traditional oil crafting, rhythm, and extreme stagecraft — with full HSE fire safety clearance and an internationally recognized performance credential.",
  keywords: [
    "Trinidad Jab",
    "Jab Molassie",
    "Blue Devil Paramin",
    "Canboulay",
    "King Aaron",
    "fire performance certification",
    "Trinidad Carnival mas",
  ],
  openGraph: {
    title: "The International Trinidadian Jab & Performance Academy",
    description:
      "Reclaiming the flame: the ancestral art and performance science of Trinidadian Jab.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body className="font-body antialiased">
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
