import './globals.css';

export const metadata = {
  title: 'Contract Risk Flagging System',
  description:
    'AI-assisted contract clause risk flagging system for legal aid. Surfaces potentially risky clauses for human review using semantic similarity.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
