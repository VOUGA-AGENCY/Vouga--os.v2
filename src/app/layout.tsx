import type { Metadata } from "next";
import "./globals.css";
import "./linear.css";
import "./theme.css";
export const metadata: Metadata = {
  title: "Vouga OS",
  description: "O essencial da Vouga, num só lugar.",
  icons: { icon: "/vouga-mark-white.png" },
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-PT" suppressHydrationWarning>
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
