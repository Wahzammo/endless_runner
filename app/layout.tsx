import type {Metadata} from 'next';
import { Inter, Press_Start_2P } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const arcadeFont = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-arcade',
});

export const metadata: Metadata = {
  title: 'Base Runner: Psych-Out Arcade',
  description: 'An endless runner on Base with a sarcastic AI commentator.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${inter.variable} ${arcadeFont.variable}`}>
      <body suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
