import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function getCallerProfile(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile } = await admin
    .from("admin_profiles")
    .select("id, email, role")
    .eq("id", user.id)
    .single();

  return profile;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const caller = await getCallerProfile(req);
    if (!caller || caller.role !== "super_admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const action = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;

    // GET /super-admin — list all admin profiles
    if (req.method === "GET" && !action) {
      const { data: admins, error } = await supabase
        .from("admin_profiles")
        .select("id, email, role, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return new Response(JSON.stringify({ admins: admins || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET /super-admin/signups — daily signup stats
    if (req.method === "GET" && action === "signups") {
      const { data, error } = await supabase
        .from("admin_profiles")
        .select("created_at")
        .order("created_at", { ascending: true });

      if (error) throw error;

      const dailyCounts: Record<string, number> = {};
      for (const row of data || []) {
        const day = row.created_at.slice(0, 10);
        dailyCounts[day] = (dailyCounts[day] || 0) + 1;
      }

      const signups = Object.entries(dailyCounts).map(([date, count]) => ({ date, count }));

      return new Response(JSON.stringify({ signups }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PATCH /super-admin/<id> — update admin role or email
    if (req.method === "PATCH" && action && action !== "signups") {
      const body = await req.json();
      const updates: Record<string, unknown> = {};

      if (body.role !== undefined) updates.role = body.role;
      if (body.email !== undefined) updates.email = body.email;

      if (Object.keys(updates).length === 0) {
        return new Response(JSON.stringify({ error: "No fields to update" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: admin, error } = await supabase
        .from("admin_profiles")
        .update(updates)
        .eq("id", action)
        .select("id, email, role, created_at, updated_at")
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ admin }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE /super-admin/<id> — remove admin profile
    if (req.method === "DELETE" && action) {
      if (action === caller.id) {
        return new Response(JSON.stringify({ error: "Cannot delete your own account" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabase.from("admin_profiles").delete().eq("id", action);
      if (error) throw error;

      return new Response(null, { status: 204, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
