import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Itapê Extintores · Gestão",
  description: "Estoque e financeiro em um só lugar.",
  robots: { index: false, follow: false },
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
