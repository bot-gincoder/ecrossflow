import React, { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout";
import { Sparkles, GraduationCap, Rocket, Clock3 } from "lucide-react";

type AcademyContent = {
  badge?: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  heroHint?: string;
};

export default function AcademyPage() {
  const base = useMemo(() => import.meta.env.BASE_URL.replace(/\/$/, ""), []);
  const [content, setContent] = useState<AcademyContent>({
    badge: "Academie Ecrossflow",
    title: "Programme en cours de preparation",
    subtitle: "L'academie integree arrive bientot avec des parcours complets pour accelerer votre progression.",
    ctaLabel: "Bientot disponible",
    heroHint: "Reste connecte pour l'ouverture officielle",
  });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`${base}/api/content/academy`);
        if (!res.ok) return;
        const payload = await res.json() as { value?: AcademyContent };
        if (!active) return;
        setContent((prev) => ({
          ...prev,
          ...(payload.value || {}),
        }));
      } catch {
        // fallback kept
      }
    };
    void load();
    return () => { active = false; };
  }, [base]);

  return (
    <AppLayout>
      <section className="relative overflow-hidden rounded-3xl border border-border bg-[radial-gradient(circle_at_20%_15%,rgba(36,211,168,0.22),transparent_32%),radial-gradient(circle_at_80%_8%,rgba(59,130,246,0.22),transparent_36%),linear-gradient(150deg,#05070b,#0b1320)] p-6 sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute -left-16 top-14 h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 top-8 h-56 w-56 rounded-full bg-blue-400/20 blur-3xl" />

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {content.badge}
          </div>

          <h1 className="mt-4 font-display text-3xl font-black leading-tight sm:text-5xl">
            {content.title}
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-white/80 sm:text-base">
            {content.subtitle}
          </p>

          <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-200">
            <Clock3 className="h-4 w-4" />
            {content.ctaLabel}
          </div>
          <p className="mt-3 text-xs text-white/60">{content.heroHint}</p>
        </div>

        <div className="relative z-10 mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <GraduationCap className="mb-2 h-5 w-5 text-primary" />
            <p className="text-sm font-semibold">Parcours guidés</p>
            <p className="mt-1 text-xs text-white/65">Modules progressifs et structurés pour tous niveaux.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <Rocket className="mb-2 h-5 w-5 text-cyan-300" />
            <p className="text-sm font-semibold">Execution rapide</p>
            <p className="mt-1 text-xs text-white/65">Appliquer les stratégies directement depuis ton dashboard.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <Sparkles className="mb-2 h-5 w-5 text-amber-300" />
            <p className="text-sm font-semibold">Niveau professionnel</p>
            <p className="mt-1 text-xs text-white/65">Contenu orienté pratique, performance et sécurité.</p>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}

