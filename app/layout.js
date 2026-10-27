import "./globals.css";

export const metadata = {
  title: "Plix Ops",
  description: "Plix Ops — Unified Operations Platform",
  icons: {
    icon: "/plix-ops-logo.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

