import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);

    // GET /desktop-alerts?userId=xxx — list alerts for a desktop user
    if (req.method === "GET") {
      const userId = url.searchParams.get("userId");
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId query parameter required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: alerts, error } = await supabase
        .from("alerts")
        .select("*")
        .eq("recipient_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const serialized = (alerts || []).map((a) => ({
        id: a.id,
        title: a.title,
        message: a.message,
        status: a.status,
        createdAt: a.created_at,
        deliveredAt: a.delivered_at,
        readAt: a.read_at,
      }));

      return new Response(JSON.stringify({ alerts: serialized }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PATCH /desktop-alerts/{alertId} — mark as delivered or read
    if (req.method === "PATCH") {
      const alertId = pathParts[pathParts.length - 1];
      const body = await req.json();
      const updates: Record<string, unknown> = {};

      if (body.status === "DELIVERED") {
        updates.status = "DELIVERED";
        updates.delivered_at = new Date().toISOString();
      } else if (body.status === "READ") {
        updates.status = "READ";
        updates.read_at = new Date().toISOString();
      }

      if (Object.keys(updates).length === 0) {
        return new Response(JSON.stringify({ error: "No valid updates" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: alert, error } = await supabase
        .from("alerts")
        .update(updates)
        .eq("id", alertId)
        .select("*")
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({
          alert: {
            id: alert.id,
            title: alert.title,
            message: alert.message,
            status: alert.status,
            createdAt: alert.created_at,
            deliveredAt: alert.delivered_at,
            readAt: alert.read_at,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
