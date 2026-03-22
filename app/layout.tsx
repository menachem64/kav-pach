import type { Metadata } from "next";
import "./globals.css";
import { Assistant, Heebo, Outfit, Varela_Round } from 'next/font/google';


const assistant = Assistant({ subsets: ['hebrew'], weight: ['300', '400', '500'] });

const heebo = Heebo({ 
  subsets: ['hebrew'], 
  weight: ['300', '400', '700'] 
});

const varela = Varela_Round({ 
  subsets: ['hebrew'], 
  weight: ['400'] // שים לב: בדר"כ מגיע במשקל אחד
});

export const metadata : Metadata = {
  title: "קו פח – מאתרים קווים ריקים",
      description: "מערכת לניתוח קווי אוטובוס ויעול לוחות זמנים",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body
        className={`bg-[#F8FAFC] text-slate-900 antialiased ${assistant.className}`}
      >
        {children}
      </body>
    </html>
  );
}
