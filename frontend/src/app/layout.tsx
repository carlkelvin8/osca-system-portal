import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ThemeSync } from "@/components/ThemeSync";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  fallback: ["system-ui", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: "OSCA Management System — NAAP Villamor",
  description:
    "Attendance and Inventory Management with Facial Recognition | Office of Sports and Cultural Affairs",
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
            __html: `(function(){try{var t=JSON.parse(localStorage.getItem("osca-theme")||"{}");if(t&&t.state&&t.state.isDark)document.documentElement.classList.add("dark");}catch(e){}})();`,
          }}
        />
      </head>
      <body className={inter.className}>
        <Providers>
          <ThemeSync />
          {children}
        </Providers>
      </body>
    </html>
  );
}
