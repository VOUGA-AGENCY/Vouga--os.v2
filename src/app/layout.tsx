import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./linear.css";
import "./theme.css";
// Mobile-only refinements; loaded last so the desktop composition is untouched.
import "./mobile.css";
export const metadata: Metadata = {
  title: "Vouga OS",
  description: "The essentials of Vouga, in one place.",
  manifest: "/manifest.webmanifest",
  applicationName: "Vouga OS",
  appleWebApp: { capable: true, title: "Vouga OS", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Let the mobile layer use the notch safe areas on iOS.
  viewportFit: "cover",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.dataset.theme=localStorage.getItem('vouga-theme')==='light'?'light':'dark';window.addEventListener('storage',function(e){if(e.key==='vouga-theme')document.documentElement.dataset.theme=e.newValue==='light'?'light':'dark'})}catch{}`,
          }}
        />
      </head>
      {/* Browser extensions (e.g. Grammarly) add attributes to <body> before hydration. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
