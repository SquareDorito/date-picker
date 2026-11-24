import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { google } from 'googleapis';

export interface AuthUser {
  email: string;
  name?: string;
  picture?: string;
}

const COOKIE_NAME = 'datenight_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getRedirectUri(): string {
  return process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3045/api/gcal/callback';
}

function getSigningSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    'dev-fallback-secret-change-me'
  );
}

export function isAuthEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function getAllowedEmails(): Set<string> | null {
  const raw = process.env.ALLOWED_EMAILS?.trim();
  if (!raw) return null;
  const list = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 ? new Set(list) : null;
}

function parseCookies(header?: string): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  }
  return out;
}

function signPayload(payloadB64: string): string {
  return crypto
    .createHmac('sha256', getSigningSecret())
    .update(payloadB64)
    .digest('base64url');
}

export function getSessionUser(req: Request): AuthUser | null {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return null;

  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;

  const expected = signPayload(payloadB64);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as AuthUser & {
      exp?: number;
    };
    if (!parsed.email || (parsed.exp && Date.now() > parsed.exp)) {
      return null;
    }
    const allowed = getAllowedEmails();
    if (allowed && !allowed.has(parsed.email.toLowerCase())) {
      return null;
    }
    return { email: parsed.email, name: parsed.name, picture: parsed.picture };
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, user: AuthUser): void {
  const payload = { ...user, exp: Date.now() + SESSION_TTL_MS };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = signPayload(payloadB64);
  res.cookie(COOKIE_NAME, `${payloadB64}.${sig}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function getLoginAuthUrl(): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth is not configured.');
  }
  const client = new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
  return client.generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    state: 'login',
    prompt: 'select_account',
  });
}

export async function handleLoginCallback(code: string): Promise<AuthUser> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth is not configured.');
  }
  const client = new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) {
    throw new Error('Missing Google ID token.');
  }
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: clientId,
  });
  const payload = ticket.getPayload();
  const email = payload?.email?.toLowerCase();
  if (!email || !payload?.email_verified) {
    throw new Error('Google account email is not verified.');
  }
  const allowed = getAllowedEmails();
  if (allowed && !allowed.has(email)) {
    throw new Error('unauthorized');
  }
  return {
    email,
    name: payload.name,
    picture: payload.picture,
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthEnabled()) {
    next();
    return;
  }
  if (req.path.startsWith('/auth/') || req.path === '/gcal/callback') {
    next();
    return;
  }
  if (!getSessionUser(req)) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}
