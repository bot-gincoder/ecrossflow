import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Shield, Palette, Globe, Save, Loader2 } from 'lucide-react';
import { useGetMe, useUpdateSettings } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout';
import { useAppStore } from '@/hooks/use-store';
import { useQueryClient } from '@tanstack/react-query';

export default function ProfilePage() {
  const { data: user } = useGetMe();
  const { theme, setTheme, language, setLanguage } = useAppStore();
  const queryClient = useQueryClient();

  const { mutate: updateSettings, isPending } = useUpdateSettings({
    mutation: { onSuccess: () => queryClient.invalidateQueries() }
  });

  const handleSaveSettings = () => {
    updateSettings({ data: { preferredLanguage: language, preferredTheme: theme } });
  };

  return (
    <AppLayout>
      <div className="space-y-8 max-w-2xl">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-display font-bold">Profil</h1>
          <p className="text-muted-foreground mt-1">Vos informations et préférences</p>
        </motion.div>

        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card/50 border border-border rounded-3xl p-6"
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-primary text-2xl font-bold font-display">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div>
              <h2 className="text-xl font-display font-bold">{user?.firstName} {user?.lastName}</h2>
              <p className="text-sm text-muted-foreground">@{user?.username}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user?.status === 'ACTIVE' ? 'bg-primary/10 text-primary' : 'bg-yellow-500/10 text-yellow-400'}`}>
                  {user?.status}
                </span>
                {user?.role === 'ADMIN' && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-medium">ADMIN</span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {[
              { label: 'Numéro de compte', value: user?.accountNumber },
              { label: 'Email', value: user?.email },
              { label: 'Téléphone', value: user?.phone || 'Non renseigné' },
              { label: 'Board actuel', value: `Board ${user?.currentBoard || 'F'}` },
              { label: 'Code de parrainage', value: user?.referralCode, mono: true },
              { label: 'Membre depuis', value: user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—' },
            ].map(({ label, value, mono }) => (
              <div key={label} className="flex items-center justify-between py-3 border-b border-border/40 last:border-0">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className={`text-sm font-medium ${mono ? 'font-mono text-primary' : ''}`}>{value || '—'}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Preferences */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-card/50 border border-border rounded-3xl p-6"
        >
          <h3 className="text-lg font-display font-bold mb-5 flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" /> Préférences
          </h3>

          <div className="space-y-5">
            <div>
              <label className="text-sm font-medium text-muted-foreground block mb-3 flex items-center gap-2">
                <Palette className="w-4 h-4" /> Thème
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { value: 'light', label: 'Light', icon: '☀️' },
                  { value: 'dark', label: 'Dark', icon: '🌙' },
                  { value: 'midnight', label: 'Midnight', icon: '🌌' },
                  { value: 'gold', label: 'Gold', icon: '✨' },
                ].map(t => (
                  <button
                    key={t.value}
                    onClick={() => setTheme(t.value as any)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${theme === t.value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}
                  >
                    <span>{t.icon}</span> {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground block mb-3 flex items-center gap-2">
                <Globe className="w-4 h-4" /> Langue
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { value: 'fr', label: 'Français', flag: '🇫🇷' },
                  { value: 'en', label: 'English', flag: '🇬🇧' },
                  { value: 'es', label: 'Español', flag: '🇪🇸' },
                  { value: 'ht', label: 'Kreyòl', flag: '🇭🇹' },
                ].map(l => (
                  <button
                    key={l.value}
                    onClick={() => setLanguage(l.value as any)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${language === l.value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}
                  >
                    <span>{l.flag}</span> {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={handleSaveSettings}
            disabled={isPending}
            className="mt-6 flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-6 py-3 font-semibold hover:shadow-[0_0_20px_rgba(0,255,170,0.3)] transition-all disabled:opacity-60"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Sauvegarder
          </button>
        </motion.div>
      </div>
    </AppLayout>
  );
}
