import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSearch } from 'wouter';
import {
  Users, DollarSign, Activity, CheckCircle, XCircle, Loader2, Search,
  BarChart3, ShieldAlert, LucideIcon, ArrowDownLeft, ArrowUpRight, Layers,
  TrendingUp, FileText, Download, Clock, RefreshCw, Wallet, AlertTriangle, Eye
  , Trash2, CheckSquare, Square
} from 'lucide-react';
import {
  useGetAdminStats, useGetAdminUsers, useGetPendingDeposits, useApproveDeposit,
  useRejectDeposit, useActivateUser, useSuspendUser, useAdjustUserBalance,
  useGetPendingWithdrawals, useApproveWithdrawal, useRejectWithdrawal,
  useGetAdminBoards, useGetAdminReports, useGetAdminUserDetail,
} from '@workspace/api-client-react';
import type { AdminUser, AdminDeposit, AdminWithdrawal, AdminBoardInstance, AdminUserDetail, AdminReportGrowthItem } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/hooks/use-store';

type AdminTab = 'overview' | 'users' | 'deposits' | 'withdrawals' | 'boards' | 'reports';

type EvolutionConsistencyCounts = {
  activeAll: number;
  activeNonAdmin: number;
  numberedAll: number;
  numberedNonAdmin: number;
  numberedActiveNonAdmin: number;
  usersWithCurrentBoardNonAdmin: number;
  positionedLegacyNonAdmin: number;
  evolutionValidatedTotal: number;
  evolutionDisplayedGraphicalTotal: number;
};

type EvolutionConsistencyAnomaly = {
  id: string;
  username: string;
  accountNumber: number | null;
  currentBoard: string | null;
  flags: string[];
};

type EvolutionConsistencySnapshot = {
  generatedAt: string;
  counts: EvolutionConsistencyCounts;
  evolutionByBoard: Record<string, number>;
  anomalies: EvolutionConsistencyAnomaly[];
};

