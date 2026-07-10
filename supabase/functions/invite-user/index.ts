// Edge Function : invite-user
// Permet à un admin (Clara) d'inviter un nouveau membre par e-mail.
// L'utilisateur reçoit un e-mail Supabase pour définir son mot de passe :
// c'est cette étape qui "valide" son compte via son adresse e-mail.
//
// Déploiement : supabase functions deploy invite-user
// Secrets nécessaires (déjà présents par défaut sur Supabase) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// URL de votre site une fois déployé (ex. https://pole-pedagogique.vercel.app).
// Modifiez cette valeur ou définissez le secret SITE_URL après déploiement.
const SITE_URL = Deno.env.get("SITE_URL") ?? "http://localhost:5173";

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

    // Client "au nom de l'appelant" pour vérifier qui fait la demande
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();

    if (userError || !user) return json({ error: "Non authentifié." }, 401);

    // Client admin (clé service_role) pour vérifier le rôle et créer l'invitation
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || callerProfile?.role !== "admin") {
      return json({ error: "Seul un administrateur peut inviter un membre." }, 403);
    }

    const { email, nom, prenom, role } = await req.json();

    if (!email || !nom || !prenom || !role) {
      return json({ error: "Champs requis : email, nom, prenom, role." }, 400);
    }
    if (!["admin", "editor", "viewer"].includes(role)) {
      return json({ error: "Rôle invalide." }, 400);
    }

    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: { nom, prenom, role },
        redirectTo: `${SITE_URL}/definir-mot-de-passe`,
      }
    );

    if (inviteError) return json({ error: inviteError.message }, 400);

    await adminClient.from("invitations").insert({
      email,
      nom,
      prenom,
      role,
      invited_by: user.id,
    });

    return json({ ok: true, user: invited.user });
  } catch (err) {
    return json({ error: (err as Error).message ?? "Erreur inconnue." }, 500);
  }
});
