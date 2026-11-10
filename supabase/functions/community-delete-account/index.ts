import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const buckets = ["community-avatars", "community-card-photos"];

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
async function listFiles(storage: any, bucket: string, prefix: string): Promise<string[]> {
  const files: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await storage.from(bucket).list(prefix, { limit: 100, offset });
    if (error) throw error;
    for (const item of data) {
      // Folders come back without an id; files have one.
      if (item.id) files.push(`${prefix}/${item.name}`);
      else files.push(...await listFiles(storage, bucket, `${prefix}/${item.name}`));
    }
    if (data.length < 100) return files;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Account deletion is missing Supabase server environment variables.");
    return jsonResponse({ error: "Account deletion is temporarily unavailable." }, 500);
  }
  if (!authorization) return jsonResponse({ error: "Sign in first." }, 401);

  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return jsonResponse({ error: "Sign in first." }, 401);
    const userId = userData.user.id;

    const { data: isAdmin, error: adminError } = await userClient.rpc("is_store_admin");
    if (adminError) throw adminError;
    if (isAdmin) {
      return jsonResponse({ error: "Store admin accounts can't be deleted here." }, 403);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    for (const bucket of buckets) {
      const files = await listFiles(adminClient.storage, bucket, userId);
      for (let i = 0; i < files.length; i += 100) {
        const { error } = await adminClient.storage.from(bucket).remove(files.slice(i, i + 100));
        if (error) throw error;
      }
    }

    // Profile, cards, likes, favorites, follows and notifications cascade from the auth user.
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;
    return jsonResponse({ deleted: true });
  } catch (error) {
    console.error("Account deletion failed.", error);
    return jsonResponse({ error: "Account deletion is temporarily unavailable." }, 500);
  }
});
