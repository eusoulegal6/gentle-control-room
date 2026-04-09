import { createServiceClient } from './supabase.ts';

const DESKTOP_JWT_SECRET = () => Deno.env.get('DESKTOP_JWT_SECRET') || Deno.env.get('SUPABASE_JWT_SECRET') || 'fallback-secret-change-me';
const ACCESS_TOKEN_TTL = 15 * 60; // 15 minutes in seconds
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

// Simple HMAC-SHA256 JWT implementation for Deno
async function hmacSign(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const enc = new TextEncoder();

  const b64Header = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const b64Payload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${b64Header}.${b64Payload}`));
  const b64Sig = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${b64Header}.${b64Payload}.${b64Sig}`;
}

async function hmacVerify(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const enc = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
  );

  // Decode the signature
  const sigStr = signature.replace(/-/g, '+').replace(/_/g, '/');
  const padded = sigStr + '='.repeat((4 - sigStr.length % 4) % 4);
  const sigBytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));

  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(`${header}.${payload}`));
  if (!valid) return null;

  const payloadStr = payload.replace(/-/g, '+').replace(/_/g, '/');
  const payloadPadded = payloadStr + '='.repeat((4 - payloadStr.length % 4) % 4);
  const decoded = JSON.parse(atob(payloadPadded));

  if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
    return null; // expired
  }

  return decoded;
}

export async function signDesktopAccessToken(userId: string, username: string, sessionId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return hmacSign({
    sub: userId,
    username,
    sessionId,
    role: 'desktop',
    iat: now,
    exp: now + ACCESS_TOKEN_TTL,
  }, DESKTOP_JWT_SECRET());
}

export async function verifyDesktopAccessToken(token: string): Promise<Record<string, unknown> | null> {
  return hmacVerify(token, DESKTOP_JWT_SECRET());
}

export function generateRefreshToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashToken(token: string): Promise<string> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(token));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function getRefreshTokenExpiry(): string {
  return new Date(Date.now() + REFRESH_TOKEN_TTL * 1000).toISOString();
}

export async function requireDesktopUser(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('UNAUTHORIZED');
  }

  const token = authHeader.replace('Bearer ', '');
  const claims = await verifyDesktopAccessToken(token);

  if (!claims || !claims.sub || claims.role !== 'desktop') {
    throw new Error('UNAUTHORIZED');
  }

  // Verify session is still valid
  const serviceClient = createServiceClient();
  const { data: session } = await serviceClient
    .from('desktop_sessions')
    .select('id, revoked_at, expires_at, desktop_user_id')
    .eq('id', claims.sessionId as string)
    .single();

  if (!session || session.revoked_at || new Date(session.expires_at) <= new Date()) {
    throw new Error('UNAUTHORIZED');
  }

  // Verify user is active
  const { data: user } = await serviceClient
    .from('desktop_users')
    .select('id, username, display_name, status')
    .eq('id', claims.sub as string)
    .single();

  if (!user || user.status !== 'ACTIVE') {
    throw new Error('UNAUTHORIZED');
  }

  return {
    userId: claims.sub as string,
    username: claims.username as string,
    sessionId: claims.sessionId as string,
    user,
  };
}