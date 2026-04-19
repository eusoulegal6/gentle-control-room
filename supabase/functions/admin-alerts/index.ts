import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
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

function serializeAlert(a: Record<string, unknown>, senderEmail = "") {
  return {
    id: a.id,
    recipientId: a.recipient_id,
    recipientUsername: a.recipient_username,
    senderId: a.created_by,
    senderEmail,
    title: a.title,
    message: a.message,
    status: a.status,
    createdAt: a.created_at,
    deliveredAt: a.delivered_at,
    readAt: a.read_at,
    acknowledgedAt: a.acknowledged_at ?? null,
  };
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

    // Verify admin
    const { data: adminProfile } = await supabase
      .from("admin_profiles")
      .select("id, email, role")
      .eq("id", adminId)
      .single();

    if (!adminProfile) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isSuperAdmin = adminProfile.role === "super_admin";

    // LIST alerts (scoped to current admin unless super)
    if (req.method === "GET") {
      let query = supabase
        .from("alerts")
        .select("*")
        .order("created_at", { ascending: false });

      if (!isSuperAdmin) {
        query = query.eq("created_by", adminId);
      }

      const { data: alerts, error } = await query;
      if (error) throw error;

      const serialized = (alerts || []).map((a) => serializeAlert(a));

      return new Response(JSON.stringify({ alerts: serialized }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CREATE alert(s) — supports single recipientId or array recipientIds
    if (req.method === "POST") {
      const body = await req.json();
      const { recipientId, recipientIds, message, title } = body;

      // Normalize to array
      let ids: string[] = [];
      if (Array.isArray(recipientIds) && recipientIds.length > 0) {
        ids = recipientIds;
      } else if (recipientId) {
        ids = [recipientId];
      }

      if (ids.length === 0 || !message) {
        return new Response(JSON.stringify({ error: "recipientId(s) and message are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch recipients — scoped to this admin's own staff (super sees all)
      let recipientsQuery = supabase
        .from("desktop_users")
        .select("id, username, status, created_by")
        .in("id", ids);

      if (!isSuperAdmin) {
        recipientsQuery = recipientsQuery.eq("created_by", adminId);
      }

      const { data: recipients } = await recipientsQuery;

      if (!recipients || recipients.length === 0) {
        return new Response(JSON.stringify({ error: "No valid recipients found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const activeRecipients = recipients.filter((r) => r.status === "ACTIVE");
      if (activeRecipients.length === 0) {
        return new Response(JSON.stringify({ error: "No active recipients found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Bulk insert
      const rows = activeRecipients.map((r) => ({
        recipient_id: r.id,
        recipient_username: r.username,
        message,
        title: title || "New Alert",
        created_by: adminId,
        status: "PENDING",
      }));

      const { data: alerts, error } = await supabase
        .from("alerts")
        .insert(rows)
        .select("*");

      if (error) throw error;

      const serialized = (alerts || []).map((a) => serializeAlert(a, adminProfile.email));

      return new Response(
        JSON.stringify({ alerts: serialized }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
