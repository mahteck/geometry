import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Fence Map | PostGIS Polygons",
  description: "View and explore PostGIS fence polygons on an interactive map",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-slate-50 font-sans antialiased">
        <Navbar />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
