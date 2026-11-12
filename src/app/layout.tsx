import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MixKey — Sets harmônicos para Rekordbox",
  description: "Monte sequências de mixagem em Camelot (Mix in Key) levando em conta BPM, energia e vibe.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a0a10" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('mk-theme');if(t==='light')document.documentElement.classList.remove('dark')}catch(e){}` }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
