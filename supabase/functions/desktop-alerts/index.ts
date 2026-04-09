import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { requireDesktopUser } from '../_shared/desktop-auth.ts';
import { createServiceClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const { userId } = await requireDesktopUser(req);
    const serviceClient = createServiceClient();
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // POST /desktop-alerts/:id/delivered
    // POST /desktop-alerts/:id/read
    if (req.method === 'POST' && pathParts.length >= 3) {
      const action = pathParts[pathParts.length - 1]; // 'delivered' or 'read'
      const alertId = pathParts[pathParts.length - 2];

      if (!['delivered', 'read'].includes(action)) {
        return errorResponse('Invalid action', 400);
      }

      // Verify alert belongs to this user
      const { data: alert, error: findError } = await serviceClient
        .from('alerts')
        .select('*')
        .eq('id', alertId)
        .eq('recipient_id', userId)
        .single();

      if (findError || !alert) {
        return errorResponse('Alert not found', 404);
      }

      const now = new Date().toISOString();
      const updates: Record<string, unknown> = {};

      if (action === 'delivered') {
        if (alert.status === 'PENDING') {
          updates.status = 'DELIVERED';
        }
        if (!alert.delivered_at) {
          updates.delivered_at = now;
        }
      } else if (action === 'read') {
        updates.status = 'READ';
        if (!alert.delivered_at) updates.delivered_at = now;
        if (!alert.read_at) updates.read_at = now;
      }

      if (Object.keys(updates).length > 0) {
        const { data: updated, error: updateError } = await serviceClient
          .from('alerts')
          .update(updates)
          .eq('id', alertId)
          .select()
          .single();

        if (updateError) return errorResponse(updateError.message, 500);

        return jsonResponse({
          alert: {
            id: updated.id,
            recipientId: updated.recipient_id,
            title: updated.title,
            message: updated.message,
            status: updated.status,
            createdAt: updated.created_at,
            deliveredAt: updated.delivered_at,
            readAt: updated.read_at,
          },
        });
      }

      return jsonResponse({
        alert: {
          id: alert.id,
          recipientId: alert.recipient_id,
          title: alert.title,
          message: alert.message,
          status: alert.status,
          createdAt: alert.created_at,
          deliveredAt: alert.delivered_at,
          readAt: alert.read_at,
        },
      });
    }

    // GET /desktop-alerts - list own alerts
    if (req.method === 'GET') {
      const status = url.searchParams.get('status');
      const limit = parseInt(url.searchParams.get('limit') || '50');

      let query = serviceClient
        .from('alerts')
        .select('*')
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false })
        .limit(Math.min(limit, 200));

      if (status && status !== 'ALL') {
        query = query.eq('status', status);
      }

      const { data: alerts, error } = await query;

      if (error) return errorResponse(error.message, 500);

      const serialized = alerts?.map(a => ({
        id: a.id,
        recipientId: a.recipient_id,
        title: a.title,
        message: a.message,
        status: a.status,
        createdAt: a.created_at,
        deliveredAt: a.delivered_at,
        readAt: a.read_at,
      })) || [];

      return jsonResponse({ alerts: serialized });
    }

    return errorResponse('Method not allowed', 405);
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return errorResponse('Unauthorized', 401);
    }
    console.error('desktop-alerts error:', err);
    return errorResponse('Internal server error', 500);
  }
});