import './globals.css';
import React from 'react';

export const metadata = {
  title: 'TradingGuru - Multi-Strategy Crypto Intelligence',
  description: 'Adaptive quantitative crypto trading dashboard running Walk Forward Analysis, Monte Carlo simulations, and automated decay controls.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
