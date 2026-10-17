import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:4000';
// On Vercel the API is a separate project: its address must be given, or every page would call localhost
if (process.env.VERCEL && !process.env.API_ORIGIN) throw new Error('Set API_ORIGIN (the backend project URL, e.g. https://samiti-api.vercel.app) in the Vercel project settings.');

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  // NEXT_DIST_DIR lets a test build run without touching the build the live server is using
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  // The browser only talks to this site; /api is passed through to the backend
  // (same origin, so the session cookie works and no cross-site requests are needed).
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_ORIGIN}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
