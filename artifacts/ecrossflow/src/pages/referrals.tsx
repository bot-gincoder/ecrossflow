import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Copy, Gift, Check, Share2, ExternalLink, QrCode } from 'lucide-react';
import { useGetReferrals } from '@workspace/api-client-react';
import type { ReferralItem } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout';
import { QRCodeSVG } from 'qrcode.react';
import { useAppStore } from '@/hooks/use-store';

const REQUIRED_ACTIVE = 1;

export default function ReferralsPage() {
  const { t, language } = useAppStore();
  const { data } = useGetReferrals();
  const enhanced = (data || {}) as typeof data & {
    whatsappShareUrl?: string;
    telegramShareUrl?: string;
    shareMessages?: { whatsapp?: string; telegram?: string; generic?: string };
    shareLinks?: { whatsapp?: string; telegram?: string };
  };
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [showQR, setShowQR] = useState(false);

  const copyCode = () => {
    if (data?.referralCode) {
      navigator.clipboard.writeText(data.referralCode);
      setCopied('code');
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const copyLink = () => {
    if (data?.referralLink) {
      navigator.clipboard.writeText(data.referralLink);
      setCopied('link');
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const shareWhatsApp = () => {
    const url = enhanced.shareLinks?.whatsapp || enhanced.whatsappShareUrl;
    if (url) {
      window.open(url, '_blank');
      return;
    }
    const text = `Rejoins Ecrossflow. Code: ${data?.referralCode}. Lien: ${data?.referralLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareTelegram = () => {
    const url = enhanced.shareLinks?.telegram || enhanced.telegramShareUrl;
    if (url) {
      window.open(url, '_blank');
      return;
    }
    const text = `Rejoins Ecrossflow. Code: ${data?.referralCode}.`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(data?.referralLink || '')}&text=${encodeURIComponent(text)}`, '_blank');
  };

  const activeReferrals = data?.activeReferrals || 0;
  const progressPct = Math.min((activeReferrals / REQUIRED_ACTIVE) * 100, 100);
  const isActivated = activeReferrals >= REQUIRED_ACTIVE;

  return (
    <AppLayout>
      <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-display font-bold">{t('referrals.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('referrals.subtitle')}</p>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: t('referrals.total'), value: data?.totalReferrals || 0, icon: Users, color: 'text-primary' },
            { label: t('referrals.active'), value: data?.activeReferrals || 0, icon: Check, color: 'text-emerald-400' },
            { label: t('referrals.bonus'), value: `$${(data?.totalBonusEarned || 0).toFixed(2)}`, icon: Gift, color: 'text-yellow-400' },
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

        {/* Activation Progress Bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-5 border ${isActivated ? 'bg-primary/10 border-primary/30' : 'bg-card/40 border-border'}`}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-semibold text-sm">{t('referrals.activation_title')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isActivated
                  ? t('referrals.activation_done')
                  : t('referrals.activation_needed').replace('{current}', String(activeReferrals)).replace('{required}', String(REQUIRED_ACTIVE))}
              </p>
            </div>
            <span className={`text-sm font-bold font-display ${isActivated ? 'text-primary' : 'text-muted-foreground'}`}>
              {activeReferrals}/{REQUIRED_ACTIVE}
            </span>
          </div>
          <div className="h-3 bg-muted/50 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className={`h-full rounded-full transition-all ${isActivated ? 'bg-primary shadow-[0_0_10px_rgba(0,255,170,0.5)]' : 'bg-muted-foreground/40'}`}
            />
          </div>
          {!isActivated && (
            <p className="text-xs text-muted-foreground mt-2">
              {t('referrals.activation_left').replace('{left}', String(REQUIRED_ACTIVE - activeReferrals))}
            </p>
          )}
        </motion.div>

        {/* Referral Code Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-3xl p-6 md:p-8"
        >
          <div className="flex items-center gap-3 mb-6">
            <Share2 className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-display font-bold">{t('referrals.your_code')}</h2>
          </div>

          {/* Code */}
          <div className="flex items-center justify-between bg-card/60 border border-border/50 rounded-2xl px-6 py-5 mb-4">
            <span className="text-2xl font-display font-bold font-mono tracking-widest text-primary">
              {data?.referralCode || 'ECF-XXXXXX'}
            </span>
            <button
              onClick={copyCode}
              className="p-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary transition-all"
            >
              {copied === 'code' ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>

          {/* Link */}
          <div className="flex items-center justify-between bg-card/40 border border-border/30 rounded-xl px-4 py-3 text-sm text-muted-foreground overflow-hidden mb-5">
            <span className="truncate">{data?.referralLink || 'https://ecrossflow.com/auth/register?ref=...'}</span>
            <div className="flex items-center gap-1 ml-2 shrink-0">
              <button onClick={copyLink} className="p-1.5 hover:text-primary transition-colors">
                {copied === 'link' ? <Check className="w-4 h-4 text-primary" /> : <ExternalLink className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setShowQR(v => !v)}
                className="p-1.5 hover:text-primary transition-colors"
                title={t('referrals.qr_show')}
              >
                <QrCode className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* QR Code */}
          {showQR && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              className="flex justify-center mb-5"
            >
              <div className="bg-white p-4 rounded-2xl shadow-lg">
                <QRCodeSVG
                  value={data?.referralLink || 'https://ecrossflow.com'}
                  size={180}
                  fgColor="#111111"
                  level="M"
                />
              </div>
            </motion.div>
          )}

          {/* Share Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={shareWhatsApp}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/20 font-medium text-sm transition-all"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M11.999 2C6.477 2 2 6.477 2 12c0 1.892.523 3.658 1.432 5.17L2.048 22l4.944-1.36A9.945 9.945 0 0 0 12 22c5.522 0 10-4.477 10-10S17.522 2 12 2zm.001 18.18a8.154 8.154 0 0 1-4.152-1.133l-.297-.177-3.08.847.87-3.009-.196-.31a8.17 8.17 0 0 1-1.327-4.398c0-4.517 3.673-8.19 8.182-8.19 4.508 0 8.18 3.673 8.18 8.19 0 4.517-3.672 8.18-8.18 8.18z" />
              </svg>
              WhatsApp
            </button>
            <button
              onClick={shareTelegram}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0088cc]/10 border border-[#0088cc]/30 text-[#0088cc] hover:bg-[#0088cc]/20 font-medium text-sm transition-all"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.17 14.137l-2.965-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.983.422z" />
              </svg>
              Telegram
            </button>
            <button
              onClick={copyLink}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-muted border border-border hover:bg-muted/80 font-medium text-sm transition-all"
            >
              {copied === 'link' ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
              {t('referrals.copy_link')}
            </button>
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            {t('referrals.share_hint')}
          </p>
        </motion.div>

        {/* Referrals List */}
        <div>
          <h2 className="text-xl font-display font-bold mb-4">{t('referrals.list_title')}</h2>
          <div className="space-y-2">
            {(!data?.referrals || data.referrals.length === 0) && (
              <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-2xl">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>{t('referrals.no_referrals')}</p>
                <p className="text-sm mt-1">{t('referrals.share')}</p>
              </div>
            )}
            {data?.referrals?.map((r: ReferralItem, idx: number) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }}
                className="flex items-center justify-between bg-card/40 border border-border/50 rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                    {r.firstName?.[0] || r.username?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <p className="font-medium text-sm">@{r.username}</p>
                    <p className="text-xs text-muted-foreground">{t('referrals.joined_on')} {new Date(r.joinedAt).toLocaleDateString(language === 'fr' ? 'fr-FR' : language)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status === 'ACTIVE' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {r.status === 'ACTIVE' ? t('common.status_active') : t('common.status_pending')}
                  </span>
                  {r.bonusPaid && (
                    <span className="text-xs bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded-full font-medium">{t('referrals.bonus_paid')}</span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
