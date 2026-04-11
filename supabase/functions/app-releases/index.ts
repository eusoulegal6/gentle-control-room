import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

function serializeRelease(r: Record<string, unknown>) {
  return {
    id: r.id,
    version: r.version,
    downloadUrl: r.download_url,
    releaseNotes: r.release_notes ?? null,
    publishedAt: r.published_at,
    createdBy: r.created_by ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // GET — return latest release (no auth required)
    if (req.method === "GET") {
      const { data: releases, error } = await supabase
        .from("app_releases")
        .select("*")
        .order("published_at", { ascending: false })
        .limit(1);

      if (error) throw error;

      const latest = releases && releases.length > 0 ? serializeRelease(releases[0]) : null;

      return new Response(JSON.stringify({ release: latest }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST — publish a new release (admin auth required)
    if (req.method === "POST") {
      const adminId = await getAdminId(req);
      if (!adminId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: adminProfile } = await supabase
        .from("admin_profiles")
        .select("id, email")
        .eq("id", adminId)
        .single();

      if (!adminProfile) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = await req.json();
      const { version, downloadUrl, releaseNotes, notify } = body;

      if (!version || !downloadUrl) {
        return new Response(JSON.stringify({ error: "version and downloadUrl are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Insert release
      const { data: release, error: insertError } = await supabase
        .from("app_releases")
        .insert({
          version,
          download_url: downloadUrl,
          release_notes: releaseNotes ?? null,
          created_by: adminId,
        })
        .select("*")
        .single();

      if (insertError) {
        if (insertError.code === "23505") {
          return new Response(JSON.stringify({ error: `Version ${version} already exists` }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw insertError;
      }

      // Optionally notify all active desktop users
      if (notify) {
        const { data: activeUsers } = await supabase
          .from("desktop_users")
          .select("id, username")
          .eq("status", "ACTIVE");

        if (activeUsers && activeUsers.length > 0) {
          const alertRows = activeUsers.map((u) => ({
            recipient_id: u.id,
            recipient_username: u.username,
            title: `Update Available: v${version}`,
            message: `A new version (v${version}) is available.\n\n${releaseNotes ?? ""}`.trim(),
            created_by: adminId,
            status: "PENDING",
          }));

          await supabase.from("alerts").insert(alertRows);
        }
      }

      return new Response(JSON.stringify({ release: serializeRelease(release) }), {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error(err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
