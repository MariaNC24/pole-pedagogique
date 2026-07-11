// Edge Function : delete-user
// Permet à un admin (Clara ou un autre administrateur) de supprimer l'accès
// d'un membre de l'équipe (adresse e-mail) au site. Supprime le compte
// d'authentification ET la fiche profil.
//
// Déploiement : via l'éditeur Supabase (Edge Functions > Deploy a new function)
// tout comme invite-user, ou `supabase functions deploy delete-user`.
// Secrets nécessaires (déjà présents par défaut sur Supabase) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié." }, 401);

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();

    if (userError || !user) return json({ error: "Non authentifié." }, 401);

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || callerProfile?.role !== "admin") {
      return json({ error: "Seul un administrateur peut supprimer un accès." }, 403);
    }

    const { userId } = await req.json();
    if (!userId) return json({ error: "Champ requis : userId." }, 400);

    if (userId === user.id) {
      return json({ error: "Vous ne pouvez pas supprimer votre propre accès." }, 400);
    }

    // Supprime la fiche profil puis le compte d'authentification.
    await adminClient.from("profiles").delete().eq("id", userId);
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteError) return json({ error: deleteError.message }, 400);

    return json({ ok: true });
  } catch (err) {
    return json({ error: (err as Error).message ?? "Erreur inconnue." }, 500);
  }
});
