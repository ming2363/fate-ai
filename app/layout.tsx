import type { ReactNode } from "react";

import { SITE_NAME } from "@/lib/shared/versions";

import "./globals.css";

export const metadata = {
  title: SITE_NAME,
  description: "一份八字解读，一张中式人格卡。",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <a className="skip" href="#main">跳到主要内容</a>
        {children}
      </body>
    </html>
  );
}
