import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BadgeDollarSign,
  Check,
  ChevronDown,
  CircleDollarSign,
  Globe2,
  HandCoins,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { useAppStore } from '@/hooks/use-store';
import {
  EXTENDED_LANGUAGE_OPTIONS,
  PRIMARY_LANGUAGE_OPTIONS,
  getLanguageOption,
  type LanguageOption,
} from '@/lib/languages';
import { buildLocalizedPath, persistLocale } from '@/lib/i18n';
import { NeonGlobe } from '@/components/landing/neon-globe';

type LandingCopy = {
  langLabel: string;
  otherLangLabel: string;
  langSearch: string;
  login: string;
  ctaTop: string;
  badge: string;
  heroTitle1: string;
  heroTitle2: string;
  heroDesc: string;
  heroPrimary: string;
  heroSecondary: string;
  heroStart3: string;
  painTitle: string;
  pain1: string;
  pain2: string;
  pain3: string;
  painResultLabel: string;
  painResult: string;
  sec3Title: string;
  sec3Step1: string;
  sec3Step2: string;
  sec3Step3: string;
  sec3Step4: string;
  sec3NoExpert: string;
  sec3NoBigStart: string;
  sec3Decision: string;
  sec3Action: string;
  sec4Title: string;
  sec4Intro: string;
  sec4Access1: string;
  sec4Access2: string;
  sec4Access3: string;
  sec4Access4: string;
  sec4NotPromise: string;
  sec4RealMechanic: string;
  sec4JourneyTitle: string;
  sec4Journey1: string;
  sec4Journey2: string;
  sec4Journey3: string;
  sec4HowTitle: string;
  sec4Step1Title: string;
  sec4Step1Desc: string;
  sec4Step2Title: string;
  sec4Step2Desc1: string;
  sec4Step2Desc2: string;
  sec4Step3Title: string;
  sec4Step3Desc1: string;
  sec4Step3Desc2: string;
  sec4Step4Title: string;
  sec4Step4Desc: string;
  sec4Step5Title: string;
  sec4Step5Desc: string;
  sec4End1: string;
  sec4End2: string;
  sec4End3: string;
  sec4Final: string;
  statInvestors: string;
  statYield: string;
  statReferrals: string;
  statInvestorsLabel: string;
  statYieldLabel: string;
  statReferralsLabel: string;
  secValueTitle: string;
  secValueDesc: string;
  v1Title: string;
  v1Desc: string;
  v2Title: string;
  v2Desc: string;
  v3Title: string;
  v3Desc: string;
  secHowTitle: string;
  secHowDesc: string;
  h1Title: string;
  h1Desc: string;
  h2Title: string;
  h2Desc: string;
  h3Title: string;
  h3Desc: string;
  secBonusTitle: string;
  secBonusDesc: string;
  b1: string;
  b2: string;
  b3: string;
  secFaqTitle: string;
  q1: string;
  a1: string;
  q2: string;
  a2: string;
  q3: string;
  a3: string;
  q4: string;
  a4: string;
  q5: string;
  a5: string;
  q6: string;
  a6: string;
  q7: string;
  a7: string;
  q8: string;
  a8: string;
  finalTitle: string;
  finalDesc: string;
  finalLine1: string;
  finalLine2: string;
  finalLine3: string;
  finalCta: string;
  footerTitle: string;
  footerDesc: string;
  footerTrust1: string;
  footerTrust2: string;
  footerTrust3: string;
  footerTrust4: string;
  navFeatures: string;
  navHow: string;
  navBonus: string;
  navFaq: string;
};

