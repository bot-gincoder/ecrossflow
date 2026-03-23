import React from 'react';
import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" />
          Retour
        </Link>

        <h1 className="text-4xl font-display font-bold mb-2">Politique de Confidentialité</h1>
        <p className="text-muted-foreground mb-12">Dernière mise à jour : 23 mars 2026</p>

        <div className="space-y-8 text-muted-foreground">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Données collectées</h2>
            <p>Nous collectons les informations que vous nous fournissez lors de l'inscription : nom, prénom, adresse email, numéro de téléphone et informations de paiement. Nous collectons également des données d'utilisation automatiquement.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Utilisation des données</h2>
            <p>Vos données sont utilisées pour : gérer votre compte, traiter vos transactions, vous envoyer des notifications importantes, améliorer notre service et prévenir la fraude.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Partage des données</h2>
            <p>Nous ne vendons jamais vos données personnelles. Certaines informations partielles (pseudo, progression dans les boards) sont visibles par les autres membres. Vos données financières restent strictement confidentielles.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Sécurité</h2>
            <p>Nous utilisons des protocoles de sécurité standards de l'industrie pour protéger vos données : chiffrement SSL/TLS, authentification JWT, hachage des mots de passe.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Vos droits</h2>
            <p>Vous avez le droit d'accéder à vos données, de les corriger, de les supprimer ou d'en demander une copie. Contactez-nous à <span className="text-primary">privacy@ecrossflow.com</span> pour exercer ces droits.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Cookies</h2>
            <p>Nous utilisons des données de session locales (localStorage) pour maintenir votre session et vos préférences. Aucun cookie de suivi tiers n'est utilisé.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Rétention des données</h2>
            <p>Vos données sont conservées pendant la durée de votre compte et jusqu'à 5 ans après sa clôture pour des raisons légales et comptables.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Contact</h2>
            <p>Pour toute question concernant notre politique de confidentialité : <span className="text-primary">privacy@ecrossflow.com</span></p>
          </section>
        </div>
      </div>
    </div>
  );
}
