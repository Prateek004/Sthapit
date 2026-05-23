import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppProvider } from "@/lib/store/AppContext";
import ToastContainer from "@/components/ui/ToastContainer";

export const metadata: Metadata = {
  title: "Sth1r — Billing that works even offline",
  description: "Fast offline-first POS for Indian F&B businesses by Sthappit",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#E8590C",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect for Google Fonts performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Full landing-page font stack:
            Syne 400–800 (headlines), Instrument Serif regular + italic
            (emotional emphasis), DM Sans 300–800 (UI/body). */}
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#FEF9F4] text-[#1A1208] antialiased">
        <AppProvider>
          {children}
          <ToastContainer />
        </AppProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function(err) {
                    console.warn('[Sth1r] SW registration failed:', err);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