const COPY: Record<string, LandingCopy> = {
  fr: {
    langLabel: 'Langue',
    otherLangLabel: 'Autres langues',
    langSearch: 'Rechercher une langue',
    login: 'Connexion',
    ctaTop: 'Commencer',
    badge: '🌍 ECROSSFLOW',
    heroTitle1: 'Le réseau qui transforme',
    heroTitle2: 'la connexion en opportunité.',
    heroDesc:
      'Rejoins une communauté mondiale où chaque connexion crée de la valeur. Un système simple, accessible et conçu pour évoluer avec toi. Commence aujourd’hui avec seulement $2.',
    heroPrimary: 'Commencez maintenant',
    heroSecondary: 'Découvrir la vision',
    heroStart3: 'Commence aujourd’hui avec seulement $2',
    painTitle: 'Tu veux avancer… mais quelque chose bloque.',
    pain1: 'Tu veux gagner de l’argent en ligne, mais tout semble compliqué',
    pain2: 'Les systèmes existants sont instables, confus ou encore trop couteux',
    pain3: 'Tu avances seul, sans structure ni support',
    painResultLabel: 'Conséquence',
    painResult: '👉 Résultat : tu perds du temps… et des opportunités',
    sec3Title: 'Un système simple. Une progression claire.',
    sec3Step1: 'Tu rejoins avec $2',
    sec3Step2: 'Tu invites (ou tu progresses dans le réseau)',
    sec3Step3: 'Le système se remplit automatiquement',
    sec3Step4: 'Tu gagnes à chaque étape',
    sec3NoExpert: 'Pas besoin d’être expert',
    sec3NoBigStart: 'Pas besoin de commencer avec beaucoup',
    sec3Decision: 'Juste : ➡️ une décision',
    sec3Action: '➡️ une action',
    sec4Title: 'Une petite entrée. Un grand potentiel.',
    sec4Intro: 'Avec seulement $2, tu accèdes à :',
    sec4Access1: '✔ Un système actif',
    sec4Access2: '✔ Une opportunité de gain',
    sec4Access3: '✔ Un réseau en expansion',
    sec4Access4: '✔ Des formations utiles pour évoluer',
    sec4NotPromise: 'Ce n’est pas une promesse vide',
    sec4RealMechanic: 'C’est une mécanique réelle',
    sec4JourneyTitle: 'Ton parcours dans Ecrossflow',
    sec4Journey1: 'Tu progresses à travers 7 niveaux (de F à S)',
    sec4Journey2: 'Chaque niveau contient 4 étapes : Starter → Challenger → Leader → Ranker',
    sec4Journey3: 'À chaque niveau franchi : tes gains augmentent de manière exponentielle',
    sec4HowTitle: '⚡ Comment commencer à gagner ?',
    sec4Step1Title: '1. Active ton compte ($2)',
    sec4Step1Desc: 'Tu entres directement dans le système',
    sec4Step2Title: '2. Invite au moins 2 personnes',
    sec4Step2Desc1: 'Tu débloques ta progression plus rapidement',
    sec4Step2Desc2: 'Tu gagnes déjà des récompenses',
    sec4Step3Title: '3. Choisis ta stratégie',
    sec4Step3Desc1: '• Continuer à inviter → gains plus rapides',
    sec4Step3Desc2: '• ⚙️ Ou rester passif → le réseau travaille pour toi',
    sec4Step4Title: '4. Progresse automatiquement',
    sec4Step4Desc: 'Le système te fait avancer niveau par niveau',
    sec4Step5Title: '5. Gagne à chaque étape',
    sec4Step5Desc: 'Chaque progression débloque de nouveaux gains',
    sec4End1: 'Simple à comprendre',
    sec4End2: 'Accessible à tous',
    sec4End3: 'Conçu pour évoluer avec toi',
    sec4Final: 'Tu commences petit mais tu peux aller très loin.',
    statInvestors: '10K+',
    statYield: '$500K+',
    statReferrals: '95%',
    statInvestorsLabel: 'Investisseurs actifs',
    statYieldLabel: 'Volume traité',
    statReferralsLabel: 'Satisfaction membres',
    secValueTitle: 'Une expérience premium, pensée mobile-first.',
    secValueDesc:
      'Interface fluide, performance élevée et parcours optimisé pour tous les écrans, du petit smartphone au grand desktop.',
    v1Title: 'Croissance maîtrisée',
    v1Desc:
      'Des parcours d’investissement lisibles et des indicateurs clairs pour suivre vos performances en temps réel.',
    v2Title: 'Sécurité renforcée',
    v2Desc:
      'Protection des comptes, validation des opérations et traçabilité complète des mouvements financiers.',
    v3Title: 'Bonus de référencement',
    v3Desc:
      'Invitez votre réseau, débloquez des avantages exclusifs et augmentez votre potentiel de gains.',
    secHowTitle: 'Comment démarrer rapidement',
    secHowDesc: 'Trois étapes simples pour lancer votre activité.',
    h1Title: '1. Ouvrez votre compte',
    h1Desc:
      'Inscription rapide, vérification immédiate et configuration guidée de votre profil investisseur.',
    h2Title: '2. Activez votre portefeuille',
    h2Desc:
      'Déposez vos fonds, configurez votre stratégie et visualisez vos opportunités depuis le tableau de bord.',
    h3Title: '3. Accélérez avec votre réseau',
    h3Desc:
      'Partagez votre lien personnel, suivez vos referrals et recevez vos bonus automatiquement.',
    secBonusTitle: 'Programme avantages & referrals',
    secBonusDesc:
      'Un écosystème conçu pour récompenser la régularité, la contribution et la croissance collective.',
    b1: 'Commissions de parrainage transparentes',
    b2: 'Historique complet de vos bonus',
    b3: 'Notifications en temps réel des gains',
    secFaqTitle: 'Questions fréquentes',
    q1: 'Combien puis-je gagner avec Ecrossflow ?',
    a1: 'Tes gains dépendent de ton activité et de ta progression. Plus tu avances dans les niveaux (de F à S), plus les gains deviennent importants et exponentiels.',
    q2: 'Est-ce que je dois inviter des personnes pour gagner ?',
    a2: "Oui. Tu commences à gagner dès ton premier filleul actif. Pour accéder au board suivant après l'étape ranker, un minimum de 2 filleuls actifs est requis.",
    q3: '⚙️ Le système fonctionne-t-il même si je ne fais rien ?',
    a3: 'Oui. Une fois actif, tu peux continuer à progresser grâce au flux du réseau. Mais plus tu es actif, plus tu gagnes rapidement.',
    q4: 'Comment fonctionne la progression ?',
    a4: 'Tu passes à travers 7 niveaux (F à S). Chaque niveau contient : Starter → Challenger → Leader → Ranker. Chaque étape franchie débloque des gains.',
    q5: 'Pourquoi seulement $2 pour commencer ?',
    a5: 'C’est pour rendre l’accès simple et ouvert à tous. Avec ce montant, tu accèdes au système, aux opportunités et aux formations.',
    q6: 'Est-ce que je reçois quelque chose en plus des gains ?',
    a6: 'Oui. Tu peux accéder à des formations utiles pour apprendre et évoluer en même temps.',
    q7: 'Est-ce que mon compte et mes gains sont sécurisés ?',
    a7: 'Oui. La plateforme est conçue avec un système sécurisé et un suivi clair de ton évolution.',
    q8: 'Est-ce que tout le monde peut rejoindre ?',
    a8: 'Oui. Ecrossflow est ouvert à toute personne prête à commencer et à évoluer.',
    finalTitle: 'Tu attends quoi ?',
    finalDesc: 'Le meilleur moment pour commencer c’est maintenant.',
    finalLine1: 'Rejoins Ecrossflow',
    finalLine2: 'Connecte-toi',
    finalLine3: 'Commence à construire ton flow',
    finalCta: 'Créer mon compte',
    footerTitle: 'Confiance, clarté, responsabilité.',
    footerDesc:
      'Ecrossflow s’engage sur une expérience transparente, un cadre sécurisé et un accompagnement clair pour chaque utilisateur.',
    footerTrust1: 'Transparence des règles et du parcours',
    footerTrust2: 'Sécurité des comptes et des données',
    footerTrust3: 'Conformité selon la réglementation locale',
    footerTrust4: 'Support utilisateur réactif',
    navFeatures: 'Avantages',
    navHow: 'Démarrage',
    navBonus: 'Referrals',
    navFaq: 'FAQ',
  },
  en: {
    langLabel: 'Language',
    otherLangLabel: 'Other languages',
    langSearch: 'Search language',
    login: 'Sign in',
    ctaTop: 'Get started',
    badge: '🌍 ECROSSFLOW',
    heroTitle1: 'The network that turns',
    heroTitle2: 'connection into opportunity.',
    heroDesc:
      'Join a global community where every connection creates value. A simple, accessible system built to scale with you. Start today with only $2.',
    heroPrimary: 'Get started now',
    heroSecondary: 'Discover the vision',
    heroStart3: 'Start today with only $2',
    painTitle: 'You want to move forward… but something is blocking you.',
    pain1: 'You want to make money online, but everything feels complicated',
    pain2: 'Existing systems are unstable, confusing, or simply too expensive',
    pain3: 'You are moving alone, without structure or support',
    painResultLabel: 'Consequence',
    painResult: '👉 Result: you lose time… and opportunities',
    sec3Title: 'A simple system. Clear progression.',
    sec3Step1: 'You join with $2',
    sec3Step2: 'You invite (or progress inside the network)',
    sec3Step3: 'The system fills automatically',
    sec3Step4: 'You earn at every step',
    sec3NoExpert: 'No need to be an expert',
    sec3NoBigStart: 'No need to start with a lot',
    sec3Decision: 'Just: ➡️ one decision',
    sec3Action: '➡️ one action',
    sec4Title: 'A small entry. A big potential.',
    sec4Intro: 'With only $2, you get access to:',
    sec4Access1: '✔ An active system',
    sec4Access2: '✔ An earning opportunity',
    sec4Access3: '✔ A growing network',
    sec4Access4: '✔ Useful training to evolve',
    sec4NotPromise: 'This is not an empty promise',
    sec4RealMechanic: 'This is a real mechanism',
    sec4JourneyTitle: 'Your Ecrossflow journey',
    sec4Journey1: 'You progress through 7 levels (from F to S)',
    sec4Journey2: 'Each level has 4 stages: Starter → Challenger → Leader → Ranker',
    sec4Journey3: 'At every level completed: your gains grow exponentially',
    sec4HowTitle: '⚡ How to start earning?',
    sec4Step1Title: '1. Activate your account ($2)',
    sec4Step1Desc: 'You enter the system directly',
    sec4Step2Title: '2. Invite at least 2 people',
    sec4Step2Desc1: 'You unlock progression faster',
    sec4Step2Desc2: 'You already receive rewards',
    sec4Step3Title: '3. Choose your strategy',
    sec4Step3Desc1: '• Keep inviting → faster gains',
    sec4Step3Desc2: '• ⚙️ Or stay passive → the network works for you',
    sec4Step4Title: '4. Progress automatically',
    sec4Step4Desc: 'The system moves you forward level by level',
    sec4Step5Title: '5. Earn at every step',
    sec4Step5Desc: 'Each progression unlocks new gains',
    sec4End1: 'Easy to understand',
    sec4End2: 'Accessible to everyone',
    sec4End3: 'Built to scale with you',
    sec4Final: 'You start small, but you can go very far.',
    statInvestors: '10K+',
    statYield: '$500K+',
    statReferrals: '95%',
    statInvestorsLabel: 'Active investors',
    statYieldLabel: 'Processed volume',
    statReferralsLabel: 'Member satisfaction',
    secValueTitle: 'A premium experience, built mobile-first.',
    secValueDesc:
      'Fluid interface, high performance, and strategic spacing optimized for every screen size.',
    v1Title: 'Controlled growth',
    v1Desc:
      'Clear investment flows and live indicators to monitor your performance at any time.',
    v2Title: 'Advanced security',
    v2Desc:
      'Account protection, operation validation, and full traceability across all financial actions.',
    v3Title: 'Referral bonuses',
    v3Desc:
      'Invite your network, unlock exclusive advantages, and increase your earning potential.',
    secHowTitle: 'How to start fast',
    secHowDesc: 'Three clear steps to launch your activity.',
    h1Title: '1. Open your account',
    h1Desc: 'Fast signup, immediate verification, and guided investor profile setup.',
    h2Title: '2. Activate your wallet',
    h2Desc: 'Fund your account, configure your strategy, and track opportunities from your dashboard.',
    h3Title: '3. Grow through your network',
    h3Desc: 'Share your referral link, track your referrals, and receive bonuses automatically.',
    secBonusTitle: 'Benefits & referral program',
    secBonusDesc:
      'An ecosystem designed to reward consistency, contribution, and collective growth.',
    b1: 'Transparent referral commissions',
    b2: 'Complete bonus history',
    b3: 'Real-time gain notifications',
    secFaqTitle: 'Frequently asked questions',
    q1: 'How much can I earn with Ecrossflow?',
    a1: 'Your gains depend on your activity and progression. The further you move through levels (F to S), the bigger and more exponential your gains become.',
    q2: 'Do I need to invite people to earn?',
    a2: 'Yes. You start earning from your first active referral. To access the next board after the ranker stage, at least 2 active referrals are required.',
    q3: '⚙️ Does the system work if I do nothing?',
    a3: 'Yes. Once active, you can continue progressing thanks to network flow. But the more active you are, the faster you earn.',
    q4: 'How does progression work?',
    a4: 'You move through 7 levels (F to S). Each level has: Starter → Challenger → Leader → Ranker. Every completed step unlocks gains.',
    q5: 'Why only $2 to start?',
    a5: 'To keep access simple and open to everyone. With this amount, you enter the system plus opportunities and training.',
    q6: 'Do I receive anything besides gains?',
    a6: 'Yes. You get access to useful training to learn and evolve while progressing.',
    q7: 'Are my account and gains secure?',
    a7: 'Yes. The platform is built with a secure system and clear tracking of your progress.',
    q8: 'Can everyone join?',
    a8: 'Yes. Ecrossflow is open to anyone ready to start and evolve.',
    finalTitle: 'What are you waiting for?',
    finalDesc: 'The best time to start is now.',
    finalLine1: 'Join Ecrossflow',
    finalLine2: 'Log in',
    finalLine3: 'Start building your flow',
    finalCta: 'Create my account',
    footerTitle: 'Trust, clarity, accountability.',
    footerDesc:
      'Ecrossflow is committed to transparent operations, secure user experience, and clear guidance at every step.',
    footerTrust1: 'Transparent rules and user journey',
    footerTrust2: 'Account and data security',
    footerTrust3: 'Local compliance awareness',
    footerTrust4: 'Responsive user support',
    navFeatures: 'Benefits',
    navHow: 'Getting started',
    navBonus: 'Referrals',
    navFaq: 'FAQ',
  },
  es: {
    langLabel: 'Idioma',
    otherLangLabel: 'Otros idiomas',
    langSearch: 'Buscar idioma',
    login: 'Iniciar sesión',
    ctaTop: 'Empezar',
    badge: '🌍 ECROSSFLOW',
    heroTitle1: 'La red que transforma',
    heroTitle2: 'la conexión en oportunidad.',
    heroDesc:
      'Únete a una comunidad global donde cada conexión crea valor. Un sistema simple, accesible y diseñado para crecer contigo. Comienza hoy con solo $2.',
    heroPrimary: 'Empezar ahora',
    heroSecondary: 'Descubrir la visión',
    heroStart3: 'Comienza hoy con solo $2',
    painTitle: 'Quieres avanzar… pero algo te bloquea.',
    pain1: 'Quieres ganar dinero online, pero todo parece complicado',
    pain2: 'Los sistemas existentes son inestables, confusos o demasiado costosos',
    pain3: 'Avanzas solo, sin estructura ni soporte',
    painResultLabel: 'Consecuencia',
    painResult: '👉 Resultado: pierdes tiempo… y oportunidades',
    sec3Title: 'Un sistema simple. Una progresión clara.',
    sec3Step1: 'Te unes con $2',
    sec3Step2: 'Invitas (o progresas dentro de la red)',
    sec3Step3: 'El sistema se llena automáticamente',
    sec3Step4: 'Ganas en cada etapa',
    sec3NoExpert: 'No necesitas ser experto',
    sec3NoBigStart: 'No necesitas empezar con mucho',
    sec3Decision: 'Solo: ➡️ una decisión',
    sec3Action: '➡️ una acción',
    sec4Title: 'Una pequeña entrada. Un gran potencial.',
    sec4Intro: 'Con solo $2, accedes a:',
    sec4Access1: '✔ Un sistema activo',
    sec4Access2: '✔ Una oportunidad de ganancia',
    sec4Access3: '✔ Una red en expansión',
    sec4Access4: '✔ Formaciones útiles para evolucionar',
    sec4NotPromise: 'No es una promesa vacía',
    sec4RealMechanic: 'Es una mecánica real',
    sec4JourneyTitle: 'Tu recorrido en Ecrossflow',
    sec4Journey1: 'Progresas a través de 7 niveles (de F a S)',
    sec4Journey2: 'Cada nivel tiene 4 etapas: Starter → Challenger → Leader → Ranker',
    sec4Journey3: 'En cada nivel superado: tus ganancias aumentan exponencialmente',
    sec4HowTitle: '⚡ ¿Cómo empezar a ganar?',
    sec4Step1Title: '1. Activa tu cuenta ($2)',
    sec4Step1Desc: 'Entras directamente en el sistema',
    sec4Step2Title: '2. Invita al menos a 2 personas',
    sec4Step2Desc1: 'Desbloqueas tu progreso más rápido',
    sec4Step2Desc2: 'Ya recibes recompensas',
    sec4Step3Title: '3. Elige tu estrategia',
    sec4Step3Desc1: '• Seguir invitando → ganancias más rápidas',
    sec4Step3Desc2: '• ⚙️ O quedarte pasivo → la red trabaja por ti',
    sec4Step4Title: '4. Progresa automáticamente',
    sec4Step4Desc: 'El sistema te hace avanzar nivel por nivel',
    sec4Step5Title: '5. Gana en cada etapa',
    sec4Step5Desc: 'Cada progreso desbloquea nuevas ganancias',
    sec4End1: 'Simple de entender',
    sec4End2: 'Accesible para todos',
    sec4End3: 'Diseñado para crecer contigo',
    sec4Final: 'Empiezas pequeño, pero puedes llegar muy lejos.',
    statInvestors: '10K+',
    statYield: '$500K+',
    statReferrals: '95%',
    statInvestorsLabel: 'Inversores activos',
    statYieldLabel: 'Volumen procesado',
    statReferralsLabel: 'Satisfacción de miembros',
    secValueTitle: 'Experiencia premium, diseñada mobile-first.',
    secValueDesc:
      'Interfaz fluida, alto rendimiento y distribución estratégica del espacio para cualquier pantalla.',
    v1Title: 'Crecimiento controlado',
    v1Desc:
      'Flujos de inversión claros e indicadores en vivo para seguir tu rendimiento en tiempo real.',
    v2Title: 'Seguridad avanzada',
    v2Desc:
      'Protección de cuenta, validación de operaciones y trazabilidad completa de movimientos financieros.',
    v3Title: 'Bonos por referidos',
    v3Desc:
      'Invita tu red, desbloquea ventajas exclusivas y aumenta tu potencial de ingresos.',
    secHowTitle: 'Cómo empezar rápido',
    secHowDesc: 'Tres pasos simples para lanzar tu actividad.',
    h1Title: '1. Crea tu cuenta',
    h1Desc: 'Registro rápido, verificación inmediata y configuración guiada de tu perfil.',
    h2Title: '2. Activa tu billetera',
    h2Desc: 'Deposita fondos, define tu estrategia y visualiza oportunidades en tu panel.',
    h3Title: '3. Impulsa tu red',
    h3Desc: 'Comparte tu enlace personal, sigue tus referidos y recibe bonos automáticos.',
    secBonusTitle: 'Programa de beneficios y referidos',
    secBonusDesc:
      'Un ecosistema creado para recompensar consistencia, contribución y crecimiento colectivo.',
    b1: 'Comisiones de referido transparentes',
    b2: 'Historial completo de bonos',
    b3: 'Notificaciones en tiempo real de ganancias',
    secFaqTitle: 'Preguntas frecuentes',
    q1: '¿Cuánto puedo ganar con Ecrossflow?',
    a1: 'Tus ganancias dependen de tu actividad y progreso. Cuanto más avanzas en los niveles (de F a S), más importantes y exponenciales son las ganancias.',
    q2: '¿Debo invitar personas para ganar?',
    a2: 'Sí. Empiezas a ganar desde tu primer referido activo. Para acceder al siguiente board después de la etapa ranker, se requieren al menos 2 referidos activos.',
    q3: '⚙️ ¿El sistema funciona aunque no haga nada?',
    a3: 'Sí. Una vez activo, puedes seguir progresando gracias al flujo de la red. Pero cuanto más activo seas, más rápido ganas.',
    q4: '¿Cómo funciona la progresión?',
    a4: 'Avanzas por 7 niveles (de F a S). Cada nivel contiene: Starter → Challenger → Leader → Ranker. Cada etapa completada desbloquea ganancias.',
    q5: '¿Por qué solo $2 para empezar?',
    a5: 'Para que el acceso sea simple y abierto para todos. Con ese monto accedes al sistema, oportunidades y formaciones.',
    q6: '¿Recibo algo además de las ganancias?',
    a6: 'Sí. Puedes acceder a formaciones útiles para aprender y evolucionar al mismo tiempo.',
    q7: '¿Mi cuenta y mis ganancias están seguras?',
    a7: 'Sí. La plataforma está diseñada con un sistema seguro y seguimiento claro de tu evolución.',
    q8: '¿Todo el mundo puede unirse?',
    a8: 'Sí. Ecrossflow está abierto a toda persona dispuesta a empezar y evolucionar.',
    finalTitle: '¿Qué estás esperando?',
    finalDesc: 'El mejor momento para empezar es ahora.',
    finalLine1: 'Únete a Ecrossflow',
    finalLine2: 'Conéctate',
    finalLine3: 'Empieza a construir tu flow',
    finalCta: 'Crear mi cuenta',
    footerTitle: 'Confianza, claridad y responsabilidad.',
    footerDesc:
      'Ecrossflow mantiene una experiencia transparente, segura y acompañada para cada usuario.',
    footerTrust1: 'Reglas y recorrido transparentes',
    footerTrust2: 'Seguridad de cuentas y datos',
    footerTrust3: 'Cumplimiento según regulación local',
    footerTrust4: 'Soporte al usuario ágil',
    navFeatures: 'Beneficios',
    navHow: 'Inicio',
    navBonus: 'Referidos',
    navFaq: 'FAQ',
  },
  ht: {
    langLabel: 'Lang',
    otherLangLabel: 'Lòt lang',
    langSearch: 'Chèche lang',
    login: 'Konekte',
    ctaTop: 'Kòmanse',
    badge: '🌍 ECROSSFLOW',
    heroTitle1: 'Rezo ki transfòme',
    heroTitle2: 'koneksyon an opòtinite.',
    heroDesc:
      'Antre nan yon kominote mondyal kote chak koneksyon kreye valè. Yon sistèm senp, aksesib, ki fèt pou grandi avè w. Kòmanse jodi a ak sèlman $2.',
    heroPrimary: 'Kòmanse kounye a',
    heroSecondary: 'Dekouvri vizyon an',
    heroStart3: 'Kòmanse jodi a ak sèlman $2',
    painTitle: 'Ou vle avanse… men gen yon bagay ki bloke w.',
    pain1: 'Ou vle fè lajan sou entènèt, men tout bagay parèt twò konplike',
    pain2: 'Sistèm ki egziste yo enstab, konfizyon, oswa twò chè',
    pain3: 'Ou ap avanse pou kont ou, san estrikti ni sipò',
    painResultLabel: 'Rezilta',
    painResult: '👉 Rezilta : ou pèdi tan… ak opòtinite',
    sec3Title: 'Yon sistèm senp. Yon pwogresyon klè.',
    sec3Step1: 'Ou rantre ak $2',
    sec3Step2: 'Ou envite (oswa ou pwogrese nan rezo a)',
    sec3Step3: 'Sistèm nan ranpli otomatikman',
    sec3Step4: 'Ou touche nan chak etap',
    sec3NoExpert: 'Pa bezwen ekspè',
    sec3NoBigStart: 'Pa bezwen kòmanse ak anpil lajan',
    sec3Decision: 'Sèlman : ➡️ yon desizyon',
    sec3Action: '➡️ yon aksyon',
    sec4Title: 'Yon ti antre. Yon gwo potansyèl.',
    sec4Intro: 'Avèk sèlman $2, ou jwenn aksè ak :',
    sec4Access1: '✔ Yon sistèm aktif',
    sec4Access2: '✔ Yon opòtinite pou touche',
    sec4Access3: '✔ Yon rezo k ap grandi',
    sec4Access4: '✔ Fòmasyon itil pou evolye',
    sec4NotPromise: 'Sa pa yon pwomès vid',
    sec4RealMechanic: 'Se yon mekanik reyèl',
    sec4JourneyTitle: 'Chemen ou nan Ecrossflow',
    sec4Journey1: 'Ou pwogrese atravè 7 nivo (soti F rive S)',
    sec4Journey2: 'Chak nivo gen 4 etap : Starter → Challenger → Leader → Ranker',
    sec4Journey3: 'Chak nivo ou franchi : benefis ou ogmante eksponansyèlman',
    sec4HowTitle: '⚡ Kijan pou kòmanse touche?',
    sec4Step1Title: '1. Aktive kont ou ($2)',
    sec4Step1Desc: 'Ou antre dirèkteman nan sistèm nan',
    sec4Step2Title: '2. Envite omwen 2 moun',
    sec4Step2Desc1: 'Ou debloke pwogrè ou pi vit',
    sec4Step2Desc2: 'Ou deja touche rekonpans',
    sec4Step3Title: '3. Chwazi estrateji ou',
    sec4Step3Desc1: '• Kontinye envite → benefis pi rapid',
    sec4Step3Desc2: '• ⚙️ Oswa rete pasif → rezo a travay pou ou',
    sec4Step4Title: '4. Pwogrese otomatikman',
    sec4Step4Desc: 'Sistèm nan fè ou avanse nivo pa nivo',
    sec4Step5Title: '5. Touche nan chak etap',
    sec4Step5Desc: 'Chak pwogrè debloke nouvo benefis',
    sec4End1: 'Senp pou konprann',
    sec4End2: 'Aksesib pou tout moun',
    sec4End3: 'Fèt pou evolye avè w',
    sec4Final: 'Ou kòmanse piti, men ou ka ale trè lwen.',
    statInvestors: '10K+',
    statYield: '$500K+',
    statReferrals: '95%',
    statInvestorsLabel: 'Envestisè aktif',
    statYieldLabel: 'Volim trete',
    statReferralsLabel: 'Satisfaksyon manm',
    secValueTitle: 'Eksperyans premium, bati mobile-first.',
    secValueDesc:
      'Entèfas likid, gwo pèfòmans, ak jesyon espas estratejik pou tout gwosè ekran.',
    v1Title: 'Kwasans kontwole',
    v1Desc:
      'Chemen envestisman klè ak endikatè an tan reyèl pou swiv rezilta ou fasil.',
    v2Title: 'Sekirite avanse',
    v2Desc:
      'Pwoteksyon kont, validasyon operasyon, ak trasabilite total sou mouvman finansye yo.',
    v3Title: 'Bonis referans',
    v3Desc:
      'Envite rezo ou, debloke avantaj eksklizif, epi ogmante potansyèl pwofi ou.',
    secHowTitle: 'Kijan pou kòmanse vit',
    secHowDesc: '3 etap senp pou lanse aktivite ou.',
    h1Title: '1. Ouvri kont ou',
    h1Desc: 'Enskripsyon rapid, verifikasyon imedya, ak konfigirasyon pwofil gide.',
    h2Title: '2. Aktive bous ou',
    h2Desc: 'Depoze lajan, mete estrateji ou, epi swiv opòtinite sou dachbòd la.',
    h3Title: '3. Fè rezo ou grandi',
    h3Desc: 'Pataje lyen referans ou, swiv referrals, epi resevwa bonis otomatikman.',
    secBonusTitle: 'Pwogram avantaj ak referrals',
    secBonusDesc:
      'Yon ekosistèm ki fèt pou rekonpanse regilarite, kontribisyon, ak kwasans kolektif.',
    b1: 'Komisyon referans transparan',
    b2: 'Istwa bonis konplè',
    b3: 'Notifikasyon pwofi an tan reyèl',
    secFaqTitle: 'Kesyon yo poze souvan',
    q1: 'Konbyen mwen ka touche ak Ecrossflow?',
    a1: 'Benefis ou depann de aktivite ou ak pwogrè ou. Plis ou avanse nan nivo yo (F rive S), plis benefis yo vin gwo epi eksponansyèl.',
    q2: 'Èske mwen dwe envite moun pou m touche?',
    a2: 'Wi. Ou kòmanse touche depi premye filèl aktif ou. Pou pase nan pwochen board apre etap ranker la, ou bezwen omwen 2 filèl aktif.',
    q3: '⚙️ Èske sistèm nan mache menm si mwen pa fè anyen?',
    a3: 'Wi. Yon fwa ou aktif, ou ka kontinye pwogrese gras ak koule rezo a. Men plis ou aktif, plis ou touche vit.',
    q4: 'Kijan pwogrè a mache?',
    a4: 'Ou pase atravè 7 nivo (F rive S). Chak nivo gen: Starter → Challenger → Leader → Ranker. Chak etap ou franchi debloke benefis.',
    q5: 'Poukisa sèlman $2 pou kòmanse?',
    a5: 'Pou rann aksè a senp epi ouvè pou tout moun. Avèk montan sa a, ou antre nan sistèm nan ansanm ak opòtinite ak fòmasyon.',
    q6: 'Èske mwen resevwa lòt bagay anplis benefis yo?',
    a6: 'Wi. Ou ka jwenn aksè ak fòmasyon itil pou aprann epi evolye pandan w ap pwogrese.',
    q7: 'Èske kont mwen ak benefis mwen yo an sekirite?',
    a7: 'Wi. Platfòm nan fèt ak yon sistèm sekirize ak yon swivi klè sou evolisyon ou.',
    q8: 'Èske tout moun ka rantre?',
    a8: 'Wi. Ecrossflow ouvè pou nenpòt moun ki pare pou kòmanse epi evolye.',
    finalTitle: 'Kisa w ap tann ?',
    finalDesc: 'Pi bon moman pou kòmanse se kounye a.',
    finalLine1: 'Rantre nan Ecrossflow',
    finalLine2: 'Konekte',
    finalLine3: 'Kòmanse bati flow ou',
    finalCta: 'Kreye kont mwen',
    footerTitle: 'Konfyans, klète, responsabilite.',
    footerDesc:
      'Ecrossflow angaje pou ofri transparans, sekirite, ak bon sipò pou chak itilizatè.',
    footerTrust1: 'Règ ak chemen itilizatè klè',
    footerTrust2: 'Sekirite kont ak done',
    footerTrust3: 'Respè règleman lokal yo',
    footerTrust4: 'Sipò itilizatè ki reponn vit',
    navFeatures: 'Avantaj',
    navHow: 'Demaraj',
    navBonus: 'Referrals',
    navFaq: 'FAQ',
  },
};

