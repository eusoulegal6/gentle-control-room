import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { verifyPassword } from "../_shared/password.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Encode(bytes).replace(/[+/=]/g, (c) =>
    c === "+" ? "-" : c === "/" ? "_" : ""
  );
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const pathAction = pathParts[pathParts.length - 1];

    // Support action from URL path OR from request body
    let action = pathAction;
    let body: Record<string, unknown> = {};

    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
      // If the last path segment is the function name itself, use body.action
      if (pathAction === "desktop-auth" && typeof body.action === "string") {
        action = body.action;
      }
    }

    // LOGIN
    if (req.method === "POST" && action === "login") {
      const { username, password } = body as { username?: string; password?: string };

      if (!username || !password) {
        return new Response(JSON.stringify({ error: "Username and password are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: user } = await supabase
        .from("desktop_users")
        .select("*")
        .eq("username", username)
        .eq("status", "ACTIVE")
        .single();

      if (!user) {
        return new Response(JSON.stringify({ error: "Invalid credentials" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        return new Response(JSON.stringify({ error: "Invalid credentials" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = generateToken();
      const refreshToken = generateToken();

      const { error: sessionError } = await supabase.from("desktop_sessions").insert({
        desktop_user_id: user.id,
        refresh_token_hash: await hashToken(refreshToken),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        ip_address: req.headers.get("x-forwarded-for") || null,
        user_agent: req.headers.get("user-agent") || null,
      });

      if (sessionError) throw sessionError;

      return new Response(
        JSON.stringify({
          user: {
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            status: user.status,
          },
          tokens: { accessToken, refreshToken },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // REFRESH
    if (req.method === "POST" && action === "refresh") {
      const { refreshToken } = body as { refreshToken?: string };

      if (!refreshToken) {
        return new Response(JSON.stringify({ error: "Refresh token required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const tokenHash = await hashToken(refreshToken);

      const { data: session } = await supabase
        .from("desktop_sessions")
        .select("*, desktop_users(*)")
        .eq("refresh_token_hash", tokenHash)
        .is("revoked_at", null)
        .single();

      if (!session || new Date(session.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newRefreshToken = generateToken();
      await supabase
        .from("desktop_sessions")
        .update({ refresh_token_hash: await hashToken(newRefreshToken) })
        .eq("id", session.id);

      const newAccessToken = generateToken();
      const user = session.desktop_users;

      return new Response(
        JSON.stringify({
          user: {
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            status: user.status,
          },
          tokens: { accessToken: newAccessToken, refreshToken: newRefreshToken },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // LOGOUT
    if (req.method === "POST" && action === "logout") {
      const { refreshToken } = body as { refreshToken?: string };
      if (refreshToken) {
        const tokenHash = await hashToken(refreshToken);
        await supabase
          .from("desktop_sessions")
          .update({ revoked_at: new Date().toISOString() })
          .eq("refresh_token_hash", tokenHash);
      }

      return new Response(null, { status: 204, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
