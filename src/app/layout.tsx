import type { Metadata } from 'next';
import '@fontsource-variable/overpass-mono';
import './globals.css';

export const metadata: Metadata = {
  title: 'LA Metro Ridership App',
  description: 'Built by Streets for All\'s Data/Dev Team to visualize and interact with Los Angeles Metro\'s ridership data for rail and bus service.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
