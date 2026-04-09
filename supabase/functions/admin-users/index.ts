import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { hashPassword } from "../_shared/password.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function getAdminId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const adminId = await getAdminId(req);
    if (!adminId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify admin profile exists
    const { data: adminProfile } = await supabase
      .from("admin_profiles")
      .select("id")
      .eq("id", adminId)
      .single();

    if (!adminProfile) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const userId = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;

    // LIST
    if (req.method === "GET" && !userId) {
      const { data: users, error } = await supabase
        .from("desktop_users")
        .select("id, username, display_name, status, created_at, updated_at, created_by")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const { data: alertCounts } = await supabase
        .from("alerts")
        .select("recipient_id");

      const countMap: Record<string, number> = {};
      for (const a of alertCounts || []) {
        countMap[a.recipient_id] = (countMap[a.recipient_id] || 0) + 1;
      }

      const serialized = (users || []).map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        status: u.status,
        createdAt: u.created_at,
        updatedAt: u.updated_at,
        alertCount: countMap[u.id] || 0,
      }));

      return new Response(JSON.stringify({ users: serialized }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CREATE
    if (req.method === "POST") {
      const body = await req.json();
      const { username, password, displayName } = body;

      if (!username || !password) {
        return new Response(JSON.stringify({ error: "Username and password are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existing } = await supabase
        .from("desktop_users")
        .select("id")
        .eq("username", username)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ error: "Username already exists" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const password_hash = await hashPassword(password);

      const { data: user, error } = await supabase
        .from("desktop_users")
        .insert({
          username,
          password_hash,
          display_name: displayName || null,
          created_by: adminId,
          status: "ACTIVE",
        })
        .select("id, username, display_name, status, created_at, updated_at")
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({
          user: {
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            status: user.status,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
            alertCount: 0,
          },
        }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // UPDATE
    if (req.method === "PATCH" && userId) {
      const body = await req.json();
      const updates: Record<string, unknown> = {};

      if (body.username !== undefined) updates.username = body.username;
      if (body.displayName !== undefined) updates.display_name = body.displayName;
      if (body.status !== undefined) updates.status = body.status;
      if (body.password) {
        updates.password_hash = await hashPassword(body.password);
      }

      const { data: user, error } = await supabase
        .from("desktop_users")
        .update(updates)
        .eq("id", userId)
        .select("id, username, display_name, status, created_at, updated_at")
        .single();

      if (error) throw error;

      const { count } = await supabase
        .from("alerts")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId);

      return new Response(
        JSON.stringify({
          user: {
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            status: user.status,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
            alertCount: count || 0,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // DELETE
    if (req.method === "DELETE" && userId) {
      const { error } = await supabase.from("desktop_users").delete().eq("id", userId);
      if (error) throw error;
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
