import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "One More",
  description: "A decentralized single-page yield protocol built on 1inch shared liquidity principles. Stake stablecoins and major assets to mint vUSD and access Layer 2 boosted APY strategies.",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-molDark text-white antialiased selection:bg-molCream-400 selection:text-molBrown-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
