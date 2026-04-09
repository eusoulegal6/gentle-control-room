import { createAuthClient, createServiceClient } from './supabase.ts';

export async function requireAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('UNAUTHORIZED');
  }

  const supabase = createAuthClient(authHeader);
  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabase.auth.getClaims(token);

  if (error || !data?.claims?.sub) {
    throw new Error('UNAUTHORIZED');
  }

  const userId = data.claims.sub as string;

  const serviceClient = createServiceClient();
  const { data: adminProfile, error: profileError } = await serviceClient
    .from('admin_profiles')
    .select('id, email, role')
    .eq('id', userId)
    .single();

  if (profileError || !adminProfile) {
    throw new Error('FORBIDDEN');
  }

  return { userId, email: adminProfile.email, role: adminProfile.role };
}