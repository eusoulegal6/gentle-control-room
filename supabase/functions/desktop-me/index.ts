import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { requireDesktopUser } from '../_shared/desktop-auth.ts';

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const { user } = await requireDesktopUser(req);

    return jsonResponse({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        status: user.status,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return errorResponse('Unauthorized', 401);
    }
    console.error('desktop-me error:', err);
    return errorResponse('Internal server error', 500);
  }
});