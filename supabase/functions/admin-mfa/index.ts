// Admin two-step verification (email-code based).
// Endpoints (path after /admin-mfa):
//   GET    /settings              -> { enabled }
//   POST   /settings              -> body { enabled: boolean }
//   POST   /challenge             -> body { email, password } (pre-session) -> { challengeId }
//   POST   /verify                -> body { challengeId, code } -> { accessToken, refreshToken }
//
// Notes:
//  - /challenge and /verify are unauthenticated (called before session exists).
//  - /settings requires an admin auth header (post-login).
//  - Codes are 6-digit, 10-minute TTL, max 5 attempts, hashed at rest.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SENDER_DOMAIN = "aiclothingmodel.com";
const SENDER_FROM = `Gentle Control Room <noreply@${SENDER_DOMAIN}>`;
const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getAdminFromAuthHeader(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function sendCodeEmail(to: string, code: string): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.warn("[admin-mfa] RESEND_API_KEY not set — code logged only");
    console.log(`[admin-mfa] DEV CODE for ${to}: ${code}`);
    return { ok: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: SENDER_FROM,
        to: [to],
        subject: `Your verification code: ${code}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #111;">Your verification code</h2>
            <p style="color: #555;">Use the code below to finish signing in. It expires in ${CODE_TTL_MINUTES} minutes.</p>
            <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; padding: 16px 24px; background: #f4f4f5; border-radius: 8px; text-align: center; margin: 24px 0;">
              ${code}
            </div>
            <p style="color: #888; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
          </div>
        `,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error("[admin-mfa] Resend send failed", res.status, txt);
      // Always log the code as a fallback so the user can still complete login
      console.log(`[admin-mfa] FALLBACK CODE for ${to}: ${code}`);
      return { ok: false, error: `Email send failed: ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[admin-mfa] Resend exception", e);
    console.log(`[admin-mfa] FALLBACK CODE for ${to}: ${code}`);
    return { ok: false, error: e instanceof Error ? e.message : "Unknown send error" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    // ['admin-mfa', '<sub>']
    const sub = parts[parts.length - 1];

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ===== /settings =====
    if (sub === "settings") {
      const adminId = await getAdminFromAuthHeader(req);
      if (!adminId) return json({ error: "Unauthorized" }, 401);

      if (req.method === "GET") {
        const { data } = await admin
          .from("admin_mfa_settings")
          .select("enabled")
          .eq("admin_id", adminId)
          .maybeSingle();
        return json({ enabled: !!data?.enabled });
      }

      if (req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        const enabled = !!body.enabled;
        const { error } = await admin
          .from("admin_mfa_settings")
          .upsert({ admin_id: adminId, enabled, updated_at: new Date().toISOString() });
        if (error) throw error;
        return json({ enabled });
      }
    }

    // ===== /challenge =====
    if (sub === "challenge" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!email || !password) return json({ error: "Email and password are required." }, 400);

      // Verify password by attempting sign-in
      const authClient = createClient(supabaseUrl, anonKey);
      const { data: signIn, error: signInErr } = await authClient.auth.signInWithPassword({ email, password });
      if (signInErr || !signIn?.user) return json({ error: "Invalid email or password." }, 401);
      const adminId = signIn.user.id;

      // Confirm admin is in admin_profiles
      const { data: profile } = await admin
        .from("admin_profiles")
        .select("id, email")
        .eq("id", adminId)
        .maybeSingle();
      if (!profile) {
        await authClient.auth.signOut();
        return json({ error: "Not authorised." }, 403);
      }

      // Sign out the temporary session — we only used it to validate password
      await authClient.auth.signOut();

      // Create challenge
      const code = generateCode();
      const code_hash = await sha256Hex(code);
      const expires_at = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();
      const { data: challenge, error: insErr } = await admin
        .from("admin_mfa_challenges")
        .insert({ admin_id: adminId, code_hash, expires_at })
        .select("id")
        .single();
      if (insErr) throw insErr;

      const sendResult = await sendCodeEmail(profile.email, code);

      return json({
        challengeId: challenge.id,
        emailDeliveryWarning: sendResult.ok ? null : sendResult.error,
      });
    }

    // ===== /verify =====
    if (sub === "verify" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
      const code = typeof body.code === "string" ? body.code.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!challengeId || !code || !password || !email) {
        return json({ error: "Missing required fields." }, 400);
      }

      const { data: challenge } = await admin
        .from("admin_mfa_challenges")
        .select("id, admin_id, code_hash, expires_at, consumed_at, attempts")
        .eq("id", challengeId)
        .maybeSingle();
      if (!challenge) return json({ error: "Invalid or expired code." }, 400);
      if (challenge.consumed_at) return json({ error: "Code already used." }, 400);
      if (new Date(challenge.expires_at).getTime() < Date.now()) {
        return json({ error: "Code expired." }, 400);
      }
      if (challenge.attempts >= MAX_ATTEMPTS) {
        return json({ error: "Too many attempts. Request a new code." }, 429);
      }

      const code_hash = await sha256Hex(code);
      if (code_hash !== challenge.code_hash) {
        await admin
          .from("admin_mfa_challenges")
          .update({ attempts: challenge.attempts + 1 })
          .eq("id", challenge.id);
        return json({ error: "Incorrect code." }, 400);
      }

      // Mark consumed
      await admin
        .from("admin_mfa_challenges")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", challenge.id);

      // Now actually create a session for the admin by signing in again
      const authClient = createClient(supabaseUrl, anonKey);
      const { data: signIn, error: signInErr } = await authClient.auth.signInWithPassword({ email, password });
      if (signInErr || !signIn?.session) return json({ error: "Sign-in failed." }, 401);
      if (signIn.user.id !== challenge.admin_id) return json({ error: "Account mismatch." }, 401);

      return json({
        accessToken: signIn.session.access_token,
        refreshToken: signIn.session.refresh_token,
      });
    }

    return json({ error: "Not found" }, 404);
  } catch (err: unknown) {
    console.error("[admin-mfa] error", err);
    return json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
  }
});
