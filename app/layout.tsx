import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter, Outfit } from "next/font/google";
import "./globals.css";
import TextSelectPopover from "@/components/TextSelectPopover";
import { ThemeProvider } from "@/components/ThemeProvider";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-headline",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "700", "800"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: "LexiDrop — Personal Vocabulary Builder",
  description:
    "Capture words, phrases, and sentences from any source. Review with AI-powered flashcards, audio tests, and native expression challenges.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
        {/* Prevent flash: set dark class synchronously before React hydrates */}
        <script dangerouslySetInnerHTML={{ __html:
          `(function(){var t=localStorage.getItem('lexidrop_theme')||'dark';document.documentElement.className=t;})()`
        }} />
      </head>
      <body
        className={`${plusJakarta.variable} ${inter.variable} ${outfit.variable} bg-background text-on-surface font-body antialiased`}
      >
        <ThemeProvider>
          <div className="relative">
            {children}
            <TextSelectPopover />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
