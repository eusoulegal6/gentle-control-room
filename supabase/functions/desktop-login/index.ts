import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { verifyPassword } from '../_shared/password.ts';
import {
  signDesktopAccessToken,
  generateRefreshToken,
  hashToken,
  getRefreshTokenExpiry,
} from '../_shared/desktop-auth.ts';

// Simple in-memory rate limiter
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
    if (!checkRateLimit(ip)) {
      return errorResponse('Too many login attempts. Please try again later.', 429);
    }

    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return errorResponse('Username and password are required');
    }

    const serviceClient = createServiceClient();

    const { data: user, error } = await serviceClient
      .from('desktop_users')
      .select('id, username, display_name, password_hash, status, must_reset_password')
      .eq('username', username.trim().toLowerCase())
      .single();

    if (error || !user) {
      return errorResponse('Invalid credentials', 401);
    }

    if (user.status !== 'ACTIVE') {
      return errorResponse('Account is disabled', 403);
    }

    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      return errorResponse('Invalid credentials', 401);
    }

    // Create session
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = await hashToken(refreshToken);
    const expiresAt = getRefreshTokenExpiry();

    const { data: session, error: sessionError } = await serviceClient
      .from('desktop_sessions')
      .insert({
        desktop_user_id: user.id,
        refresh_token_hash: refreshTokenHash,
        expires_at: expiresAt,
        user_agent: req.headers.get('user-agent'),
        ip_address: ip,
      })
      .select('id')
      .single();

    if (sessionError || !session) {
      return errorResponse('Failed to create session', 500);
    }

    const accessToken = await signDesktopAccessToken(user.id, user.username, session.id);

    return jsonResponse({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        status: user.status,
        mustResetPassword: user.must_reset_password,
      },
    });
  } catch (err) {
    console.error('desktop-login error:', err);
    return errorResponse('Internal server error', 500);
  }
});