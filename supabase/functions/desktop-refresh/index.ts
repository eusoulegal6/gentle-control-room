import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import {
  signDesktopAccessToken,
  generateRefreshToken,
  hashToken,
  getRefreshTokenExpiry,
} from '../_shared/desktop-auth.ts';

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const body = await req.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      return errorResponse('refreshToken is required');
    }

    const serviceClient = createServiceClient();
    const tokenHash = await hashToken(refreshToken);

    const { data: session, error } = await serviceClient
      .from('desktop_sessions')
      .select('id, desktop_user_id, revoked_at, expires_at')
      .eq('refresh_token_hash', tokenHash)
      .single();

    if (error || !session || session.revoked_at || new Date(session.expires_at) <= new Date()) {
      return errorResponse('Invalid refresh token', 401);
    }

    // Verify user is still active
    const { data: user } = await serviceClient
      .from('desktop_users')
      .select('id, username, display_name, status, must_reset_password')
      .eq('id', session.desktop_user_id)
      .single();

    if (!user || user.status !== 'ACTIVE') {
      return errorResponse('Account is disabled', 403);
    }

    // Token rotation: revoke old, create new
    const newRefreshToken = generateRefreshToken();
    const newTokenHash = await hashToken(newRefreshToken);
    const newExpiry = getRefreshTokenExpiry();

    await serviceClient
      .from('desktop_sessions')
      .update({
        refresh_token_hash: newTokenHash,
        expires_at: newExpiry,
        user_agent: req.headers.get('user-agent'),
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      })
      .eq('id', session.id);

    const accessToken = await signDesktopAccessToken(user.id, user.username, session.id);

    return jsonResponse({
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        status: user.status,
        mustResetPassword: user.must_reset_password,
      },
    });
  } catch (err) {
    console.error('desktop-refresh error:', err);
    return errorResponse('Internal server error', 500);
  }
});