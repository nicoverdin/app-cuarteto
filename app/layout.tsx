import type { Metadata, Viewport } from "next";
import "./globals.css";

// El color de la barra de estado va ahora en su propia constante Viewport
export const viewport: Viewport = {
  themeColor: "#F2F2F7", 
};

export const metadata: Metadata = {
  title: "Cuarteto Tracker",
  description: "Control de correcciones del disco",
  manifest: "/manifest-equipo.json", // <-- Cambiado para que use el manifest del equipo
  appleWebApp: {
    capable: true, // Oculta las flechas y la barra en los iPhone
    statusBarStyle: "default",
    title: "Cuarteto Tracker",
  },
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