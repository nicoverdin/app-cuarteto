import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Panel Entrenador - Lyra",
  manifest: "/manifest-entrenador.json", // <-- Tu manifest específico
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Lyra Coach",
  },
};

export default function EntrenadorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}