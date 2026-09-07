import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cuarteto Tracker",
  description: "Control de correcciones del disco",
  themeColor: "#F2F2F7", // Color de la barra de estado superior
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased bg-[#F2F2F7] text-gray-900 selection:bg-[#FF2D55] selection:text-white">
        {children}
      </body>
    </html>
  );
}