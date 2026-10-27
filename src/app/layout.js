import { cookies, headers } from "next/headers";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { IframeGuard } from "@/components/layout/iframe-guard";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Editorial display serif — headings, wordmark, big numbers (Ivory Bloom theme)
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
});

export const metadata = {
  title: "Bloom — AI-assisted HR",
  description:
    "Human Capital Management for Admin, HR and Employees. Attendance, leave, payroll and an AI assistant — built for Saylani Hackathon (HCM Lite).",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Bloom HR",
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#a8552a" },
    { media: "(prefers-color-scheme: dark)", color: "#191117" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }) {
  // Theme class SSR par hi set — priority: explicit cookie > Sec-CH client hint > system(CSS media).
  // Koi boot-script nahi → React 19 ke script-tag console errors se mukti.
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const themeCookie = cookieStore.get("bloom_theme")?.value;
  const colorHint = headerStore.get("sec-ch-prefers-color-scheme");
  const effective =
    themeCookie && themeCookie !== "system"
      ? themeCookie
      : colorHint === "dark" || colorHint === "light"
        ? colorHint
        : "";
  const themeClass = effective === "dark" ? "dark" : effective === "light" ? "light" : "";

  return (
    <html lang="en" suppressHydrationWarning className={themeClass}>
      <body className={`${inter.variable} ${fraunces.variable} font-sans antialiased`}>
        <IframeGuard />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
