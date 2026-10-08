import type { Metadata } from "next";
import Sidebar from "./components/Sidebar";
import SessionProviderWrapper from "./components/SessionProviderWrapper";
import "./globals.css";

export const metadata: Metadata = {
  title: "AF1 Cthulhu",
  description: "Internal tools for audif1.com: UTM Studio, SEO Studio, Asset Uploader, CRM Images",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProviderWrapper>
          <div style={{ display: "flex" }}>
            <Sidebar />
            <main style={{ flex: 1, padding: "32px 40px" }}>{children}</main>
          </div>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
