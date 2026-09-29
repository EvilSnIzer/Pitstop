import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/lib/query";

export const metadata: Metadata = {
  title: "Pitstop — Vehicle intelligence, online",
  description: "Troubleshoot your car with a virtual senior technician.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="min-h-dvh bg-[#070910] font-sans text-slate-100 antialiased"><QueryProvider>{children}</QueryProvider></body></html>;
}
