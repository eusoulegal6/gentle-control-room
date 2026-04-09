import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAuthClient, createServiceClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('Unauthorized', 401);
    }

    const supabase = createAuthClient(authHeader);
    const token = authHeader.replace('Bearer ', '');
    const { data, error } = await supabase.auth.getClaims(token);

    if (error || !data?.claims?.sub) {
      return errorResponse('Unauthorized', 401);
    }

    const userId = data.claims.sub as string;
    const email = data.claims.email as string;

    const serviceClient = createServiceClient();

    // Check if any admin exists
    const { count } = await serviceClient
      .from('admin_profiles')
      .select('id', { count: 'exact', head: true });

    if (count && count > 0) {
      // Check if THIS user is already an admin
      const { data: existing } = await serviceClient
        .from('admin_profiles')
        .select('id')
        .eq('id', userId)
        .single();

      if (existing) {
        return jsonResponse({ admin: { id: userId, email, role: 'admin' }, created: false });
      }

      return errorResponse('An admin already exists. Contact the existing admin.', 403);
    }

    // Create first admin
    const { data: admin, error: insertError } = await serviceClient
      .from('admin_profiles')
      .insert({ id: userId, email, role: 'admin' })
      .select()
      .single();

    if (insertError) {
      return errorResponse('Failed to create admin profile: ' + insertError.message, 500);
    }

    return jsonResponse({ admin: { id: admin.id, email: admin.email, role: admin.role }, created: true }, 201);
  } catch (err) {
    console.error('admin-bootstrap error:', err);
    return errorResponse('Internal server error', 500);
  }
});