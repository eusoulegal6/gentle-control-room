import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

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

    // Verify admin
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

    // LIST alerts
    if (req.method === "GET") {
      const { data: alerts, error } = await supabase
        .from("alerts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const serialized = (alerts || []).map((a) => ({
        id: a.id,
        recipientId: a.recipient_id,
        recipientUsername: a.recipient_username,
        senderId: a.created_by,
        senderEmail: "",
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

    // CREATE alert
    if (req.method === "POST") {
      const body = await req.json();
      const { recipientId, message, title } = body;

      if (!recipientId || !message) {
        return new Response(JSON.stringify({ error: "recipientId and message are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify recipient exists and is active
      const { data: recipient } = await supabase
        .from("desktop_users")
        .select("id, username, status")
        .eq("id", recipientId)
        .single();

      if (!recipient) {
        return new Response(JSON.stringify({ error: "Recipient not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (recipient.status !== "ACTIVE") {
        return new Response(JSON.stringify({ error: "Recipient is not active" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: alert, error } = await supabase
        .from("alerts")
        .insert({
          recipient_id: recipientId,
          recipient_username: recipient.username,
          message,
          title: title || "New Alert",
          created_by: adminId,
          status: "PENDING",
        })
        .select("*")
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({
          alert: {
            id: alert.id,
            recipientId: alert.recipient_id,
            recipientUsername: alert.recipient_username,
            senderId: alert.created_by,
            senderEmail: adminProfile.email,
            title: alert.title,
            message: alert.message,
            status: alert.status,
            createdAt: alert.created_at,
            deliveredAt: alert.delivered_at,
            readAt: alert.read_at,
          },
        }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
