import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;
  return {
    metadataBase: new URL(origin),
    title: "Lumo｜旅光",
    description: "Move. Connect. Light up the place.",
    icons: { icon: "/favicon.svg" },
    openGraph: {
      title: "Lumo｜旅光",
      description: "Move. Connect. Light up the place.",
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1536, height: 1024, alt: "Lumo interactive Golden Gate Bridge experience" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Lumo｜旅光",
      description: "Move. Connect. Light up the place.",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
