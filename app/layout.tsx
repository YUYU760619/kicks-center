import type { Metadata } from 'next';
import './globals.css';
import { IdleCat } from './idle-cat';
import { KcAiProvider } from './kc-ai-context';
import { AdminUiProvider } from './admin-ui-context';

export const metadata: Metadata = {
  title: 'KICKS CENTER · POS System',
  description: 'KICKS CENTER 庫存、寄賣與 POS 管理系統',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>
        <KcAiProvider><AdminUiProvider>{children}</AdminUiProvider></KcAiProvider>
        <IdleCat />
      </body>
    </html>
  );
}
