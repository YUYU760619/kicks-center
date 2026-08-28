import type { Metadata } from 'next';
import './globals.css';
import { IdleCat } from './idle-cat';
import { AuthGate } from './auth-gate';

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
        <AuthGate>
          {children}
          <IdleCat />
        </AuthGate>
      </body>
    </html>
  );
}
