import type { Metadata } from "next";
import { connection } from "next/server";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
const display = Archivo({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});
export const metadata: Metadata = {
  title: "ExtinPro · Gestão",
  description: "Estoque e financeiro em um só lugar.",
  robots: { index: false, follow: false },
};
export default async function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Toda página é gerada por requisição: é o que permite o nonce do CSP
  // (src/proxy.ts) chegar aos scripts. Página estática não teria o nonce.
  await connection();
  return (
    <html lang="pt-BR" className={`${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
