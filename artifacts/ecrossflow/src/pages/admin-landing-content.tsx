import React, { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout";
import { useAppStore } from "@/hooks/use-store";
import { RefreshCw, Save } from "lucide-react";

type LandingContent = Record<string, string>;

const FAQ_PAIRS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

const DEFAULT_VALUE: LandingContent = {
  secFaqTitle: "Questions fréquentes",
  q1: "Combien puis-je gagner avec Ecrossflow ?",
  a1: "Tes gains dépendent de ton activité et de ta progression. Plus tu avances dans les niveaux (de F à S), plus les gains deviennent importants et exponentiels.",
  q2: "Est-ce que je dois inviter des personnes pour gagner ?",
  a2: "Oui. Tu commences à gagner dès ton premier filleul actif. Pour accéder au board suivant après l'étape ranker, un minimum de 2 filleuls actifs est requis.",
  q3: "Le système fonctionne-t-il même si je ne fais rien ?",
  a3: "Oui. Une fois actif, tu peux continuer à progresser grâce au flux du réseau. Mais plus tu es actif, plus tu gagnes rapidement.",
  q4: "Comment fonctionne la progression ?",
  a4: "Tu passes à travers 7 niveaux (F à S). Chaque niveau contient : Starter → Challenger → Leader → Ranker. Chaque étape franchie débloque des gains.",
  q5: "Pourquoi seulement $2 pour commencer ?",
  a5: "C’est pour rendre l’accès simple et ouvert à tous. Avec ce montant, tu accèdes au système, aux opportunités et aux formations.",
  q6: "Est-ce que je reçois quelque chose en plus des gains ?",
  a6: "Oui. Tu peux accéder à des formations utiles pour apprendre et évoluer en même temps.",
  q7: "Est-ce que mon compte et mes gains sont sécurisés ?",
  a7: "Oui. La plateforme est conçue avec un système sécurisé et un suivi clair de ton évolution.",
  q8: "Est-ce que tout le monde peut rejoindre ?",
  a8: "Oui. Ecrossflow est ouvert à toute personne prête à commencer et à évoluer.",
  finalTitle: "Tu attends quoi ?",
  finalDesc: "Le meilleur moment pour commencer c’est maintenant.",
  finalLine1: "Rejoins Ecrossflow",
  finalLine2: "Connecte-toi",
  finalLine3: "Commence à construire ton flow",
  finalCta: "Créer mon compte",
};

export default function AdminLandingContentPage() {
  const { token } = useAppStore();
  const base = useMemo(() => import.meta.env.BASE_URL.replace(/\/$/, ""), []);
  const [value, setValue] = useState<LandingContent>(DEFAULT_VALUE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState("");

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setFlash("");
    try {
      const res = await fetch(`${base}/api/admin/landing-content`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || "Chargement du contenu landing échoué.");
      setValue({
        ...DEFAULT_VALUE,
        ...(payload?.value || {}),
      });
    } catch (error) {
      setFlash(error instanceof Error ? error.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  const save = async () => {
    if (!token) return;
    setSaving(true);
    setFlash("");
    try {
      const res = await fetch(`${base}/api/admin/landing-content`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || "Sauvegarde landing échouée.");
      setFlash("Contenu landing mis à jour.");
      await load();
    } catch (error) {
      setFlash(error instanceof Error ? error.message : "Erreur de sauvegarde.");
    } finally {
      setSaving(false);
    }
  };

  const setField = (key: string, next: string) => {
    setValue((prev) => ({ ...prev, [key]: next }));
  };

  return (
    <AppLayout requireAdmin>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-display font-bold">Landing Content</h1>
            <p className="text-sm text-muted-foreground">FAQ et CTA final personnalisables depuis l'admin.</p>
          </div>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm hover:border-primary/40"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualiser
          </button>
        </div>

        {flash && (
          <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
            {flash}
          </div>
        )}

        <section className="rounded-2xl border border-border bg-card/40 p-4">
          <h2 className="text-base font-semibold">Bloc FAQ</h2>
          <input
            value={value.secFaqTitle || ""}
            onChange={(e) => setField("secFaqTitle", e.target.value)}
            className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Titre FAQ"
          />

          <div className="mt-4 space-y-3">
            {FAQ_PAIRS.map((n) => (
              <div key={n} className="rounded-xl border border-border bg-background/50 p-3">
                <input
                  value={value[`q${n}`] || ""}
                  onChange={(e) => setField(`q${n}`, e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder={`Question ${n}`}
                />
                <textarea
                  value={value[`a${n}`] || ""}
                  onChange={(e) => setField(`a${n}`, e.target.value)}
                  className="mt-2 h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder={`Réponse ${n}`}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card/40 p-4">
          <h2 className="text-base font-semibold">Bloc CTA final</h2>
          <input
            value={value.finalTitle || ""}
            onChange={(e) => setField("finalTitle", e.target.value)}
            className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Titre"
          />
          <textarea
            value={value.finalDesc || ""}
            onChange={(e) => setField("finalDesc", e.target.value)}
            className="mt-2 h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Description"
          />
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
            <input
              value={value.finalLine1 || ""}
              onChange={(e) => setField("finalLine1", e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="Ligne 1"
            />
            <input
              value={value.finalLine2 || ""}
              onChange={(e) => setField("finalLine2", e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="Ligne 2"
            />
            <input
              value={value.finalLine3 || ""}
              onChange={(e) => setField("finalLine3", e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="Ligne 3"
            />
          </div>
          <input
            value={value.finalCta || ""}
            onChange={(e) => setField("finalCta", e.target.value)}
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Texte bouton CTA"
          />
        </section>

        <button
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saving ? "Sauvegarde..." : "Sauvegarder les changements"}
        </button>
      </div>
    </AppLayout>
  );
}
