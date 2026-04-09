import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { hashPassword, generateTempPassword } from '../_shared/password.ts';

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const admin = await requireAdmin(req);
    const serviceClient = createServiceClient();
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    // pathParts: ["admin-users"] or ["admin-users", "<id>"] or ["admin-users", "<id>", "reset-password"]

    const userId = pathParts.length >= 2 ? pathParts[pathParts.length - 1] : null;
    const isResetPassword = pathParts.length >= 3 && pathParts[pathParts.length - 1] === 'reset-password';
    const actualUserId = isResetPassword ? pathParts[pathParts.length - 2] : userId;

    // POST /admin-users/:id/reset-password
    if (req.method === 'POST' && isResetPassword && actualUserId) {
      const { data: user } = await serviceClient
        .from('desktop_users')
        .select('id, username')
        .eq('id', actualUserId)
        .single();

      if (!user) return errorResponse('Desktop user not found', 404);

      const tempPassword = generateTempPassword();
      const hashedPassword = await hashPassword(tempPassword);

      await serviceClient
        .from('desktop_users')
        .update({ password_hash: hashedPassword, must_reset_password: true })
        .eq('id', actualUserId);

      // Revoke all sessions for this user
      await serviceClient
        .from('desktop_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('desktop_user_id', actualUserId)
        .is('revoked_at', null);

      return jsonResponse({
        message: 'Password has been reset.',
        temporaryPassword: tempPassword,
        username: user.username,
      });
    }

    // GET /admin-users - list all
    if (req.method === 'GET' && !actualUserId) {
      const { data: users, error } = await serviceClient
        .from('desktop_users')
        .select('id, username, display_name, status, must_reset_password, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) return errorResponse(error.message, 500);

      // Get alert counts
      const { data: alertCounts } = await serviceClient
        .from('alerts')
        .select('recipient_id');

      const countMap: Record<string, number> = {};
      alertCounts?.forEach((a: { recipient_id: string }) => {
        countMap[a.recipient_id] = (countMap[a.recipient_id] || 0) + 1;
      });

      const usersWithCounts = users?.map(u => ({
        ...u,
        displayName: u.display_name,
        alertCount: countMap[u.id] || 0,
        createdAt: u.created_at,
        updatedAt: u.updated_at,
        mustResetPassword: u.must_reset_password,
      })) || [];

      return jsonResponse({ users: usersWithCounts });
    }

    // GET /admin-users/:id - get single user
    if (req.method === 'GET' && actualUserId) {
      const { data: user, error } = await serviceClient
        .from('desktop_users')
        .select('id, username, display_name, status, must_reset_password, created_at, updated_at')
        .eq('id', actualUserId)
        .single();

      if (error || !user) return errorResponse('Desktop user not found', 404);

      const { count } = await serviceClient
        .from('alerts')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', actualUserId);

      return jsonResponse({
        user: {
          ...user,
          displayName: user.display_name,
          alertCount: count || 0,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
          mustResetPassword: user.must_reset_password,
        },
      });
    }

    // POST /admin-users - create user
    if (req.method === 'POST' && !actualUserId) {
      const body = await req.json();
      const { username, password, displayName, status } = body;

      if (!username || typeof username !== 'string' || username.trim().length < 3) {
        return errorResponse('Username must be at least 3 characters');
      }
      if (!password || typeof password !== 'string' || password.length < 8) {
        return errorResponse('Password must be at least 8 characters');
      }

      const hashedPassword = await hashPassword(password);

      const { data: user, error } = await serviceClient
        .from('desktop_users')
        .insert({
          username: username.trim().toLowerCase(),
          display_name: displayName?.trim() || null,
          password_hash: hashedPassword,
          status: status || 'ACTIVE',
          created_by: admin.userId,
        })
        .select('id, username, display_name, status, must_reset_password, created_at, updated_at')
        .single();

      if (error) {
        if (error.code === '23505') {
          return errorResponse('Username already exists', 409);
        }
        return errorResponse(error.message, 500);
      }

      return jsonResponse({
        user: {
          ...user,
          displayName: user.display_name,
          alertCount: 0,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
          mustResetPassword: user.must_reset_password,
        },
        temporaryPassword: password,
      }, 201);
    }

    // PATCH /admin-users/:id - update user
    if (req.method === 'PATCH' && actualUserId) {
      const body = await req.json();
      const updates: Record<string, unknown> = {};

      if (body.username !== undefined) {
        if (typeof body.username !== 'string' || body.username.trim().length < 3) {
          return errorResponse('Username must be at least 3 characters');
        }
        updates.username = body.username.trim().toLowerCase();
      }
      if (body.displayName !== undefined) {
        updates.display_name = body.displayName?.trim() || null;
      }
      if (body.password !== undefined) {
        if (typeof body.password !== 'string' || body.password.length < 8) {
          return errorResponse('Password must be at least 8 characters');
        }
        updates.password_hash = await hashPassword(body.password);
      }
      if (body.status !== undefined) {
        if (!['ACTIVE', 'DISABLED'].includes(body.status)) {
          return errorResponse('Invalid status');
        }
        updates.status = body.status;
      }

      if (Object.keys(updates).length === 0) {
        return errorResponse('At least one field must be provided');
      }

      const { data: user, error } = await serviceClient
        .from('desktop_users')
        .update(updates)
        .eq('id', actualUserId)
        .select('id, username, display_name, status, must_reset_password, created_at, updated_at')
        .single();

      if (error) {
        if (error.code === '23505') {
          return errorResponse('Username already exists', 409);
        }
        return errorResponse(error.message, 500);
      }
      if (!user) return errorResponse('Desktop user not found', 404);

      // If password changed or user disabled, revoke sessions
      if (updates.password_hash || updates.status === 'DISABLED') {
        await serviceClient
          .from('desktop_sessions')
          .update({ revoked_at: new Date().toISOString() })
          .eq('desktop_user_id', actualUserId)
          .is('revoked_at', null);
      }

      const { count } = await serviceClient
        .from('alerts')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', actualUserId);

      return jsonResponse({
        user: {
          ...user,
          displayName: user.display_name,
          alertCount: count || 0,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
          mustResetPassword: user.must_reset_password,
        },
      });
    }

    // DELETE /admin-users/:id
    if (req.method === 'DELETE' && actualUserId) {
      const { error } = await serviceClient
        .from('desktop_users')
        .delete()
        .eq('id', actualUserId);

      if (error) return errorResponse(error.message, 500);
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    return errorResponse('Method not allowed', 405);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'UNAUTHORIZED') return errorResponse('Unauthorized', 401);
      if (err.message === 'FORBIDDEN') return errorResponse('Forbidden', 403);
    }
    console.error('admin-users error:', err);
    return errorResponse('Internal server error', 500);
  }
});