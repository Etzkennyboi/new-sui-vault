import type { Metadata } from "next";
import { Outfit, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Providers from "../components/Providers";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const space = Space_Grotesk({ subsets: ["latin"], variable: "--font-space" });

export const metadata: Metadata = {
  title: "SuiSyndicate | Agent-Managed Fund Vaults on Sui + Walrus",
  description: "A decentralized, on-chain fund vault protocol where AI agents execute DeFi strategies autonomously. Every action log is secured on Walrus for trustless public verification.",
  keywords: ["Sui", "Move", "Walrus", "Tatum", "DeFi", "AI Agent", "Fund Vault", "Decentralized Finance"],
  authors: [{ name: "SuiSyndicate Team" }],
  openGraph: {
    title: "SuiSyndicate | Agent-Managed Fund Vaults on Sui",
    description: "Autonomously managed fund vaults on Sui Mainnet with permanent, cryptographic audit logs stored on Walrus.",
    type: "website",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className={`${outfit.variable} ${space.variable} font-sans min-h-full flex flex-col bg-[#05050A] text-[#F1F5F9] antialiased`} suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
