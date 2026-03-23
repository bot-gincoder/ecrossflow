import React from 'react';
import { motion } from 'framer-motion';
import { Users, Copy, Gift, Check, Share2, ExternalLink } from 'lucide-react';
import { useGetReferrals } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout';

export default function ReferralsPage() {
  const { data } = useGetReferrals();
  const [copied, setCopied] = React.useState(false);

  const copyCode = () => {
    if (data?.referralCode) {
      navigator.clipboard.writeText(data.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyLink = () => {
    if (data?.referralLink) {
      navigator.clipboard.writeText(data.referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-display font-bold">Parrainage</h1>
          <p className="text-muted-foreground mt-1">Invitez vos amis et gagnez des bonus</p>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Total Parrainés', value: data?.totalReferrals || 0, icon: Users, color: 'text-primary' },
            { label: 'Actifs', value: data?.activeReferrals || 0, icon: Check, color: 'text-emerald-400' },
            { label: 'Bonus Gagnés', value: `$${(data?.totalBonusEarned || 0).toFixed(2)}`, icon: Gift, color: 'text-yellow-400' },
          ].map(({ label, value, icon: Icon, color }) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-card/50 border border-border rounded-2xl p-6"
            >
              <Icon className={`w-6 h-6 mb-3 ${color}`} />
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className={`text-3xl font-display font-bold ${color}`}>{value}</p>
            </motion.div>
          ))}
        </div>

        {/* Referral Code Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-3xl p-6 md:p-8"
        >
          <div className="flex items-center gap-3 mb-6">
            <Share2 className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-display font-bold">Votre Code de Parrainage</h2>
          </div>

          <div className="flex items-center justify-between bg-card/60 border border-border/50 rounded-2xl px-6 py-5 mb-4">
            <span className="text-2xl font-display font-bold font-mono tracking-widest text-primary">
              {data?.referralCode || 'ECF-XXXXXX'}
            </span>
            <button
              onClick={copyCode}
              className="p-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary transition-all"
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>

          <div className="flex items-center justify-between bg-card/40 border border-border/30 rounded-xl px-4 py-3 text-sm text-muted-foreground overflow-hidden">
            <span className="truncate">{data?.referralLink || 'https://ecrossflow.com/auth/register?ref=...'}</span>
            <button onClick={copyLink} className="ml-3 p-1.5 hover:text-primary transition-colors shrink-0">
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            Partagez ce lien ou ce code avec vos amis. Vous recevrez un bonus lorsqu'ils activent leur compte et rejoignent leur premier board.
          </p>
        </motion.div>

        {/* Referrals List */}
        <div>
          <h2 className="text-xl font-display font-bold mb-4">Vos Filleuls</h2>
          <div className="space-y-2">
            {(!data?.referrals || data.referrals.length === 0) && (
              <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-2xl">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>Aucun filleul pour l'instant</p>
                <p className="text-sm mt-1">Partagez votre code pour commencer !</p>
              </div>
            )}
            {data?.referrals?.map((r: any, idx: number) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }}
                className="flex items-center justify-between bg-card/40 border border-border/50 rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                    {r.firstName?.[0] || r.username?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-sm">@{r.username}</p>
                    <p className="text-xs text-muted-foreground">Rejoint {new Date(r.joinedAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === 'ACTIVE' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {r.status}
                  </span>
                  {r.bonusPaid && <span className="text-xs bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded-full">Bonus payé</span>}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
