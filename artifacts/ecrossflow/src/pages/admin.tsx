import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Users, DollarSign, Activity, CheckCircle, XCircle, Loader2, Search, BarChart3, ShieldAlert, LucideIcon } from 'lucide-react';
import { useGetAdminStats, useGetAdminUsers, useGetPendingDeposits, useApproveDeposit, useRejectDeposit, useActivateUser, useSuspendUser } from '@workspace/api-client-react';
import type { AdminUser, AdminDeposit } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout';
import { useQueryClient } from '@tanstack/react-query';

type AdminTab = 'overview' | 'users' | 'deposits';

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [search, setSearch] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: stats } = useGetAdminStats();
  const { data: usersData } = useGetAdminUsers({ search: search || undefined });
  const { data: depositsData } = useGetPendingDeposits();

  const { mutate: approve } = useApproveDeposit({ mutation: { onSuccess: () => queryClient.invalidateQueries() } });
  const { mutate: reject } = useRejectDeposit({ mutation: { onSuccess: () => { setRejectingId(null); queryClient.invalidateQueries(); } } });
  const { mutate: activate } = useActivateUser({ mutation: { onSuccess: () => queryClient.invalidateQueries() } });
  const { mutate: suspend } = useSuspendUser({ mutation: { onSuccess: () => queryClient.invalidateQueries() } });

  return (
    <AppLayout requireAdmin>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
          <ShieldAlert className="w-8 h-8 text-violet-400" />
          <div>
            <h1 className="text-3xl font-display font-bold">Admin Dashboard</h1>
            <p className="text-muted-foreground mt-0.5">Gestion de la plateforme Ecrossflow</p>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-2 bg-muted/30 p-1 rounded-xl w-fit">
          {([['overview', 'Vue Globale', BarChart3], ['users', 'Utilisateurs', Users], ['deposits', 'Dépôts en attente', DollarSign]] satisfies [AdminTab, string, LucideIcon][]).map(([t, label, Icon]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* Overview */}
        {tab === 'overview' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Utilisateurs', value: stats?.totalUsers, icon: Users, color: 'text-primary' },
              { label: 'Utilisateurs Actifs', value: stats?.activeUsers, icon: Activity, color: 'text-emerald-400' },
              { label: 'Dépôts en attente', value: stats?.pendingDeposits, icon: DollarSign, color: 'text-yellow-400' },
              { label: 'Boards Actifs', value: stats?.activeBoards, icon: BarChart3, color: 'text-violet-400' },
              { label: 'En attente d\'activation', value: stats?.pendingUsers, icon: Users, color: 'text-orange-400' },
              { label: 'Retraits en attente', value: stats?.pendingWithdrawals, icon: DollarSign, color: 'text-red-400' },
              { label: 'Revenus Plateforme', value: `$${(stats?.totalPlatformRevenue || 0).toFixed(2)}`, icon: DollarSign, color: 'text-emerald-400' },
            ].map(({ label, value, icon: Icon, color }) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-card/50 border border-border rounded-2xl p-5"
              >
                <Icon className={`w-5 h-5 mb-3 ${color}`} />
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-2xl font-display font-bold ${color}`}>{value ?? '—'}</p>
              </motion.div>
            ))}
          </div>
        )}

        {/* Users */}
        {tab === 'users' && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Rechercher par username ou email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              {usersData?.users?.map((u: AdminUser, idx: number) => (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.02 }}
                  className="flex items-center justify-between bg-card/40 border border-border/50 rounded-xl px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                      {u.firstName?.[0]}{u.lastName?.[0]}
                    </div>
                    <div>
                      <p className="font-medium text-sm">@{u.username} <span className="text-muted-foreground font-normal">— {u.firstName} {u.lastName}</span></p>
                      <p className="text-xs text-muted-foreground">{u.email} · Board {u.currentBoard || 'F'} · ${(u.walletBalance || 0).toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.status === 'ACTIVE' ? 'bg-primary/10 text-primary' : u.status === 'SUSPENDED' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                      {u.status}
                    </span>
                    {u.status === 'ACTIVE' ? (
                      <button
                        onClick={() => suspend({ id: u.id })}
                        className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors"
                        title="Suspendre"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => activate({ id: u.id })}
                        className="p-1.5 text-muted-foreground hover:text-primary transition-colors"
                        title="Activer"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Deposits */}
        {tab === 'deposits' && (
          <div className="space-y-3">
            {(!depositsData?.deposits || depositsData.deposits.length === 0) && (
              <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-2xl">
                <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-30 text-primary" />
                <p>Aucun dépôt en attente</p>
              </div>
            )}
            {depositsData?.deposits?.map((d: AdminDeposit, idx: number) => (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                className="bg-card/50 border border-border rounded-2xl p-5"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold">@{d.username}</p>
                    <p className="text-sm text-muted-foreground">{d.paymentMethod} · Ref: {d.reference || 'N/A'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-display font-bold text-primary">{d.amount} {d.currency}</p>
                    <p className="text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</p>
                  </div>
                </div>

                {rejectingId === d.id ? (
                  <div className="flex gap-2 mt-3">
                    <input
                      type="text"
                      placeholder="Raison du rejet..."
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/50"
                    />
                    <button
                      onClick={() => reject({ id: d.id, data: { reason: rejectReason } })}
                      className="px-4 py-2 bg-destructive text-white rounded-xl text-sm font-medium hover:bg-destructive/90"
                    >
                      Confirmer
                    </button>
                    <button onClick={() => setRejectingId(null)} className="px-4 py-2 bg-muted rounded-xl text-sm">
                      Annuler
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => approve({ id: d.id })}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:shadow-[0_0_15px_rgba(0,255,170,0.3)] transition-all"
                    >
                      <CheckCircle className="w-4 h-4" /> Approuver
                    </button>
                    <button
                      onClick={() => { setRejectingId(d.id); setRejectReason(''); }}
                      className="flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl text-sm font-medium hover:bg-destructive/20 transition-all"
                    >
                      <XCircle className="w-4 h-4" /> Rejeter
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
