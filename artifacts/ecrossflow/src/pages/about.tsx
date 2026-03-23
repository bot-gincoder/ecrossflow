import React from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Users, Shield, Globe, TrendingUp } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" />
          Retour
        </Link>
        
        <h1 className="text-4xl font-display font-bold mb-4">À propos d'Ecrossflow</h1>
        <p className="text-xl text-muted-foreground mb-12">
          Ecrossflow est une plateforme numérique de don communautaire et bourse virtuelle basée sur un système pyramidal progressif.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
          <div className="p-6 rounded-2xl bg-card border border-border">
            <Users className="w-8 h-8 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">Communauté solidaire</h3>
            <p className="text-muted-foreground">
              Un réseau de membres engagés qui se soutiennent mutuellement à travers des boards progressifs allant de F à S.
            </p>
          </div>
          <div className="p-6 rounded-2xl bg-card border border-border">
            <Shield className="w-8 h-8 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">Transparence totale</h3>
            <p className="text-muted-foreground">
              Toutes les transactions sont visibles en temps réel. Chaque don, chaque retrait est tracé et transparent.
            </p>
          </div>
          <div className="p-6 rounded-2xl bg-card border border-border">
            <Globe className="w-8 h-8 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">Multi-devises</h3>
            <p className="text-muted-foreground">
              Supportant USD, HTG, EUR, et crypto, Ecrossflow s'adapte à votre réalité financière.
            </p>
          </div>
          <div className="p-6 rounded-2xl bg-card border border-border">
            <TrendingUp className="w-8 h-8 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">Progression structurée</h3>
            <p className="text-muted-foreground">
              7 niveaux (F à S) avec des gains multipliés par 8 à chaque étape. Un système clair et équitable.
            </p>
          </div>
        </div>

        <div className="prose prose-lg max-w-none text-foreground">
          <h2 className="text-2xl font-display font-bold mb-4">Notre mission</h2>
          <p className="text-muted-foreground mb-6">
            Ecrossflow a été créé pour offrir à chaque membre une opportunité réelle de croissance financière collective, 
            en s'appuyant sur la force du groupe et la transparence numérique.
          </p>
          <p className="text-muted-foreground">
            Chaque membre contribue et bénéficie selon sa progression dans les boards. Le système est conçu pour 
            récompenser la participation active et la solidarité communautaire.
          </p>
        </div>
      </div>
    </div>
  );
}
