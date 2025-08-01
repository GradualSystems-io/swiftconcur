import './globals.css';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import { Metadata } from 'next';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'SwiftConcur CI - Swift Concurrency Warning Tracker',
    template: '%s | SwiftConcur CI'
  },
  description: 'Track and manage Swift 6 concurrency warnings across your repositories with real-time monitoring and AI-powered analysis.',
  keywords: ['Swift', 'iOS', 'macOS', 'concurrency', 'warnings', 'CI/CD', 'static analysis'],
  authors: [{ name: 'SwiftConcur Team' }],
  creator: 'SwiftConcur',
  publisher: 'SwiftConcur',
  robots: {
    index: false, // Don't index dashboard pages
    follow: false,
  },
  // Security headers via meta tags
  other: {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        {/* Security: Content Security Policy */}
        <meta
          httpEquiv="Content-Security-Policy"
          content={[
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires unsafe-inline/eval
            "style-src 'self' 'unsafe-inline'", // Tailwind requires unsafe-inline
            "img-src 'self' data: https://avatars.githubusercontent.com",
            "font-src 'self' data:",
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
            "frame-ancestors 'none'",
            "form-action 'self'",
            "base-uri 'self'",
          ].join('; ')}
        />
        
        {/* Security: Additional meta tags */}
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        
        {/* Prevent MIME type sniffing */}
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        
        {/* Prevent clickjacking */}
        <meta httpEquiv="X-Frame-Options" content="DENY" />
        
        {/* XSS Protection */}
        <meta httpEquiv="X-XSS-Protection" content="1; mode=block" />
        
        {/* Disable DNS prefetching for privacy */}
        <meta httpEquiv="x-dns-prefetch-control" content="off" />
        
        {/* Permissions Policy */}
        <meta
          httpEquiv="Permissions-Policy"
          content="camera=(), microphone=(), geolocation=(), interest-cohort=()"
        />
      </head>
      <body className={`${inter.className} h-full antialiased`}>
        <Providers>
          <div className="min-h-full">
            {children}
          </div>
        </Providers>
        
        {/* Security: Prevent right-click in production */}
        {process.env.NODE_ENV === 'production' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                document.addEventListener('contextmenu', function(e) {
                  e.preventDefault();
                });
                document.addEventListener('selectstart', function(e) {
                  if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                  }
                });
                document.addEventListener('keydown', function(e) {
                  // Disable F12, Ctrl+Shift+I, Ctrl+U, Ctrl+S
                  if (e.key === 'F12' || 
                      (e.ctrlKey && e.shiftKey && e.key === 'I') ||
                      (e.ctrlKey && e.key === 'u') ||
                      (e.ctrlKey && e.key === 's')) {
                    e.preventDefault();
                  }
                });
              `,
            }}
          />
        )}
      </body>
    </html>
  );
}