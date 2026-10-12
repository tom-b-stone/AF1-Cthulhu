import type { Metadata } from "next";
import Sidebar from "./components/Sidebar";
import ToolHeader from "./components/ToolHeader";
import SessionProviderWrapper from "./components/SessionProviderWrapper";
import "./globals.css";

export const metadata: Metadata = {
  title: "AF1 Ktulu",
  description: "Internal tools for audif1.com: UTM Studio, SEO Studio, Asset Uploader, CRM Images",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProviderWrapper>
          <div style={{ display: "flex" }}>
            <Sidebar />
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
              <ToolHeader />
              <main style={{ flex: 1, minWidth: 0, padding: "28px 40px" }}>{children}</main>
            </div>
          </div>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
