import { Router, type IRouter } from "express";
import { getSystemSetting } from "../services/system-config.js";

const router: IRouter = Router();

const LANDING_CONTENT_KEY = "landing_content_overrides";
const ACADEMY_CONTENT_KEY = "academy_content";

const LANDING_CONTENT_DEFAULT: Record<string, string> = {
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

const ACADEMY_CONTENT_DEFAULT: Record<string, string> = {
  badge: "Academie Ecrossflow",
  title: "Programme en cours de preparation",
  subtitle: "L'academie integree arrive bientot avec des parcours complets pour accelerer votre progression.",
  ctaLabel: "Bientot disponible",
  heroHint: "Reste connecte pour l'ouverture officielle",
};

router.get("/content/landing", async (_req, res) => {
  const value = await getSystemSetting<Record<string, unknown>>(LANDING_CONTENT_KEY, LANDING_CONTENT_DEFAULT);
  res.json({
    key: LANDING_CONTENT_KEY,
    value: value && typeof value === "object" ? value : LANDING_CONTENT_DEFAULT,
  });
});

router.get("/content/academy", async (_req, res) => {
  const value = await getSystemSetting<Record<string, unknown>>(ACADEMY_CONTENT_KEY, ACADEMY_CONTENT_DEFAULT);
  res.json({
    key: ACADEMY_CONTENT_KEY,
    value: value && typeof value === "object" ? value : ACADEMY_CONTENT_DEFAULT,
  });
});

export default router;
