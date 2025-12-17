import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "NPA EMR - Electronic Medical Records",
  description: "Electronic Medical Records (EMR) system for Nigerian Ports Authority healthcare facilities",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/npalogo-256.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {/* Polyfill for crypto.randomUUID - must run before any other scripts */}
        <Script
          id="crypto-polyfill"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                'use strict';
                function generateUUIDFallback() {
                  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    var r = Math.random() * 16 | 0;
                    var v = c === 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                  });
                }
                if (typeof window !== 'undefined') {
                  try {
                    if (typeof window.crypto !== 'undefined' && typeof window.crypto.randomUUID === 'function') {
                      try {
                        window.crypto.randomUUID();
                        return;
                      } catch (e) {}
                    }
                    if (typeof window.crypto === 'undefined') {
                      window.crypto = {};
                    }
                    if (typeof window.crypto.randomUUID !== 'function') {
                      window.crypto.randomUUID = generateUUIDFallback;
                    }
                  } catch (e) {
                    if (typeof window.crypto === 'undefined') {
                      window.crypto = {};
                    }
                    window.crypto.randomUUID = generateUUIDFallback;
                  }
                }
                if (typeof global !== 'undefined') {
                  try {
                    if (typeof global.crypto === 'undefined' || typeof global.crypto?.randomUUID !== 'function') {
                      if (typeof global.crypto === 'undefined') {
                        global.crypto = {};
                      }
                      global.crypto.randomUUID = generateUUIDFallback;
                    }
                  } catch (e) {
                    if (typeof global.crypto === 'undefined') {
                      global.crypto = {};
                    }
                    global.crypto.randomUUID = generateUUIDFallback;
                  }
                }
              })();
            `,
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

