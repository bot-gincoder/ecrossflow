import React from 'react';
import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" />
          Retour
        </Link>

        <h1 className="text-4xl font-display font-bold mb-2">Conditions Générales d'Utilisation</h1>
        <p className="text-muted-foreground mb-12">Dernière mise à jour : 23 mars 2026</p>

        <div className="space-y-8 text-muted-foreground">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Acceptation des conditions</h2>
            <p>En vous inscrivant sur Ecrossflow, vous acceptez les présentes conditions générales d'utilisation dans leur intégralité. Si vous n'acceptez pas ces conditions, vous ne pouvez pas utiliser la plateforme.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Description du service</h2>
            <p>Ecrossflow est une plateforme numérique de don communautaire basée sur un système de boards progressifs. Les membres participent volontairement à des cycles de donations mutuelles.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Éligibilité</h2>
            <p>Pour utiliser Ecrossflow, vous devez être âgé d'au moins 18 ans et avoir la capacité légale de conclure des contrats dans votre juridiction. Un code de parrainage valide est requis pour l'inscription.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Compte utilisateur</h2>
            <p>Vous êtes responsable de maintenir la confidentialité de vos informations de connexion. Toute activité sur votre compte vous est attribuée. Signalez immédiatement tout accès non autorisé.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Règles de participation</h2>
            <p>Les donations sont volontaires et définitives. Aucun remboursement ne peut être effectué une fois qu'une donation a été validée. Tout comportement frauduleux entraînera la suspension définitive du compte.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Limitation de responsabilité</h2>
            <p>Ecrossflow ne garantit pas des gains spécifiques. Les résultats dépendent de la participation active de la communauté. La plateforme n'est pas responsable des pertes potentielles.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Modifications</h2>
            <p>Ecrossflow se réserve le droit de modifier ces CGU à tout moment. Les utilisateurs seront notifiés des changements importants par notification sur la plateforme.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Contact</h2>
            <p>Pour toute question concernant ces conditions, contactez-nous à : <span className="text-primary">support@ecrossflow.com</span></p>
          </section>
        </div>
      </div>
    </div>
  );
}
