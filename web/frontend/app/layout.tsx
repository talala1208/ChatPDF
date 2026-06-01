import type { Metadata } from "next";
import ApiLinksMenu from "@/components/ApiLinksMenu";
import { AppGuideProvider } from "@/lib/app-guide-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChatPDF FAISS",
  description: "PDF 向量库建库与问答",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <AppGuideProvider>
          {children}
          <ApiLinksMenu />
        </AppGuideProvider>
      </body>
    </html>
  );
}
