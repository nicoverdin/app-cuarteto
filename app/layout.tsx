import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#F2F2F7",
};

export const metadata: Metadata = {
  description: "Control de correcciones del disco",
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