import React from 'react';
import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';

const BOARDS = [
  { id: 'F', fee: 2, gain: 16, color: 'text-gray-400' },
  { id: 'E', fee: 8, gain: 64, color: 'text-amber-600' },
  { id: 'D', fee: 32, gain: 256, color: 'text-gray-300' },
  { id: 'C', fee: 128, gain: 1024, color: 'text-yellow-400' },
  { id: 'B', fee: 512, gain: 4096, color: 'text-blue-400' },
  { id: 'A', fee: 2048, gain: 16384, color: 'text-emerald-400' },
  { id: 'S', fee: 8192, gain: 65536, color: 'text-purple-400' },
];

const STEPS = [
  { num: '01', title: 'Créez votre compte', desc: 'Inscrivez-vous avec un code de parrainage valide. Complétez votre profil et activez votre compte.' },
  { num: '02', title: 'Déposez des fonds', desc: 'Alimentez votre bourse virtuelle via MonCash, NatCash, virement bancaire, crypto ou PayPal.' },
  { num: '03', title: 'Rejoignez le Board F', desc: 'Payez les $2 d\'entrée pour rejoindre votre premier board. Vous devenez Starter.' },
  { num: '04', title: 'Progressez', desc: 'À chaque board complété, vous avancez au niveau suivant avec un multiplicateur de 8x.' },
  { num: '05', title: 'Devenez Ranker', desc: 'Quand vous êtes promu Ranker, vous recevez les contributions des 8 nouveaux membres qui rejoignent votre board.' },
  { num: '06', title: 'Retirez vos gains', desc: 'Retirez vos fonds disponibles directement dans votre bourse et sur votre méthode de paiement préférée.' },
];

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" />
          Retour
        </Link>

        <h1 className="text-4xl font-display font-bold mb-4">Comment ça marche ?</h1>
        <p className="text-xl text-muted-foreground mb-12">
          Le système de boards Ecrossflow est simple, transparent et progressif.
        </p>

        <div className="mb-16">
          <h2 className="text-2xl font-display font-bold mb-8">Les 6 étapes</h2>
          <div className="space-y-6">
            {STEPS.map(step => (
              <div key={step.num} className="flex gap-6 p-6 rounded-2xl bg-card border border-border">
                <div className="text-4xl font-display font-bold text-primary/30 min-w-[3rem]">{step.num}</div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                  <p className="text-muted-foreground">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-16">
          <h2 className="text-2xl font-display font-bold mb-8">Les 7 Boards</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Board</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">Entrée</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">Gain total</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">Multiplicateur</th>
                </tr>
              </thead>
              <tbody>
                {BOARDS.map(board => (
                  <tr key={board.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className={`py-3 px-4 font-display font-bold text-lg ${board.color}`}>{board.id}</td>
                    <td className="py-3 px-4 text-right font-mono">${board.fee.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-mono text-primary">${board.gain.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground">×8</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-center">
          <Link href="/auth/register" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-4 rounded-xl font-semibold hover:opacity-90 transition-opacity">
            Commencer maintenant
          </Link>
        </div>
      </div>
    </div>
  );
}
