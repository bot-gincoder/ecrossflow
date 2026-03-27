import { useLocation } from "wouter";

export default function GoogleCheckEmailPage() {
  const [, navigate] = useLocation();
  const email = new URLSearchParams(window.location.search).get("email") || "";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card/70 p-8 text-center">
        <h1 className="text-2xl font-display font-bold mb-3">Confirmation requise</h1>
        <p className="text-muted-foreground mb-2">
          Votre compte Google a bien été créé, mais il doit être confirmé avant activation.
        </p>
        <p className="text-sm text-foreground mb-6">
          Allez dans votre boîte mail <span className="font-semibold">{email || "du compte Google"}</span>, cliquez sur le lien de confirmation, puis reconnectez-vous.
        </p>
        <button
          type="button"
          onClick={() => navigate("/auth/login")}
          className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
        >
          Retour à la connexion
        </button>
      </div>
    </div>
  );
}

