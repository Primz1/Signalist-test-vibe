const trimTrailingSlash = (url: string) => url.replace(/\/$/, '');

/**
 * Canonical app URL used for auth callbacks, email links, etc.
 * Set BETTER_AUTH_URL on Vercel to your production domain (no trailing slash).
 */
export function getAppUrl(): string {
  if (process.env.BETTER_AUTH_URL) {
    return trimTrailingSlash(process.env.BETTER_AUTH_URL);
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    return trimTrailingSlash(process.env.NEXT_PUBLIC_APP_URL);
  }

  // Vercel production domain (preferred over per-deployment VERCEL_URL)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return 'http://localhost:3000';
}

export function getTrustedOrigins(): string[] {
  const origins = new Set<string>([
    getAppUrl(),
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]);

  if (process.env.VERCEL_URL) {
    origins.add(`https://${process.env.VERCEL_URL}`);
  }

  if (process.env.VERCEL_BRANCH_URL) {
    origins.add(`https://${process.env.VERCEL_BRANCH_URL}`);
  }

  return [...origins];
}