type PlatformResetStatus = {
  hasPin: boolean;
  pinConfiguredAt: string | null;
};

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number | undefined; icon: LucideIcon; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
      className="bg-card/50 border border-border rounded-2xl p-5"
    >
      <Icon className={`w-5 h-5 mb-3 ${color}`} />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-display font-bold ${color}`}>{value ?? '—'}</p>
    </motion.div>
  );
}

function AdjustBalanceModal({ userId, username, onClose }: { userId: string; username: string; onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const queryClient = useQueryClient();
  const { mutate: adjust, isPending } = useAdjustUserBalance({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries();
        onClose();
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;
    const parsed = parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed === 0) return;
    adjust({ id: userId, data: { amount: parsed, note: note.trim() || 'Admin recharge/adjustment' } });
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl"
      >
        <h3 className="text-lg font-display font-bold mb-1">Recharger / Ajuster le solde</h3>
        <p className="text-sm text-muted-foreground mb-5">@{username}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Montant (USD) — négatif pour débiter</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="ex: 50 ou -20"
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              required
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {['5', '10', '20', '50', '100'].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(v)}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs hover:border-primary/40"
                >
                  +${v}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Note (optionnel)</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Raison de l'ajustement (optionnel)"
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending || !amount}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:shadow-[0_0_15px_rgba(0,255,170,0.3)] transition-all disabled:opacity-50"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
              Confirmer
            </button>
            <button type="button" onClick={onClose} className="px-4 py-3 bg-muted rounded-xl text-sm">
              Annuler
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function CreateUserModal({
  token,
  onClose,
  onCreated,
}: {
  token: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [initialBalance, setInitialBalance] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/admin/users/create`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName,
          lastName,
          username,
          email,
          phone: phone || undefined,
          password,
          referralCode: referralCode || undefined,
          initialBalance: Number.parseFloat(initialBalance || '0'),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || 'Creation failed');
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-xl shadow-2xl"
      >
        <h3 className="text-lg font-display font-bold mb-1">Ajouter un utilisateur</h3>
        <p className="text-sm text-muted-foreground mb-4">Création rapide + recharge initiale optionnelle.</p>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Prénom" className="bg-background border border-border rounded-xl px-3 py-2.5 text-sm" required />
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Nom" className="bg-background border border-border rounded-xl px-3 py-2.5 text-sm" required />
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className="bg-background border border-border rounded-xl px-3 py-2.5 text-sm" required />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="bg-background border border-border rounded-xl px-3 py-2.5 text-sm" required />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Téléphone (optionnel)" className="bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe (min 8)" className="bg-background border border-border rounded-xl px-3 py-2.5 text-sm" minLength={8} required />
            <input value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())} placeholder="Code parrain (optionnel)" className="bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
            <input type="number" step="0.01" min="0" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} placeholder="Recharge initiale (USD)" className="bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
          </div>
          {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-muted rounded-xl text-sm">Annuler</button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Créer le compte
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export default function AdminPage() {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const tabParam = params.get('tab') as AdminTab | null;
  const validTabs: AdminTab[] = ['overview', 'users', 'deposits', 'withdrawals', 'boards', 'reports'];
  const initialTab: AdminTab = tabParam && validTabs.includes(tabParam) ? tabParam : 'overview';
  const [tab, setTab] = useState<AdminTab>(initialTab);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectType, setRejectType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [adjustingUser, setAdjustingUser] = useState<{ id: string; username: string } | null>(null);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [reportPeriod, setReportPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectAllFiltered, setSelectAllFiltered] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [consistency, setConsistency] = useState<EvolutionConsistencySnapshot | null>(null);
  const [consistencyLoading, setConsistencyLoading] = useState(false);
  const [consistencyRepairing, setConsistencyRepairing] = useState(false);
  const [consistencyRepairMessage, setConsistencyRepairMessage] = useState('');
  const [platformResetStatus, setPlatformResetStatus] = useState<PlatformResetStatus | null>(null);
  const [platformResetLoading, setPlatformResetLoading] = useState(false);
  const [platformResetPin, setPlatformResetPin] = useState('');
  const [platformResetConfirmPin, setPlatformResetConfirmPin] = useState('');
  const [platformResetCurrentPin, setPlatformResetCurrentPin] = useState('');
  const [platformResetExecutePin, setPlatformResetExecutePin] = useState('');
  const [platformResetPinBusy, setPlatformResetPinBusy] = useState(false);
  const [platformResetBusy, setPlatformResetBusy] = useState(false);
  const [platformResetMessage, setPlatformResetMessage] = useState('');
  const queryClient = useQueryClient();
  const { token } = useAppStore();

  useEffect(() => {
    const newTab: AdminTab = tabParam && validTabs.includes(tabParam) ? tabParam : 'overview';
    setTab(newTab);
  }, [tabParam]);

  const { data: stats } = useGetAdminStats();
  const { data: usersData } = useGetAdminUsers({
    search: search || undefined,
    status: statusFilter || undefined,
  });
  const { data: depositsData } = useGetPendingDeposits();
  const { data: withdrawalsData } = useGetPendingWithdrawals();
  const { data: boardsData } = useGetAdminBoards();
  const { data: reportsData } = useGetAdminReports({ period: reportPeriod });
  const { data: userDetail } = useGetAdminUserDetail(selectedUserId ?? '', {
    query: { enabled: Boolean(selectedUserId) },
  });

  const { mutate: approve } = useApproveDeposit({ mutation: { onSuccess: () => queryClient.invalidateQueries() } });
  const { mutate: reject } = useRejectDeposit({ mutation: { onSuccess: () => { setRejectingId(null); queryClient.invalidateQueries(); } } });
  const { mutate: approveW } = useApproveWithdrawal({ mutation: { onSuccess: () => queryClient.invalidateQueries() } });
  const { mutate: rejectW } = useRejectWithdrawal({ mutation: { onSuccess: () => { setRejectingId(null); queryClient.invalidateQueries(); } } });
  const { mutate: activate } = useActivateUser({ mutation: { onSuccess: () => queryClient.invalidateQueries() } });
  const { mutate: suspend } = useSuspendUser({ mutation: { onSuccess: () => queryClient.invalidateQueries() } });

  const visibleUserIds = (usersData?.users || []).map((u: AdminUser) => u.id);
  const allVisibleSelected = visibleUserIds.length > 0 && visibleUserIds.every((id: string) => selectedUserIds.includes(id));

  const toggleSelectOne = (id: string) => {
    setSelectAllFiltered(false);
    setSelectedUserIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const toggleSelectVisible = () => {
    setSelectAllFiltered(false);
    if (allVisibleSelected) {
      setSelectedUserIds((prev) => prev.filter((id) => !visibleUserIds.includes(id)));
      return;
    }
    setSelectedUserIds((prev) => Array.from(new Set([...prev, ...visibleUserIds])));
  };

  const runBulkUsersAction = async (action: 'activate' | 'suspend' | 'delete') => {
    if (!token) return;
    if (!selectAllFiltered && selectedUserIds.length === 0) return;
    if (action === 'delete' && !window.confirm('Supprimer définitivement les comptes sélectionnés ?')) return;
    setBulkBusy(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/admin/users/bulk-action`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          userIds: selectAllFiltered ? 'all' : selectedUserIds,
          search: search || undefined,
          status: statusFilter || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || 'Bulk action failed');
      }
      setSelectedUserIds([]);
      setSelectAllFiltered(false);
      queryClient.invalidateQueries();
    } catch (e) {
      console.error(e);
      alert('Action échouée. Vérifiez les logs backend.');
    } finally {
      setBulkBusy(false);
    }
  };

  const deleteOneUser = async (userId: string, username: string) => {
    if (!token) return;
    if (!window.confirm(`Supprimer définitivement @${username} ?`)) return;
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || 'Delete failed');
      }
      setSelectedUserIds((prev) => prev.filter((id) => id !== userId));
      queryClient.invalidateQueries();
    } catch (e) {
      console.error(e);
      alert('Suppression échouée. Vérifiez les logs backend.');
    }
  };

  const runQueueSync = async () => {
    if (!token) return;
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/admin/evolution/queue/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || 'Sync failed');
      queryClient.invalidateQueries();
      alert(`Queue sync OK. Nouveaux numéros attribués: ${payload?.assigned ?? 0}`);
    } catch (e) {
      console.error(e);
      alert('Sync queue échoué. Vérifiez les logs backend.');
    }
  };

  const loadConsistency = async () => {
    if (!token) return;
    setConsistencyLoading(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/admin/evolution/consistency`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || 'Consistency audit failed');
      setConsistency(payload as EvolutionConsistencySnapshot);
    } catch (e) {
      console.error(e);
      alert('Audit de cohérence échoué. Vérifiez les logs backend.');
    } finally {
      setConsistencyLoading(false);
    }
  };

  const runAutoConsistencyRepair = async () => {
    if (!token) return;
    setConsistencyRepairing(true);
    setConsistencyRepairMessage('');
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/admin/evolution/consistency/repair`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || 'Auto repair failed');
      const actions = payload?.actions || {};
      setConsistencyRepairMessage(
        `Auto-fix OK · Numéros: ${actions.assignedQueueNumbers ?? 0} · Boards normalisés: ${actions.normalizedBoards ?? 0} · Boards nettoyés: ${actions.clearedStaleBoards ?? 0} · Promotions: ${actions.promotedUsers ?? 0}`
      );
      queryClient.invalidateQueries();
      await loadConsistency();
    } catch (e) {
      console.error(e);
      alert('Correction automatique échouée. Vérifiez les logs backend.');
    } finally {
      setConsistencyRepairing(false);
    }
  };

  const loadPlatformResetStatus = async () => {
    if (!token) return;
    setPlatformResetLoading(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/admin/platform-reset/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || 'Platform reset status failed');
      setPlatformResetStatus({
        hasPin: Boolean(payload?.hasPin),
        pinConfiguredAt: payload?.pinConfiguredAt ? String(payload.pinConfiguredAt) : null,
      });
    } catch (e) {
      console.error(e);
      alert('Impossible de charger le statut du PIN de réinitialisation.');
    } finally {
      setPlatformResetLoading(false);
    }
  };

  const savePlatformResetPin = async () => {
    if (!token) return;
    if (!/^\d{4}$/.test(platformResetPin)) {
      alert('Le PIN doit contenir exactement 4 chiffres.');
      return;
    }
    if (platformResetPin !== platformResetConfirmPin) {
      alert('La confirmation PIN ne correspond pas.');
      return;
    }

    setPlatformResetPinBusy(true);
    setPlatformResetMessage('');
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/admin/platform-reset/pin`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pin: platformResetPin,
          confirmPin: platformResetConfirmPin,
          currentPin: platformResetStatus?.hasPin ? platformResetCurrentPin : undefined,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || 'PIN configuration failed');
      setPlatformResetPin('');
      setPlatformResetConfirmPin('');
      setPlatformResetCurrentPin('');
      setPlatformResetMessage('PIN de réinitialisation enregistré.');
      await loadPlatformResetStatus();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Configuration PIN échouée.');
    } finally {
      setPlatformResetPinBusy(false);
    }
  };

  const executePlatformHardReset = async () => {
    if (!token) return;
    if (!/^\d{4}$/.test(platformResetExecutePin)) {
      alert('Entrez le PIN à 4 chiffres pour confirmer la réinitialisation.');
      return;
    }
    if (!window.confirm('Réinitialiser entièrement la base ? Cette action supprimera toutes les données sauf admin et ceo.')) {
      return;
    }

    setPlatformResetBusy(true);
    setPlatformResetMessage('');
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/admin/platform-reset/execute`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pin: platformResetExecutePin }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || 'Platform reset failed');
      setPlatformResetExecutePin('');
      setPlatformResetMessage('Réinitialisation terminée. Définissez un nouveau PIN pour les prochains resets.');
      queryClient.invalidateQueries();
      await loadConsistency();
      await loadPlatformResetStatus();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Réinitialisation échouée.');
    } finally {
      setPlatformResetBusy(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    if (tab !== 'overview') return;
    loadConsistency();
    loadPlatformResetStatus();
  }, [token, tab]);

  const tabs: [AdminTab, string, LucideIcon][] = [
    ['overview', 'Vue Globale', BarChart3],
    ['users', 'Utilisateurs', Users],
    ['deposits', 'Dépôts', ArrowDownLeft],
    ['withdrawals', 'Retraits', ArrowUpRight],
    ['boards', 'Boards', Layers],
    ['reports', 'Rapports', FileText],
  ];

  const handleRejectDeposit = (d: AdminDeposit) => {
    setRejectingId(d.id);
    setRejectReason('');
    setRejectType('deposit');
  };

  const handleRejectWithdrawal = (w: AdminWithdrawal) => {
    setRejectingId(w.id);
    setRejectReason('');
    setRejectType('withdrawal');
  };

  const confirmReject = () => {
    if (!rejectingId || !rejectReason) return;
    if (rejectType === 'deposit') {
      reject({ id: rejectingId, data: { reason: rejectReason } });
    } else {
      rejectW({ id: rejectingId, data: { reason: rejectReason } });
    }
  };

  const exportCSV = () => {
    if (!reportsData) return;
    const rows = [
      ['Métrique', 'Valeur'],
      ['Revenus Plateforme', reportsData.totalRevenue.toFixed(2)],
      ['Total Dépôts', reportsData.totalDeposits.toFixed(2)],
      ['Total Retraits', reportsData.totalWithdrawals.toFixed(2)],
      ['Nouveaux Utilisateurs', reportsData.newUsers],
      ['Boards Complétés', reportsData.completedBoards],
      ['', ''],
      ['Board', 'Collecté', 'Instances Complétées', 'Instances Actives'],
      ...(reportsData.boardRevenue || []).map(b => [b.boardId, b.totalCollected.toFixed(2), b.completedInstances, b.activeInstances]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecrossflow-rapport-${reportPeriod}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    if (!reportsData) return;
    const date = new Date().toLocaleDateString('fr-FR');
    const periodLabel: Record<string, string> = { '7d': '7 derniers jours', '30d': '30 derniers jours', '90d': '90 derniers jours', 'all': 'Toute la période' };
    const boardRows = (reportsData.boardRevenue || []).map(b =>
      `<tr><td>${b.boardId}</td><td>$${b.totalCollected.toFixed(2)}</td><td>${b.completedInstances}</td><td>${b.activeInstances}</td></tr>`
    ).join('');
    const growthRows = (reportsData.userGrowth || []).map((g: AdminReportGrowthItem) =>
      `<tr><td>${g.date}</td><td>${g.newUsers}</td><td>${g.activeUsers}</td></tr>`
    ).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Rapport Ecrossflow – ${date}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#111;padding:32px;max-width:800px;margin:0 auto}
        .brand-header{display:flex;align-items:center;gap:14px;margin-bottom:20px;padding-bottom:16px;border-bottom:3px solid #10b981}
        .brand-logo{width:44px;height:44px;border-radius:10px;background:linear-gradient(135deg,#10b981,#059669);display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;font-weight:800;flex-shrink:0}
        .brand-name{font-size:26px;font-weight:800;color:#059669;letter-spacing:-0.5px}
        .brand-tagline{font-size:11px;color:#888;margin-top:2px}
        h1{font-size:18px;margin-bottom:4px;color:#333}h2{font-size:16px;margin:24px 0 8px;color:#555}
        .kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}
        .kpi-item{border:1px solid #ddd;border-radius:8px;padding:12px}
        .kpi-item span{display:block;font-size:11px;color:#888;margin-bottom:4px}
        .kpi-item strong{font-size:20px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{background:#f0fdf4;padding:8px;text-align:left;border-bottom:2px solid #10b981;color:#065f46}
        td{padding:8px;border-bottom:1px solid #eee}
        footer{margin-top:32px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:12px}
      </style></head><body>
      <div class="brand-header">
        <div class="brand-logo">E</div>
        <div><div class="brand-name">Ecrossflow</div><div class="brand-tagline">Plateforme de donation pyramidale</div></div>
      </div>
      <h1>Rapport Administratif</h1>
      <p>Période : ${periodLabel[reportPeriod] || reportPeriod} &nbsp;|&nbsp; Généré le ${date}</p>
      <div class="kpi">
        <div class="kpi-item"><span>Revenus Plateforme</span><strong>$${reportsData.totalRevenue.toFixed(2)}</strong></div>
        <div class="kpi-item"><span>Total Dépôts</span><strong>$${reportsData.totalDeposits.toFixed(2)}</strong></div>
        <div class="kpi-item"><span>Total Retraits</span><strong>$${reportsData.totalWithdrawals.toFixed(2)}</strong></div>
        <div class="kpi-item"><span>Boards Complétés</span><strong>${reportsData.completedBoards}</strong></div>
      </div>
      <h2>Revenus par Board</h2>
      <table><thead><tr><th>Board</th><th>Collecté</th><th>Instances Complétées</th><th>Instances Actives</th></tr></thead>
      <tbody>${boardRows || '<tr><td colspan="4">Aucune donnée</td></tr>'}</tbody></table>
      ${growthRows ? `<h2>Croissance Utilisateurs</h2><table><thead><tr><th>Date</th><th>Nouveaux</th><th>Actifs</th></tr></thead><tbody>${growthRows}</tbody></table>` : ''}
      <footer>Ecrossflow Admin Report &copy; ${new Date().getFullYear()}</footer>
      <script>window.onload=()=>window.print()</script>
      </body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

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

        {/* Alerts */}
        {(() => {
          const overdueDeposits = depositsData?.overdueCount ?? 0;
          const overdueWithdrawals = withdrawalsData?.overdueCount ?? 0;
          const pendingD = stats?.pendingDeposits ?? 0;
          const pendingW = stats?.pendingWithdrawals ?? 0;
          const hasAlerts = pendingD > 0 || pendingW > 0 || overdueDeposits > 0 || overdueWithdrawals > 0;
          if (!hasAlerts) return null;
          return (
            <div className="flex flex-wrap gap-2">
              {overdueDeposits > 0 && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/40 text-red-400 px-4 py-2 rounded-xl text-sm font-medium">
                  <AlertTriangle className="w-4 h-4" />
                  {overdueDeposits} dépôt(s) en attente depuis +24h — action urgente requise
                </div>
              )}
              {overdueWithdrawals > 0 && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/40 text-red-400 px-4 py-2 rounded-xl text-sm font-medium">
                  <AlertTriangle className="w-4 h-4" />
                  {overdueWithdrawals} retrait(s) en attente depuis +24h — action urgente requise
                </div>
              )}
              {pendingD > 0 && overdueDeposits === 0 && (
                <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 px-4 py-2 rounded-xl text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  {pendingD} dépôt(s) en attente de validation
                </div>
              )}
              {pendingW > 0 && overdueWithdrawals === 0 && (
                <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 text-orange-400 px-4 py-2 rounded-xl text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  {pendingW} retrait(s) en attente
                </div>
              )}
            </div>
          );
        })()}

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 bg-muted/30 p-1 rounded-xl">
          {tabs.map(([t, label, Icon]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${tab === t ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Utilisateurs" value={stats?.totalUsers} icon={Users} color="text-primary" />
              <StatCard label="Utilisateurs Actifs" value={stats?.activeUsers} icon={Activity} color="text-emerald-400" />
              <StatCard label="En attente d'activation" value={stats?.pendingUsers} icon={Clock} color="text-orange-400" />
              <StatCard label="Boards Actifs" value={stats?.activeBoards} icon={Layers} color="text-violet-400" />
              <StatCard label="Dépôts en attente" value={stats?.pendingDeposits} icon={ArrowDownLeft} color="text-yellow-400" />
              <StatCard label="Retraits en attente" value={stats?.pendingWithdrawals} icon={ArrowUpRight} color="text-red-400" />
              <StatCard label="Revenus Plateforme" value={`$${(stats?.totalPlatformRevenue || 0).toFixed(2)}`} icon={DollarSign} color="text-emerald-400" />
              <StatCard label="Volume 7j" value={`$${(stats?.totalVolume7d || 0).toFixed(2)}`} icon={TrendingUp} color="text-blue-400" />
            </div>

            <div className="rounded-2xl border border-border bg-card/40 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-display font-semibold">Cohérence numérotation / board / evolution</h3>
                  <p className="text-xs text-muted-foreground">Stats d’audit détaillées + correction auto en un clic.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={loadConsistency}
                    disabled={consistencyLoading}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:border-primary/40 disabled:opacity-60"
                  >
                    {consistencyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Actualiser
                  </button>
                  <button
                    onClick={runAutoConsistencyRepair}
                    disabled={consistencyRepairing}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {consistencyRepairing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    Correction auto
                  </button>
                </div>
              </div>

              {consistencyRepairMessage && (
                <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
                  {consistencyRepairMessage}
                </div>
              )}

              {!consistency ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                  {consistencyLoading ? 'Chargement de l’audit...' : 'Aucune donnée d’audit chargée.'}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-border bg-background/40 px-3 py-2"><p className="text-[11px] text-muted-foreground">Actifs (hors admin)</p><p className="text-lg font-semibold">{consistency.counts.activeNonAdmin}</p></div>
                    <div className="rounded-xl border border-border bg-background/40 px-3 py-2"><p className="text-[11px] text-muted-foreground">Numérotés (hors admin)</p><p className="text-lg font-semibold">{consistency.counts.numberedNonAdmin}</p></div>
                    <div className="rounded-xl border border-border bg-background/40 px-3 py-2"><p className="text-[11px] text-muted-foreground">Positionnés board (legacy)</p><p className="text-lg font-semibold">{consistency.counts.positionedLegacyNonAdmin}</p></div>
                    <div className="rounded-xl border border-border bg-background/40 px-3 py-2"><p className="text-[11px] text-muted-foreground">Affichés Evolution</p><p className="text-lg font-semibold">{consistency.counts.evolutionDisplayedGraphicalTotal}</p></div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border bg-background/30 p-3">
                      <p className="text-xs text-muted-foreground mb-2">Répartition Evolution par niveau</p>
                      <div className="grid grid-cols-4 gap-2">
                        {Object.entries(consistency.evolutionByBoard).map(([board, c]) => (
                          <div key={board} className="rounded-lg border border-border px-2 py-1.5 text-center">
                            <p className="text-[10px] text-muted-foreground">Board {board}</p>
                            <p className="text-sm font-semibold">{c}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-background/30 p-3">
                      <p className="text-xs text-muted-foreground mb-2">
                        Anomalies détectées ({consistency.anomalies.length})
                      </p>
                      <div className="max-h-40 overflow-auto space-y-1">
                        {consistency.anomalies.length === 0 && (
                          <p className="text-xs text-primary">Aucune incohérence détectée.</p>
                        )}
                        {consistency.anomalies.slice(0, 20).map((a) => (
                          <div key={a.id} className="rounded-lg border border-border px-2 py-1.5 text-xs">
                            <span className="font-medium">@{a.username}</span> · #{a.accountNumber ?? '—'} · Board {a.currentBoard ?? '—'}
                            <p className="text-muted-foreground">{a.flags.join(', ')}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-display font-semibold text-red-300">Réinitialisation plateforme</h3>
                  <p className="text-xs text-muted-foreground">
                    Supprime toutes les données opérationnelles et conserve uniquement les comptes <span className="font-medium">admin</span> et <span className="font-medium">ceo</span>.
                  </p>
                </div>
                <button
                  onClick={loadPlatformResetStatus}
                  disabled={platformResetLoading}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:border-primary/40 disabled:opacity-60"
                >
                  {platformResetLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Statut PIN
                </button>
              </div>

              <div className="rounded-xl border border-border bg-background/30 p-3 text-xs">
                <p>
                  PIN configuré: <span className={platformResetStatus?.hasPin ? 'text-emerald-400 font-medium' : 'text-yellow-300 font-medium'}>
                    {platformResetStatus?.hasPin ? 'Oui' : 'Non'}
                  </span>
                </p>
                {platformResetStatus?.pinConfiguredAt && (
                  <p className="text-muted-foreground mt-1">
                    Dernière définition: {new Date(platformResetStatus.pinConfiguredAt).toLocaleString('fr-FR')}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-background/30 p-3 space-y-2">
                  <p className="text-xs font-medium">Définir / changer PIN (4 chiffres)</p>
                  {platformResetStatus?.hasPin && (
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={platformResetCurrentPin}
                      onChange={(e) => setPlatformResetCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="PIN actuel"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    />
                  )}
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={platformResetPin}
                    onChange={(e) => setPlatformResetPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="Nouveau PIN (4 chiffres)"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={platformResetConfirmPin}
                    onChange={(e) => setPlatformResetConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="Confirmer le PIN"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    onClick={savePlatformResetPin}
                    disabled={platformResetPinBusy}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {platformResetPinBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    Enregistrer PIN
                  </button>
                </div>

                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 space-y-2">
                  <p className="text-xs font-medium text-red-200">Exécuter la réinitialisation complète</p>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={platformResetExecutePin}
                    onChange={(e) => setPlatformResetExecutePin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="PIN de confirmation"
                    className="w-full bg-background border border-red-400/40 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    onClick={executePlatformHardReset}
                    disabled={platformResetBusy || !platformResetStatus?.hasPin}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
                  >
                    {platformResetBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                    Réinitialiser la base
                  </button>
                  {!platformResetStatus?.hasPin && (
                    <p className="text-[11px] text-yellow-300">Définissez d’abord le PIN de réinitialisation.</p>
                  )}
                </div>
              </div>

              {platformResetMessage && (
                <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
                  {platformResetMessage}
                </div>
              )}
            </div>
          </div>
        )}

        {/* USERS TAB */}
        {tab === 'users' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Rechercher par username ou email..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-card border border-border rounded-xl px-3 py-2 text-sm focus:outline-none"
              >
                <option value="">Tous statuts</option>
                <option value="PENDING">En attente</option>
                <option value="ACTIVE">Actif</option>
                <option value="SUSPENDED">Suspendu</option>
              </select>
              <button
                onClick={() => setCreateUserOpen(true)}
                className="px-3 py-2 rounded-xl border border-primary/40 bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition"
              >
                + Ajouter compte
              </button>
              <button
                onClick={runQueueSync}
                className="px-3 py-2 rounded-xl border border-border bg-card text-sm font-medium hover:border-primary/40 transition"
              >
                Sync numéros
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/30 px-3 py-2">
              <button
                onClick={toggleSelectVisible}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs hover:border-primary/40"
              >
                {allVisibleSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                Sélectionner la page
              </button>
              <button
                onClick={() => { setSelectAllFiltered(true); setSelectedUserIds([]); }}
                className={`rounded-lg border px-3 py-1.5 text-xs ${selectAllFiltered ? 'border-primary text-primary' : 'border-border hover:border-primary/40'}`}
              >
                Sélectionner tous (filtre)
              </button>
              <span className="text-xs text-muted-foreground">
                {selectAllFiltered ? `Tous les résultats filtrés (${usersData?.total ?? 0})` : `${selectedUserIds.length} sélectionné(s)`}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => runBulkUsersAction('activate')}
                  disabled={bulkBusy || (!selectAllFiltered && selectedUserIds.length === 0)}
                  className="rounded-lg bg-primary/15 text-primary px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  Activer
                </button>
                <button
                  onClick={() => runBulkUsersAction('suspend')}
                  disabled={bulkBusy || (!selectAllFiltered && selectedUserIds.length === 0)}
                  className="rounded-lg bg-yellow-500/15 text-yellow-400 px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  Suspendre
                </button>
                <button
                  onClick={() => runBulkUsersAction('delete')}
                  disabled={bulkBusy || (!selectAllFiltered && selectedUserIds.length === 0)}
                  className="rounded-lg bg-red-500/15 text-red-400 px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  Supprimer
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {usersData?.users?.map((u: AdminUser, idx: number) => (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.02 }}
                  className="flex items-center justify-between bg-card/40 border border-border/50 rounded-xl px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectAllFiltered ? true : selectedUserIds.includes(u.id)}
                      onChange={() => toggleSelectOne(u.id)}
                      className="h-4 w-4 accent-primary"
                    />
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                      {u.firstName?.[0]}{u.lastName?.[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">@{u.username} <span className="text-muted-foreground font-normal">— {u.firstName} {u.lastName}</span></p>
                      <p className="text-xs text-muted-foreground truncate">{u.email} · Board {u.currentBoard || 'F'} · <span className="text-primary font-medium">${(u.walletBalance || 0).toFixed(2)}</span></p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.status === 'ACTIVE' ? 'bg-primary/10 text-primary' : u.status === 'SUSPENDED' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                      {u.status}
                    </span>
                    <button
                      onClick={() => setSelectedUserId(u.id)}
                      className="p-1.5 text-muted-foreground hover:text-violet-400 transition-colors"
                      title="Voir le profil"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setAdjustingUser({ id: u.id, username: u.username })}
                      className="p-1.5 text-muted-foreground hover:text-blue-400 transition-colors"
                      title="Ajuster solde"
                    >
                      <Wallet className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteOneUser(u.id, u.username)}
                      className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors"
                      title="Supprimer définitivement"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
            {usersData && (
              <p className="text-xs text-muted-foreground text-center">
                {usersData.total} utilisateur(s) · Page {usersData.page}/{usersData.totalPages}
              </p>
            )}
          </div>
        )}

        {/* DEPOSITS TAB */}
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
                className={`bg-card/50 border rounded-2xl p-5 ${d.overdue ? 'border-red-500/50' : 'border-border'}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">@{d.username}</p>
                      {d.overdue && (
                        <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3" /> +24h
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{d.paymentMethod} · Ref: {d.reference || 'N/A'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-display font-bold text-primary">{d.amount} {d.currency}</p>
                    <p className="text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</p>
                  </div>
                </div>

                {d.screenshotUrl && (
                  <div className="mb-3">
                    <a href={d.screenshotUrl} target="_blank" rel="noopener noreferrer">
                      <img src={d.screenshotUrl} alt="Screenshot" className="max-h-40 rounded-xl border border-border object-contain" />
                    </a>
                  </div>
                )}

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
                      onClick={confirmReject}
                      disabled={!rejectReason}
                      className="px-4 py-2 bg-destructive text-white rounded-xl text-sm font-medium hover:bg-destructive/90 disabled:opacity-50"
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
                      onClick={() => handleRejectDeposit(d)}
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

        {/* WITHDRAWALS TAB */}
        {tab === 'withdrawals' && (
          <div className="space-y-3">
            {(!withdrawalsData?.withdrawals || withdrawalsData.withdrawals.length === 0) && (
              <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-2xl">
                <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-30 text-primary" />
                <p>Aucun retrait en attente</p>
              </div>
            )}
            {withdrawalsData?.withdrawals?.map((w: AdminWithdrawal, idx: number) => (
              <motion.div
                key={w.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                className={`bg-card/50 border rounded-2xl p-5 ${w.overdue ? 'border-red-500/50' : 'border-border'}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">@{w.username}</p>
                      {w.overdue && (
                        <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3" /> +24h
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{w.paymentMethod}</p>
                    {w.destination && (
                      <p className="text-xs text-muted-foreground mt-0.5">Destination: {w.destination}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-display font-bold text-red-400">{w.amount} {w.currency}</p>
                    <p className="text-xs text-muted-foreground">{new Date(w.createdAt).toLocaleString()}</p>
                  </div>
                </div>

                {rejectingId === w.id ? (
                  <div className="flex gap-2 mt-3">
                    <input
                      type="text"
                      placeholder="Raison du rejet..."
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/50"
                    />
                    <button
                      onClick={confirmReject}
                      disabled={!rejectReason}
                      className="px-4 py-2 bg-destructive text-white rounded-xl text-sm font-medium hover:bg-destructive/90 disabled:opacity-50"
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
                      onClick={() => approveW({ id: w.id })}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:shadow-[0_0_15px_rgba(0,255,170,0.3)] transition-all"
                    >
                      <CheckCircle className="w-4 h-4" /> Approuver
                    </button>
                    <button
                      onClick={() => handleRejectWithdrawal(w)}
                      className="flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl text-sm font-medium hover:bg-destructive/20 transition-all"
                    >
                      <XCircle className="w-4 h-4" /> Rejeter & Rembourser
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}

        {/* BOARDS TAB */}
        {tab === 'boards' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{boardsData?.total ?? 0} instance(s)</p>
              <button
                onClick={() => queryClient.invalidateQueries()}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Actualiser
              </button>
            </div>
            {(!boardsData?.instances || boardsData.instances.length === 0) && (
              <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-2xl">
                <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>Aucune instance de board</p>
              </div>
            )}
            {boardsData?.instances?.map((inst: AdminBoardInstance, idx: number) => (
              <motion.div
                key={inst.id}
                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.02 }}
                className="flex items-center justify-between bg-card/40 border border-border/50 rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-display font-bold ${inst.status === 'ACTIVE' ? 'bg-primary/10 text-primary' : inst.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                    {inst.boardId}
                  </div>
                  <div>
                    <p className="font-medium text-sm">Board {inst.boardId} · Instance #{inst.instanceNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {inst.slotsFilled} slots · ${inst.totalCollected.toFixed(2)} collecté
                      {inst.rankerUsername && ` · Ranker: @${inst.rankerUsername}`}
                    </p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${inst.status === 'ACTIVE' ? 'bg-primary/10 text-primary' : inst.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                  {inst.status}
                </span>
              </motion.div>
            ))}
          </div>
        )}

        {/* REPORTS TAB */}
        {tab === 'reports' && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex gap-1 bg-muted/30 p-1 rounded-xl">
                {(['7d', '30d', '90d', 'all'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setReportPeriod(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${reportPeriod === p ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {p === 'all' ? 'Tout' : p}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={exportCSV}
                  className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-xl text-sm hover:border-primary/50 transition-all"
                >
                  <Download className="w-4 h-4" /> Exporter CSV
                </button>
                <button
                  onClick={exportPDF}
                  className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-xl text-sm hover:border-primary/50 transition-all"
                >
                  <FileText className="w-4 h-4" /> Exporter PDF
                </button>
              </div>
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-card/50 border border-border rounded-2xl p-5">
                <DollarSign className="w-5 h-5 mb-2 text-emerald-400" />
                <p className="text-xs text-muted-foreground">Revenus Plateforme</p>
                <p className="text-2xl font-display font-bold text-emerald-400">${(reportsData?.totalRevenue || 0).toFixed(2)}</p>
              </div>
              <div className="bg-card/50 border border-border rounded-2xl p-5">
                <ArrowDownLeft className="w-5 h-5 mb-2 text-blue-400" />
                <p className="text-xs text-muted-foreground">Total Dépôts</p>
                <p className="text-2xl font-display font-bold text-blue-400">${(reportsData?.totalDeposits || 0).toFixed(2)}</p>
              </div>
              <div className="bg-card/50 border border-border rounded-2xl p-5">
                <ArrowUpRight className="w-5 h-5 mb-2 text-orange-400" />
                <p className="text-xs text-muted-foreground">Total Retraits</p>
                <p className="text-2xl font-display font-bold text-orange-400">${(reportsData?.totalWithdrawals || 0).toFixed(2)}</p>
              </div>
              <div className="bg-card/50 border border-border rounded-2xl p-5">
                <Users className="w-5 h-5 mb-2 text-violet-400" />
                <p className="text-xs text-muted-foreground">Nouveaux Utilisateurs</p>
                <p className="text-2xl font-display font-bold text-violet-400">{reportsData?.newUsers ?? 0}</p>
              </div>
              <div className="bg-card/50 border border-border rounded-2xl p-5">
                <CheckCircle className="w-5 h-5 mb-2 text-primary" />
                <p className="text-xs text-muted-foreground">Boards Complétés</p>
                <p className="text-2xl font-display font-bold text-primary">{reportsData?.completedBoards ?? 0}</p>
              </div>
            </div>

            {/* Board Revenue Breakdown */}
            <div className="bg-card/50 border border-border rounded-2xl p-5">
              <h3 className="font-semibold mb-4">Distribution par Board</h3>
              <div className="space-y-3">
                {reportsData?.boardRevenue?.map(b => (
                  <div key={b.boardId} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                      {b.boardId}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span>Board {b.boardId}</span>
                        <span className="font-medium">${b.totalCollected.toFixed(2)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, (b.totalCollected / Math.max(...(reportsData.boardRevenue || []).map(x => x.totalCollected), 1)) * 100)}%`
                          }}
                        />
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                        <span>{b.completedInstances} complétées</span>
                        <span>{b.activeInstances} actives</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* User Growth Chart (simple bars) */}
            <div className="bg-card/50 border border-border rounded-2xl p-5">
              <h3 className="font-semibold mb-4">Croissance Utilisateurs (derniers {Math.min(7, reportsData?.userGrowth?.length ?? 7)} jours affichés)</h3>
              <div className="flex items-end gap-1 h-24">
                {(reportsData?.userGrowth || []).slice(-14).map((g, i) => {
                  const maxVal = Math.max(...(reportsData?.userGrowth || []).map(x => x.newUsers), 1);
                  const height = Math.max(4, (g.newUsers / maxVal) * 96);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-card border border-border text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                        {g.newUsers} new · {g.date}
                      </div>
                      <div
                        className="w-full bg-primary/60 hover:bg-primary rounded-sm transition-all"
                        style={{ height: `${height}px` }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Adjust Balance Modal */}
      {adjustingUser && (
        <AdjustBalanceModal
          userId={adjustingUser.id}
          username={adjustingUser.username}
          onClose={() => setAdjustingUser(null)}
        />
      )}

      {createUserOpen && (
        <CreateUserModal
          token={token}
          onClose={() => setCreateUserOpen(false)}
          onCreated={() => queryClient.invalidateQueries()}
        />
      )}

      {/* User Detail Modal */}
      {selectedUserId && userDetail && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedUserId(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-xl font-display font-bold">@{userDetail.username}</h3>
                <p className="text-sm text-muted-foreground">{userDetail.email} · {userDetail.firstName} {userDetail.lastName}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${userDetail.status === 'ACTIVE' ? 'bg-primary/10 text-primary' : userDetail.status === 'SUSPENDED' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                  {userDetail.status}
                </span>
                <button onClick={() => setSelectedUserId(null)} className="p-1.5 text-muted-foreground hover:text-foreground">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-background rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground">Solde Wallet</p>
                <p className="font-bold text-primary">${userDetail.walletBalance.toFixed(2)}</p>
              </div>
              <div className="bg-background rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground">Parrainages</p>
                <p className="font-bold">{userDetail.totalReferrals}</p>
              </div>
              <div className="bg-background rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground">Board actuel</p>
                <p className="font-bold text-sm">{userDetail.currentBoard || '—'}</p>
              </div>
            </div>

            {userDetail.boardParticipations.length > 0 && (
              <div className="mb-5">
                <h4 className="text-sm font-semibold mb-2">Participations aux Boards</h4>
                <div className="space-y-1">
                  {userDetail.boardParticipations.map((b, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-background rounded-lg px-3 py-2">
                      <span className="text-muted-foreground">{b.boardId} #{b.instanceNumber}</span>
                      <span className="font-medium">Position {b.position}</span>
                      <span className="text-xs text-muted-foreground">{new Date(b.joinedAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {userDetail.recentTransactions.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Transactions Récentes</h4>
                <div className="space-y-1">
                  {userDetail.recentTransactions.map((t, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-background rounded-lg px-3 py-2">
                      <span className="text-muted-foreground">{t.type}</span>
                      <span className={`font-medium ${t.type === 'WITHDRAWAL' ? 'text-red-400' : 'text-primary'}`}>
                        {t.type === 'WITHDRAWAL' ? '-' : '+'}{t.amount} {t.currency}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${t.status === 'COMPLETED' ? 'bg-primary/10 text-primary' : t.status === 'CANCELLED' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                        {t.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex gap-2 justify-end">
              <button
                onClick={() => { setAdjustingUser({ id: userDetail.id, username: userDetail.username }); setSelectedUserId(null); }}
                className="flex items-center gap-2 px-4 py-2 bg-muted rounded-xl text-sm hover:bg-muted/70"
              >
                <Wallet className="w-4 h-4" /> Ajuster solde
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AppLayout>
  );
}
