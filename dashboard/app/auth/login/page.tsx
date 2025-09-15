'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client-simple';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Github, Mail } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const resolveBasePath = () => {
    if (process.env.NEXT_PUBLIC_BASE_PATH) {
      return process.env.NEXT_PUBLIC_BASE_PATH;
    }

    if (typeof window !== 'undefined') {
      const loginPath = '/auth/login';
      const currentPath = window.location.pathname || '/';

      if (currentPath.endsWith(loginPath)) {
        const candidate = currentPath.slice(0, currentPath.length - loginPath.length);
        return candidate || '';
      }
    }

    return '';
  };

  const normalizeBasePath = (value: string) => {
    if (!value || value === '/') return '';
    return value.startsWith('/') ? value : `/${value}`;
  };

  const initialBasePath = normalizeBasePath(resolveBasePath());

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [basePath, setBasePath] = useState<string>(initialBasePath);
  const defaultRedirectTarget = basePath ? basePath : '/';
  const [redirectTo, setRedirectTo] = useState(defaultRedirectTarget);
  const supabase = createClient();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    // Derive the deployed base path so redirects stay within the app scope
    const normalizedBase = normalizeBasePath(resolveBasePath());
    setBasePath(normalizedBase);

    const urlParams = new URLSearchParams(window.location.search);
    const urlError = urlParams.get('error');
    const urlMessage = urlParams.get('message');
    const redirectParam = urlParams.get('redirect');

    if (urlError) {
      setError(decodeURIComponent(urlError));
    }
    if (urlMessage) {
      setMessage(decodeURIComponent(urlMessage));
    }

    const defaultTarget = normalizedBase || '/';
    const loginPaths = [
      `${normalizedBase || ''}/auth/login`,
      '/auth/login',
    ];

    const sanitizeRedirect = (value: string | null) => {
      if (!value) return defaultTarget;

      try {
        const resolved = new URL(value, window.location.origin);

        if (resolved.origin !== window.location.origin) {
          return defaultTarget;
        }

        const path = `${resolved.pathname}${resolved.search}${resolved.hash}` || defaultTarget;

        if (loginPaths.some(loginPath => path === loginPath || path.startsWith(`${loginPath}?`))) {
          return defaultTarget;
        }

        return path;
      } catch {
        return defaultTarget;
      }
    };

    setRedirectTo(sanitizeRedirect(redirectParam));
  }, []);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Login error:', error);
        setError(error.message);
      } else {
        console.log('Login successful:', data.user?.email, 'Email confirmed:', data.user?.email_confirmed_at);
        const target = redirectTo 
          || defaultRedirectTarget 
          || normalizeBasePath(resolveBasePath()) 
          || '/';
        window.location.href = target;
      }
    } catch (err) {
      console.error('Login exception:', err);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGithubLogin = async () => {
    setLoading(true);
    setError('');

    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const normalizedBasePath = basePath || normalizeBasePath(resolveBasePath()) || '';
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL 
        ?? (origin ? `${origin}${normalizedBasePath}` : `http://localhost:3000${normalizedBasePath}`);
      const callbackPath = `${normalizedBasePath}/auth/callback`;
      const nextTarget = redirectTo 
        || defaultRedirectTarget 
        || normalizedBasePath 
        || '/';

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: (() => {
            try {
              const callbackUrl = new URL(
                callbackPath.startsWith('/') ? callbackPath : `/${callbackPath}`,
                siteUrl
              );
              callbackUrl.searchParams.set('next', nextTarget);
              return callbackUrl.toString();
            } catch (exception) {
              console.warn('Failed to construct OAuth redirect URL:', exception);
              const fallbackPath = callbackPath.startsWith('/') ? callbackPath : `/${callbackPath}`;
              return `${siteUrl.replace(/\/$/, '')}${fallbackPath}`;
            }
          })(),
        },
      });

      if (error) {
        setError(error.message);
        setLoading(false);
      }
    } catch (err) {
      setError('An unexpected error occurred');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Welcome to SwiftConcur</CardTitle>
          <CardDescription>
            Sign in to track Swift concurrency warnings in your repositories
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {message && (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}


          {/* GitHub OAuth */}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGithubLogin}
            disabled={loading}
          >
            <Github className="w-4 h-4 mr-2" />
            Continue with GitHub
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              <Mail className="w-4 h-4 mr-2" />
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          <div className="text-center text-sm">
            <span className="text-muted-foreground">Don't have an account? </span>
            <Link href="/auth/signup" className="text-primary hover:underline">
              Sign up
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
