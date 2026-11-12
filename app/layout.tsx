import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { ThemeSync, UIProvider } from "@/components/ui";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-display", display: "swap" });
const body = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"], variable: "--font-body", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Design Dojo · System design practice",
  description: "Mock system design interviews with an AI interviewer who scopes, challenges and grades your design.",
};

/* Apply a saved theme before first paint to avoid a flash. */
const themeScript = `try{var s=JSON.parse(localStorage.getItem("dd.settings")||"{}");if(s.theme==="Light")document.documentElement.dataset.theme="light";else if(s.theme==="Dark")document.documentElement.dataset.theme="dark";}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <UIProvider>
          <ThemeSync />
          {children}
        </UIProvider>
      </body>
    </html>
  );
}