const CORE_LANGUAGES = new Set(['fr', 'en', 'es', 'ht']);

function getCopy(language: string): LandingCopy {
  if (CORE_LANGUAGES.has(language)) return COPY[language] ?? COPY.en;
  return COPY.en;
}

function buildFrenchSourceFromOverrides(overrides: Record<string, unknown> | null | undefined): LandingCopy {
  const source = { ...COPY.fr };
  if (!overrides || typeof overrides !== "object") return source;
  const keys = Object.keys(source) as Array<keyof LandingCopy>;
  for (const key of keys) {
    const value = overrides[key];
    if (typeof value === "string" && value.trim()) {
      source[key] = value;
    }
  }
  return source;
}

export default function Landing() {
  const { language, setLanguage } = useAppStore();
  const [dynamicCopy, setDynamicCopy] = useState<LandingCopy | null>(null);
  const copy = dynamicCopy ?? getCopy(language);

  const [menuOpen, setMenuOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [search, setSearch] = useState('');
  const menuRef = useRef<HTMLDivElement | null>(null);

  const currentLang = getLanguageOption(language) ?? PRIMARY_LANGUAGE_OPTIONS[0];

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (event.target instanceof Node && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
        setOtherOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const filteredExtended = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return EXTENDED_LANGUAGE_OPTIONS;
    return EXTENDED_LANGUAGE_OPTIONS.filter((lang) => {
      return (
        lang.label.toLowerCase().includes(term) ||
        lang.nativeLabel.toLowerCase().includes(term) ||
        lang.value.toLowerCase().includes(term)
      );
    });
  }, [search]);

  const selectLanguage = (option: LanguageOption) => {
    setLanguage(option.value);
    persistLocale(option.value);

    setMenuOpen(false);
    setOtherOpen(false);

    const next = buildLocalizedPath(
      option.value,
      window.location.pathname,
      window.location.search,
      window.location.hash,
    );
    window.location.assign(next);
  };

  useEffect(() => {
    let active = true;
    const cacheKey = `landing_copy_${language}`;

    const loadDynamicCopy = async () => {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as LandingCopy;
          if (active) setDynamicCopy(parsed);
        } catch {
          // ignore invalid cache
        }
      }

      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      let source: LandingCopy = { ...COPY.fr };
      try {
        const contentRes = await fetch(`${base}/api/content/landing`);
        if (contentRes.ok) {
          const payload = await contentRes.json() as { value?: Record<string, unknown> };
          source = buildFrenchSourceFromOverrides(payload?.value);
        }
      } catch {
        source = { ...COPY.fr };
      }

      if (language === "fr") {
        if (!active) return;
        setDynamicCopy(source);
        localStorage.setItem(cacheKey, JSON.stringify(source));
        return;
      }

      const keys = Object.keys(source) as Array<keyof LandingCopy>;
      const texts = keys.map((key) => source[key]);
      const response = await fetch(`${base}/api/i18n/translate-runtime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: language, texts }),
      });
      if (!response.ok) {
        if (!active) return;
        setDynamicCopy(CORE_LANGUAGES.has(language) ? getCopy(language) : COPY.en);
        return;
      }
      const payload = await response.json() as { translations?: Record<string, string> };
      const translations = payload.translations || {};
      const merged = { ...source } as LandingCopy;
      for (const key of keys) {
        const sourceText = source[key];
        merged[key] = translations[sourceText] || sourceText;
      }
      if (!active) return;
      setDynamicCopy(merged);
      localStorage.setItem(cacheKey, JSON.stringify(merged));
    };

    void loadDynamicCopy();
    return () => { active = false; };
  }, [language]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#060809] text-white">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_5%,rgba(35,198,164,0.20),transparent_32%),radial-gradient(circle_at_85%_0%,rgba(64,124,255,0.22),transparent_36%),radial-gradient(circle_at_50%_100%,rgba(251,191,36,0.10),transparent_40%)]" />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#060809]/85 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-7xl px-4 py-2 sm:flex sm:h-20 sm:items-center sm:justify-between sm:px-6 sm:py-0">
          <div className="grid grid-cols-[1fr_auto] items-center gap-2 sm:flex sm:items-center sm:gap-3">
            <Link href="/" className="flex items-center gap-2.5 sm:gap-3">
              <div className="h-10 w-10 rounded-xl border border-[#f4b847]/45 bg-[#110b03]/85 p-1.5 shadow-[0_0_18px_rgba(236,167,56,0.26)] sm:h-11 sm:w-11 sm:rounded-2xl sm:p-2">
                <img
                  src={`${import.meta.env.BASE_URL}images/logo.png`}
                  alt="Ecrossflow"
                  className="h-full w-full object-contain"
                  loading="eager"
                  fetchPriority="high"
                />
              </div>
              <span className="font-display text-sm font-bold tracking-[0.08em] sm:text-lg">ECROSSFLOW</span>
            </Link>

            <div className="flex items-center gap-2 sm:gap-3">
              <Link href="/auth/login" className="hidden text-sm text-white/75 transition hover:text-white sm:inline">
                {copy.login}
              </Link>
              <Link
                href="/auth/register"
                className="rounded-xl bg-[#23c6a4] px-3 py-2 text-xs font-semibold text-black transition hover:bg-[#3be7c3] sm:px-4 sm:text-sm"
              >
                {copy.ctaTop}
              </Link>
            </div>

            <div ref={menuRef} className="relative col-span-2 sm:col-span-1">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-1.5 rounded-xl border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs sm:w-auto sm:justify-start sm:gap-2 sm:px-3 sm:py-2 sm:text-sm"
              >
                <Globe2 className="h-3.5 w-3.5 text-[#23c6a4] sm:h-4 sm:w-4" />
                <span className="max-w-[140px] truncate sm:max-w-[90px]">{currentLang.nativeLabel}</span>
                <span>{currentLang.flag ?? '🌐'}</span>
                <ChevronDown className="h-3.5 w-3.5 text-white/70 sm:h-4 sm:w-4" />
              </button>

              {menuOpen && (
                <div className="absolute left-0 top-[calc(100%+8px)] w-[300px] overflow-hidden rounded-2xl border border-white/15 bg-[#0b1014] shadow-2xl sm:left-auto sm:right-0">
                  <div className="border-b border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-white/60">
                    {copy.langLabel}
                  </div>
                  <div className="max-h-[330px] overflow-y-auto p-1.5">
                    {PRIMARY_LANGUAGE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => selectLanguage(option)}
                        className={`mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                          language === option.value
                            ? 'bg-[#23c6a4]/20 text-[#88ffe8]'
                            : 'text-white hover:bg-white/10'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span>{option.flag}</span>
                          <span>{option.nativeLabel}</span>
                        </span>
                        <span className="text-xs text-white/60">{option.label}</span>
                      </button>
                    ))}

                    <button
                      onClick={() => setOtherOpen((v) => !v)}
                      className="mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-white hover:bg-white/10"
                    >
                      <span>{copy.otherLangLabel}</span>
                      <ChevronDown
                        className={`h-4 w-4 text-white/70 transition-transform ${otherOpen ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {otherOpen && (
                      <div className="mt-1 rounded-xl border border-white/10 bg-black/20 p-2">
                        <input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder={copy.langSearch}
                          className="mb-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/45 focus:border-[#23c6a4]"
                        />
                        <div className="max-h-[240px] overflow-y-auto">
                          {filteredExtended.map((option) => (
                            <button
                              key={option.value}
                              onClick={() => selectLanguage(option)}
                              className={`mb-1 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition ${
                                language === option.value
                                  ? 'bg-[#23c6a4]/20 text-[#88ffe8]'
                                  : 'text-white hover:bg-white/10'
                              }`}
                            >
                              <span className="flex items-center gap-2">
                                <span>{option.flag ?? '🌐'}</span>
                                <span>{option.nativeLabel}</span>
                              </span>
                              <span className="text-xs text-white/60">{option.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <nav className="hidden items-center gap-7 text-sm text-white/70 lg:flex">
            <a href="#features" className="transition-colors hover:text-white">{copy.navFeatures}</a>
            <a href="#how" className="transition-colors hover:text-white">{copy.navHow}</a>
            <a href="#bonus" className="transition-colors hover:text-white">{copy.navBonus}</a>
            <a href="#faq" className="transition-colors hover:text-white">{copy.navFaq}</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pb-20 sm:pt-12">
        <section className="relative overflow-hidden rounded-[28px] border border-white/12 bg-[linear-gradient(140deg,rgba(21,29,35,0.85),rgba(5,8,10,0.92))] p-4 sm:p-6 lg:p-8">
          <div className="pointer-events-none absolute -top-20 right-[-40px] h-56 w-56 rounded-full bg-[#23c6a4]/20 blur-3xl sm:h-72 sm:w-72" />
          <div className="pointer-events-none absolute -bottom-24 left-[-60px] h-56 w-56 rounded-full bg-[#3b82f6]/20 blur-3xl sm:h-72 sm:w-72" />
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-[56%] top-[52%] -translate-x-1/2 -translate-y-1/2 opacity-90">
              <NeonGlobe />
            </div>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_52%_48%,rgba(35,198,164,0.16),rgba(0,0,0,0)_56%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(6,10,12,0.86)_0%,rgba(6,10,12,0.34)_50%,rgba(6,10,12,0.74)_100%)]" />
          </div>

          <div className="relative z-10 grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-8">
            <div className="space-y-4 sm:space-y-5">
              <motion.span
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="inline-flex items-center gap-2 rounded-full border border-[#23c6a4]/35 bg-[#23c6a4]/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#82ffe3] sm:px-4 sm:py-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {copy.badge}
              </motion.span>

              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.05 }}
                className="font-display text-[2rem] font-bold leading-[1.03] tracking-tight sm:text-5xl lg:text-6xl"
              >
                {copy.heroTitle1}
                <span className="mt-2 block bg-gradient-to-r from-[#23c6a4] to-[#8ce7ff] bg-clip-text text-transparent">
                  {copy.heroTitle2}
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.12 }}
                className="max-w-2xl text-sm leading-6 text-white/75 sm:text-base sm:leading-7"
              >
                {copy.heroDesc}
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.16 }}
                className="inline-flex items-center gap-2 rounded-full border border-[#ffe083]/35 bg-[#ffe083]/12 px-3 py-1.5 text-xs font-semibold text-[#ffe9ad]"
              >
                <CircleDollarSign className="h-4 w-4" />
                {copy.heroStart3}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.2 }}
                className="flex flex-col gap-2.5 pt-1 sm:flex-row sm:flex-wrap"
              >
                <Link
                  href="/auth/register"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#23c6a4] px-6 py-3 text-sm font-semibold text-black transition hover:-translate-y-0.5 hover:bg-[#3be7c3]"
                >
                  {copy.heroPrimary}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#features"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  {copy.heroSecondary}
                </a>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="rounded-3xl border border-white/12 bg-black/25 p-4 sm:p-5"
            >
              <div className="relative mb-4 h-28 overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_50%_45%,rgba(35,198,164,0.35),rgba(0,0,0,0.02)_55%)] sm:h-32">
                <div className="absolute left-[12%] top-[62%] h-2.5 w-2.5 rounded-full bg-[#8fffe8]" />
                <div className="absolute left-[32%] top-[38%] h-2.5 w-2.5 rounded-full bg-[#8fffe8]" />
                <div className="absolute left-[50%] top-[52%] h-3 w-3 rounded-full bg-[#4be8c5]" />
                <div className="absolute right-[26%] top-[30%] h-2.5 w-2.5 rounded-full bg-[#8fffe8]" />
                <div className="absolute right-[10%] top-[58%] h-2.5 w-2.5 rounded-full bg-[#8fffe8]" />
                <div className="absolute left-[14%] top-[63%] h-px w-[18%] bg-[#7cead2]/70" />
                <div className="absolute left-[34%] top-[40%] h-px w-[18%] bg-[#7cead2]/70 rotate-[18deg]" />
                <div className="absolute left-[52%] top-[54%] h-px w-[21%] bg-[#7cead2]/70 -rotate-[16deg]" />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {[
                  [copy.statInvestors, copy.statInvestorsLabel, Users],
                  [copy.statYield, copy.statYieldLabel, BadgeDollarSign],
                  [copy.statReferrals, copy.statReferralsLabel, HandCoins],
                ].map(([value, label, Icon]) => (
                  <div key={String(label)} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="mb-2 inline-flex rounded-xl border border-white/10 bg-white/5 p-2">
                      <Icon className="h-4 w-4 text-[#7cead2]" />
                    </div>
                    <p className="font-display text-3xl font-bold text-white">{value}</p>
                    <p className="mt-1 text-xs text-white/65">{label}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        <section id="features" className="mt-14 sm:mt-20">
          <div className="overflow-hidden rounded-3xl border border-[#ff9f6a]/25 bg-[linear-gradient(140deg,rgba(255,159,106,0.12),rgba(255,255,255,0.03))]">
            <div className="border-b border-white/10 px-5 py-5 sm:px-8 sm:py-7">
              <p className="font-display text-2xl font-bold leading-tight sm:text-4xl">
                <strong>{copy.painTitle}</strong>
              </p>
            </div>

            <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4 px-5 py-6 sm:space-y-5 sm:px-8 sm:py-8">
                {[
                  copy.pain1,
                  copy.pain2,
                  copy.pain3,
                ].map((line, index) => (
                  <div
                    key={line}
                    className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ff9f6a]/20 text-xs font-bold text-[#ffd7bf]">
                      {index + 1}
                    </span>
                    <p className="text-sm leading-6 text-white/85 sm:text-base">{line}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center border-t border-white/10 bg-black/20 px-5 py-6 sm:px-8 sm:py-8 lg:border-l lg:border-t-0">
                <div className="w-full rounded-2xl border border-[#ff9f6a]/25 bg-[#ff9f6a]/10 p-5 sm:p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ffd7bf]">{copy.painResultLabel}</p>
                  <p className="mt-3 font-display text-2xl font-bold leading-tight text-white sm:text-3xl">
                    {copy.painResult}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 sm:mt-10">
          <div className="rounded-3xl border border-[#23c6a4]/30 bg-[linear-gradient(145deg,rgba(35,198,164,0.14),rgba(59,130,246,0.06))] p-5 sm:p-7">
            <h2 className="font-display text-2xl font-bold sm:text-4xl">
              {copy.sec3Title}
            </h2>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:mt-6 sm:gap-4 md:grid-cols-2">
              {[
                copy.sec3Step1,
                copy.sec3Step2,
                copy.sec3Step3,
                copy.sec3Step4,
              ].map((item, index) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#23c6a4]/20 text-xs font-bold text-[#82ffe3]">
                    {index + 1}
                  </span>
                  <p className="text-sm text-white/90 sm:text-base">{item}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-white/12 bg-black/25 p-4 sm:mt-6 sm:p-5">
              <p className="text-sm text-white/85 sm:text-base">{copy.sec3NoExpert}</p>
              <p className="mt-1 text-sm text-white/85 sm:text-base">{copy.sec3NoBigStart}</p>
              <div className="mt-3 space-y-1 text-sm font-semibold text-[#9dfbe8] sm:text-base">
                <p>{copy.sec3Decision}</p>
                <p>{copy.sec3Action}</p>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="mt-14 sm:mt-20">
          <div className="rounded-3xl border border-[#7bdff6]/30 bg-[linear-gradient(145deg,rgba(59,130,246,0.12),rgba(35,198,164,0.08))] p-5 sm:p-8">
            <div className="mb-6 sm:mb-8">
              <h2 className="font-display text-2xl font-bold sm:text-4xl">
                {copy.sec4Title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/85 sm:text-base">
                {copy.sec4Intro}
              </p>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  copy.sec4Access1,
                  copy.sec4Access2,
                  copy.sec4Access3,
                  copy.sec4Access4,
                ].map((item) => (
                  <p key={item} className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/90">
                    {item}
                  </p>
                ))}
              </div>
              <p className="mt-4 text-sm text-white/90 sm:text-base">{copy.sec4NotPromise}</p>
              <p className="text-sm text-white/90 sm:text-base">{copy.sec4RealMechanic}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-6">
              <h3 className="font-display text-xl font-bold sm:text-2xl">{copy.sec4JourneyTitle}</h3>
              <p className="mt-2 text-sm text-white/80 sm:text-base">
                {copy.sec4Journey1}
              </p>
              <p className="mt-1 text-sm text-white/80 sm:text-base">
                {copy.sec4Journey2}
              </p>
              <p className="mt-3 text-sm font-semibold text-[#9dfbe8] sm:text-base">
                {copy.sec4Journey3}
              </p>
            </div>

            <div className="mt-6">
              <h3 className="font-display text-xl font-bold sm:text-2xl">{copy.sec4HowTitle}</h3>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm font-semibold text-white sm:text-base">{copy.sec4Step1Title}</p>
                  <p className="mt-1 text-sm text-white/80">{copy.sec4Step1Desc}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm font-semibold text-white sm:text-base">{copy.sec4Step2Title}</p>
                  <p className="mt-1 text-sm text-white/80">{copy.sec4Step2Desc1}</p>
                  <p className="mt-1 text-sm text-white/80">{copy.sec4Step2Desc2}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm font-semibold text-white sm:text-base">{copy.sec4Step3Title}</p>
                  <p className="mt-1 text-sm text-white/80">{copy.sec4Step3Desc1}</p>
                  <p className="mt-1 text-sm text-white/80">{copy.sec4Step3Desc2}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm font-semibold text-white sm:text-base">{copy.sec4Step4Title}</p>
                  <p className="mt-1 text-sm text-white/80">{copy.sec4Step4Desc}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm font-semibold text-white sm:text-base">{copy.sec4Step5Title}</p>
                  <p className="mt-1 text-sm text-white/80">{copy.sec4Step5Desc}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-[#23c6a4]/30 bg-[#23c6a4]/10 p-4 sm:p-5">
              <p className="text-sm text-white/90 sm:text-base">{copy.sec4End1}</p>
              <p className="mt-1 text-sm text-white/90 sm:text-base">{copy.sec4End2}</p>
              <p className="mt-1 text-sm text-white/90 sm:text-base">{copy.sec4End3}</p>
              <p className="mt-3 font-display text-xl font-bold text-[#aaffef] sm:text-2xl">
                {copy.sec4Final}
              </p>
            </div>
          </div>
        </section>

        <section id="bonus" className="mt-14 sm:mt-20">
          <div className="rounded-3xl border border-white/12 bg-[linear-gradient(140deg,rgba(35,198,164,0.16),rgba(59,130,246,0.08))] p-5 sm:p-8">
            <h2 className="font-display text-2xl font-bold sm:text-4xl">{copy.secBonusTitle}</h2>
            <p className="mt-2 max-w-2xl text-sm text-white/75 sm:text-base">{copy.secBonusDesc}</p>
            <div className="mt-6 grid grid-cols-1 gap-2 sm:mt-8 sm:grid-cols-3 sm:gap-3">
              {[copy.b1, copy.b2, copy.b3].map((item) => (
                <div key={item} className="flex items-start gap-2 rounded-xl border border-white/12 bg-black/25 p-3 text-sm text-white/85 sm:p-4">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#8bf8e2]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="mt-14 sm:mt-20">
          <h2 className="mb-4 font-display text-2xl font-bold sm:mb-6 sm:text-4xl">{copy.secFaqTitle}</h2>
          <div className="space-y-2.5 sm:space-y-3">
            {[
              [copy.q1, copy.a1],
              [copy.q2, copy.a2],
              [copy.q3, copy.a3],
              [copy.q4, copy.a4],
              [copy.q5, copy.a5],
              [copy.q6, copy.a6],
              [copy.q7, copy.a7],
              [copy.q8, copy.a8],
            ].map(([q, a]) => (
              <details key={String(q)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                <summary className="cursor-pointer list-none text-sm font-semibold sm:text-base">{q}</summary>
                <p className="mt-2 text-sm leading-6 text-white/70">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-14 sm:mt-20">
          <div className="rounded-3xl border border-[#23c6a4]/35 bg-[linear-gradient(100deg,rgba(35,198,164,0.20),rgba(12,19,23,0.45))] px-5 py-8 text-center sm:px-10 sm:py-12">
            <h3 className="font-display text-2xl font-bold sm:text-4xl">{copy.finalTitle}</h3>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-white/75 sm:mt-3 sm:text-base">{copy.finalDesc}</p>
            <div className="mx-auto mt-4 max-w-xl space-y-1 text-sm text-white/90 sm:text-base">
              <p>• {copy.finalLine1}</p>
              <p>• {copy.finalLine2}</p>
              <p>• {copy.finalLine3}</p>
            </div>
            <Link
              href="/auth/register"
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#23c6a4] px-6 py-3 text-sm font-semibold text-black transition hover:-translate-y-0.5 hover:bg-[#3be7c3] sm:mt-7"
            >
              {copy.finalCta}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-black/25 py-6">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
            <div className="flex flex-col gap-3 text-center md:flex-row md:items-start md:justify-between md:text-left">
              <div className="max-w-xl">
                <p className="font-display text-sm font-semibold text-white/85">Ecrossflow © 2026</p>
                <p className="mt-1 text-sm font-semibold text-white">{copy.footerTitle}</p>
                <p className="mt-1 text-xs leading-5 text-white/65 sm:text-sm">{copy.footerDesc}</p>
              </div>
              <div className="grid grid-cols-1 gap-1.5 text-xs text-white/75 sm:grid-cols-2 sm:gap-x-4 sm:text-sm">
                <p>• {copy.footerTrust1}</p>
                <p>• {copy.footerTrust2}</p>
                <p>• {copy.footerTrust3}</p>
                <p>• {copy.footerTrust4}</p>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
