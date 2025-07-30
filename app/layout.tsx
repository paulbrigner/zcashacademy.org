import './globals.css';
import { Providers } from './providers';

// You can define your app's metadata here
export const metadata = {
  title: 'PGP for Crypto Community',
  description: 'A token-gated community application.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* The Providers component now wraps your application */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
