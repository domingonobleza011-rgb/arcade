import "./globals.css";
import { Sora, DM_Sans } from "next/font/google";

const display = Sora({ subsets: ["latin"], variable: "--font-display" });
const body = DM_Sans({ subsets: ["latin"], variable: "--font-body" });

export const metadata = { title: "Arcade", description: "Realtime multiplayer games with chat and emotes." };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
