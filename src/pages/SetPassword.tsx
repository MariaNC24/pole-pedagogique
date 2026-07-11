import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import PasswordInput from "../components/PasswordInput";

// Cette page reçoit l'utilisateur après avoir cliqué sur le lien reçu par
// e-mail (invitation ou réinitialisation de mot de passe).
//
// Sur certains liens, la session n'est pas encore posée automatiquement au
// moment où la page s'affiche (ex. lien déjà ouvert une première fois par un
// filtre anti-spam de la messagerie, ou léger délai de traitement du jeton
// dans l'adresse). On vérifie donc nous-mêmes, au chargement, s'il y a un
// jeton dans l'adresse et on établit la session manuellement si besoin —
// pour éviter l'erreur "Auth session missing" au moment de valider le
// mot de passe.
export default function SetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [lienInvalide, setLienInvalide] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    async function ensureSession() {
      // 1. Session déjà posée automatiquement (cas normal) ?
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        setChecking(false);
        return;
      }

      // 2. Ancien format de lien : jetons dans le fragment "#..." de l'adresse.
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error: setErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        setChecking(false);
        if (setErr) setLienInvalide(true);
        return;
      }

      // 3. Nouveau format de lien : "token_hash" + "type" en paramètres d'adresse.
      const queryParams = new URLSearchParams(window.location.search);
      const tokenHash = queryParams.get("token_hash") ?? hashParams.get("token_hash");
      const type = (queryParams.get("type") ?? hashParams.get("type") ?? "invite") as
        | "invite"
        | "recovery"
        | "email";
      if (tokenHash) {
        const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        setChecking(false);
        if (verifyErr) setLienInvalide(true);
        return;
      }

      // 4. Aucun jeton trouvé du tout dans l'adresse : lien déjà utilisé,
      // expiré, ou ouvert incomplet.
      setChecking(false);
      setLienInvalide(true);
    }

    ensureSession();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    const { data: sessionCheck } = await supabase.auth.getSession();
    if (!sessionCheck.session) {
      setLoading(false);
      setLienInvalide(true);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    setSuccess(true);
    setTimeout(() => navigate("/"), 1500);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-slate-900">Bienvenue</h1>
          <p className="mt-1 text-sm text-slate-500">Choisissez votre mot de passe</p>
        </div>

        {checking ? (
          <div className="card text-center text-sm text-slate-500">Vérification du lien...</div>
        ) : lienInvalide ? (
          <div className="card space-y-2 text-center">
            <p className="text-sm text-red-600">
              Ce lien n'est plus valide (déjà utilisé, ou expiré).
            </p>
            <p className="text-sm text-slate-500">
              Demandez à un administrateur de vous renvoyer une invitation, ou une
              réinitialisation de mot de passe, puis cliquez sur le nouveau lien reçu par e-mail
              dès son arrivée.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Nouveau mot de passe
              </label>
              <PasswordInput
                required
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8 caractères minimum"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Confirmer le mot de passe
              </label>
              <PasswordInput
                required
                className="input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && (
              <p className="text-sm text-green-600">Mot de passe enregistré, redirection...</p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Enregistrement..." : "Valider mon compte"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
