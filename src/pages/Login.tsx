import { FormEvent, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import PasswordInput from "../components/PasswordInput";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(
        error.message.includes("Invalid login")
          ? "E-mail ou mot de passe incorrect."
          : error.message
      );
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Saisissez votre e-mail ci-dessus, puis cliquez sur « mot de passe oublié ».");
      return;
    }
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/definir-mot-de-passe`,
    });
    if (error) setError(error.message);
    else setResetSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-slate-900">Pôle Pédagogique</h1>
          <p className="mt-1 text-sm text-slate-500">Suivi des apprenants</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Adresse e-mail
            </label>
            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom.nom@arcs-france.fr"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Mot de passe
            </label>
            <PasswordInput
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {resetSent && (
            <p className="text-sm text-green-600">
              Un e-mail de réinitialisation vous a été envoyé.
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Connexion..." : "Se connecter"}
          </button>

          <button
            type="button"
            onClick={handleForgotPassword}
            className="w-full text-center text-sm text-brand-600 hover:underline"
          >
            Mot de passe oublié ?
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          Les comptes sont créés uniquement par un administrateur. Vous avez reçu un e-mail
          d'invitation ? Ouvrez-le pour définir votre mot de passe.
        </p>
      </div>
    </div>
  );
}
