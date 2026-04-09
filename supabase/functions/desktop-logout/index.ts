import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { hashToken } from '../_shared/desktop-auth.ts';

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

    await serviceClient
      .from('desktop_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('refresh_token_hash', tokenHash)
      .is('revoked_at', null);

    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    console.error('desktop-logout error:', err);
    return errorResponse('Internal server error', 500);
  }
});