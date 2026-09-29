import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./linear.css";
import "./theme.css";
// Mobile-only refinements; loaded last so the desktop composition is untouched.
import "./mobile.css";
export const metadata: Metadata = {
  title: "Vouga OS",
  description: "The essentials of Vouga, in one place.",
  icons: { icon: "/vouga-mark-white.png" },
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
      <body>{children}</body>
    </html>
  );
}
