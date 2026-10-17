import { Mukta, Tiro_Devanagari_Hindi } from 'next/font/google';
import Providers from './providers';
import './globals.css';

// Mukta was drawn as one family for Devanagari and Latin, so Hindi, English and mixed
// (Hinglish) text sit together evenly and stay readable at large sizes on cheap phones.
const mukta = Mukta({ subsets: ['devanagari', 'latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-mukta', display: 'swap' });
// Traditional face, used only for the samiti's name.
const tiro = Tiro_Devanagari_Hindi({ subsets: ['devanagari', 'latin'], weight: '400', variable: '--font-tiro', display: 'swap' });

export const metadata = {
  title: 'श्री श्याम सेवा समिति',
  description: 'समिति का हिसाब — किस्त, कर्ज और ब्याज',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#7a1f2b',
};

export default function RootLayout({ children }) {
  return (
    <html lang="hi" className={`${mukta.variable} ${tiro.variable}`}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
