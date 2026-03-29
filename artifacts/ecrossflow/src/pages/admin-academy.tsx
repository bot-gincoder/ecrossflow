import React, { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout";
import { useAppStore } from "@/hooks/use-store";
import { RefreshCw, Save } from "lucide-react";

type AcademyContent = {
  badge: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  heroHint: string;
};

const DEFAULT_VALUE: AcademyContent = {
  badge: "Academie Ecrossflow",
  title: "Programme en cours de preparation",
  subtitle: "L'academie integree arrive bientot avec des parcours complets pour accelerer votre progression.",
  ctaLabel: "Bientot disponible",
  heroHint: "Reste connecte pour l'ouverture officielle",
};

export default function AdminAcademyPage() {
  const { token } = useAppStore();
  const base = useMemo(() => import.meta.env.BASE_URL.replace(/\/$/, ""), []);
  const [value, setValue] = useState<AcademyContent>(DEFAULT_VALUE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState("");

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setFlash("");
    try {
      const res = await fetch(`${base}/api/admin/academy-content`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || "Impossible de charger la configuration academie.");
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
      const res = await fetch(`${base}/api/admin/academy-content`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || "Sauvegarde academie échouée.");
      setFlash("Configuration academie mise à jour.");
      await load();
    } catch (error) {
      setFlash(error instanceof Error ? error.message : "Erreur de sauvegarde.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout requireAdmin>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-display font-bold">Academy Admin</h1>
            <p className="text-sm text-muted-foreground">Configuration du module academie (phase initiale).</p>
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              value={value.badge}
              onChange={(e) => setValue((prev) => ({ ...prev, badge: e.target.value }))}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="Badge"
            />
            <input
              value={value.ctaLabel}
              onChange={(e) => setValue((prev) => ({ ...prev, ctaLabel: e.target.value }))}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="CTA label"
            />
          </div>
          <input
            value={value.title}
            onChange={(e) => setValue((prev) => ({ ...prev, title: e.target.value }))}
            className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Titre"
          />
          <textarea
            value={value.subtitle}
            onChange={(e) => setValue((prev) => ({ ...prev, subtitle: e.target.value }))}
            className="mt-3 h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Sous titre"
          />
          <input
            value={value.heroHint}
            onChange={(e) => setValue((prev) => ({ ...prev, heroHint: e.target.value }))}
            className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Hint"
          />

          <button
            onClick={() => void save()}
            disabled={saving}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </section>
      </div>
    </AppLayout>
  );
}

