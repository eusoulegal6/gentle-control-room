import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { createServiceClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const admin = await requireAdmin(req);
    const serviceClient = createServiceClient();
    const url = new URL(req.url);

    // GET /admin-alerts - list alerts
    if (req.method === 'GET') {
      const recipientId = url.searchParams.get('recipientId');
      const status = url.searchParams.get('status');

      let query = serviceClient
        .from('alerts')
        .select('*')
        .order('created_at', { ascending: false });

      if (recipientId) query = query.eq('recipient_id', recipientId);
      if (status) query = query.eq('status', status);

      const { data: alerts, error } = await query;

      if (error) return errorResponse(error.message, 500);

      const serialized = alerts?.map(a => ({
        id: a.id,
        recipientId: a.recipient_id,
        recipientUsername: a.recipient_username,
        title: a.title,
        message: a.message,
        status: a.status,
        createdAt: a.created_at,
        deliveredAt: a.delivered_at,
        readAt: a.read_at,
        createdBy: a.created_by,
      })) || [];

      return jsonResponse({ alerts: serialized });
    }

    // POST /admin-alerts - create alert
    if (req.method === 'POST') {
      const body = await req.json();
      const { recipientId, title, message } = body;

      if (!recipientId) return errorResponse('recipientId is required');
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return errorResponse('message is required');
      }

      // Verify recipient exists and is active
      const { data: recipient, error: recipientError } = await serviceClient
        .from('desktop_users')
        .select('id, username, status')
        .eq('id', recipientId)
        .single();

      if (recipientError || !recipient) {
        return errorResponse('Desktop user not found', 404);
      }
      if (recipient.status !== 'ACTIVE') {
        return errorResponse('Cannot send alerts to a disabled user', 409);
      }

      const { data: alert, error } = await serviceClient
        .from('alerts')
        .insert({
          recipient_id: recipient.id,
          recipient_username: recipient.username,
          title: title?.trim() || 'New Alert',
          message: message.trim(),
          created_by: admin.userId,
        })
        .select()
        .single();

      if (error) return errorResponse(error.message, 500);

      return jsonResponse({
        alert: {
          id: alert.id,
          recipientId: alert.recipient_id,
          recipientUsername: alert.recipient_username,
          title: alert.title,
          message: alert.message,
          status: alert.status,
          createdAt: alert.created_at,
          deliveredAt: alert.delivered_at,
          readAt: alert.read_at,
          createdBy: alert.created_by,
        },
      }, 201);
    }

    return errorResponse('Method not allowed', 405);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'UNAUTHORIZED') return errorResponse('Unauthorized', 401);
      if (err.message === 'FORBIDDEN') return errorResponse('Forbidden', 403);
    }
    console.error('admin-alerts error:', err);
    return errorResponse('Internal server error', 500);
  }
});