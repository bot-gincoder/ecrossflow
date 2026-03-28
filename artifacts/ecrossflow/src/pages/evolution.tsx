import React, { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout";
import { useAppStore } from "@/hooks/use-store";
import { Layers, Settings, ShieldCheck, Activity, Save, RefreshCw, Network } from "lucide-react";

type ModuleStatus = "live" | "partial" | "planned";

interface EvolutionModule {
  code: string;
  label: string;
  status: ModuleStatus;
  note: string;
}

interface EvolutionOverviewResponse {
  kpi: {
    users: number;
    activeUsers: number;
    wallets: number;
    boards: number;
    pendingDeposits: number;
    pendingWithdrawals: number;
  };
  modules: EvolutionModule[];
}

interface SettingRow {
  key: string;
  value: unknown;
  updated_at: string;
  updated_by: string | null;
}

interface FlowUser {
  id: string;
  username: string;
  accountNumber: number | null;
  currentBoard: string | null;
  status: string;
  stage: string;
}

interface FlowNode {
  slot: string;
  stage: string;
  role: string;
  strategicNumber: number | null;
  level: string;
  user: FlowUser | null;
}

interface FlowInstance {
  id: string;
  boardId: string;
  instanceNumber: number;
  status: string;
  slotsFilled: number;
  starterSlotsFilled?: number;
  coreSlotsFilled?: number;
  totalSlotsFilled?: number;
  createdAt: string;
  completedAt: string | null;
  rootNumber: number | null;
  nodes: FlowNode[];
}

interface FlowResponse {
  boardId: string;
  instances: FlowInstance[];
}

const LABELS: Record<string, string> = {
  entry_fee_usd: "Prix d'entrée (USD)",
  min_deposit_usd: "Dépôt minimum (USD)",
  kyc_on_withdraw_only: "KYC uniquement au retrait",
  enable_sms_otp: "OTP SMS activé",
  enable_whatsapp_otp: "OTP WhatsApp activé",
  enable_auto_withdraw_crypto: "Retrait crypto auto",
  maintenance_mode: "Mode maintenance",
  board_auto_progression: "Progression auto des boards",
  board_min_direct_referrals: "Min filleuls directs pour progression",
  ceo_bootstrap_full_board_f_required: "CEO: board F complet requis avant E",
  board_force_tools_enabled: "Outils forcés admin boards",
  deposit_methods_enabled: "Méthodes dépôt actives",
  withdraw_methods_enabled: "Méthodes retrait actives",
  board_referral_bonus: "Bonus referral par niveau",
  board_financials: "Economies des boards",
};

function statusChip(status: ModuleStatus): string {
  if (status === "live") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  if (status === "partial") return "bg-yellow-500/15 text-yellow-300 border-yellow-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function normalizeInput(value: string): unknown {
  const v = value.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (v !== "" && !Number.isNaN(Number(v))) return Number(v);
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

export default function EvolutionPage() {
  const { token } = useAppStore();
  const [overview, setOverview] = useState<EvolutionOverviewResponse | null>(null);
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [accountPreview, setAccountPreview] = useState("1");
  const [pathPreview, setPathPreview] = useState<Record<string, number> | null>(null);
  const [selectedFlowBoard, setSelectedFlowBoard] = useState("F");
  const [flow, setFlow] = useState<FlowResponse | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>("");

  const base = useMemo(() => import.meta.env.BASE_URL.replace(/\/$/, ""), []);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [ov, cfg, fl] = await Promise.all([
        fetch(`${base}/api/admin/evolution/overview`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${base}/api/admin/evolution/config`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${base}/api/admin/evolution/board-flow?boardId=${encodeURIComponent(selectedFlowBoard)}&limit=8`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const ovData = await ov.json() as EvolutionOverviewResponse;
      const cfgData = await cfg.json() as { settings: SettingRow[] };
      const flData = await fl.json() as FlowResponse;
      setOverview(ovData);
      setSettings(cfgData.settings || []);
      setFlow(flData);
      if (!selectedInstanceId && flData.instances?.length) setSelectedInstanceId(flData.instances[0]!.id);
      if (selectedInstanceId && flData.instances?.every((i) => i.id !== selectedInstanceId)) {
        setSelectedInstanceId(flData.instances?.[0]?.id || "");
      }
      const nextDrafts: Record<string, string> = {};
      for (const s of cfgData.settings || []) nextDrafts[s.key] = JSON.stringify(s.value);
      setDrafts(nextDrafts);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token, selectedFlowBoard]);

  useEffect(() => {
    if (!token) return;
    const t = window.setInterval(() => { void load(); }, 8000);
    return () => window.clearInterval(t);
  }, [token, selectedFlowBoard, selectedInstanceId]);

  const saveSetting = async (key: string) => {
    if (!token) return;
    setSavingKey(key);
    try {
      await fetch(`${base}/api/admin/evolution/config/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value: normalizeInput(drafts[key] ?? "") }),
      });
      await load();
    } finally {
      setSavingKey(null);
    }
  };

  const loadPathPreview = async () => {
    if (!token) return;
    const n = parseInt(accountPreview, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    const res = await fetch(`${base}/api/admin/evolution/board-path/${n}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json() as { strategy?: Record<string, number> };
    setPathPreview(data.strategy || null);
  };

  const selectedInstance = flow?.instances?.find((i) => i.id === selectedInstanceId) || flow?.instances?.[0] || null;
  const nodeBySlot = useMemo(() => {
    const map = new Map<string, FlowNode>();
    for (const node of selectedInstance?.nodes || []) map.set(node.slot, node);
    return map;
  }, [selectedInstance]);

  const renderTreeNode = (slot: string) => {
    const node = nodeBySlot.get(slot);
    const stage = node?.stage || (slot === "N1" ? "RANKER" : slot.startsWith("N2") || slot.startsWith("N3") ? "LEADER" : slot === "N6" || slot === "N7" || slot === "N4" || slot === "N5" ? "CHALLENGER" : "STARTER");
    const stageClass = stage === "RANKER"
      ? "border-cyan-400/40 bg-cyan-500/20"
      : stage === "LEADER"
      ? "border-violet-400/40 bg-violet-500/20"
      : stage === "CHALLENGER"
      ? "border-orange-400/40 bg-orange-500/20"
      : "border-emerald-400/40 bg-emerald-500/20";

    return (
      <div className={`rounded-xl border ${stageClass} p-2 text-center shadow-sm`}>
        <div className="text-[11px] font-bold uppercase tracking-wide text-white/90">{slot}</div>
        <div className="text-xs text-muted-foreground">#{node?.strategicNumber ?? "—"}</div>
        {node?.user ? (
          <div className="mt-1">
            <div className="text-xs font-semibold">@{node.user.username} · {node.user.accountNumber ?? "—"}</div>
            <div className="text-[10px] text-muted-foreground">Niveau {node.level} · Etape {node.stage}</div>
          </div>
        ) : (
          <div className="mt-1 text-[10px] text-muted-foreground">Position libre</div>
        )}
      </div>
    );
  };

  return (
    <AppLayout requireAdmin>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Evolution Control</h1>
            <p className="text-sm text-muted-foreground">Base du cockpit Super Admin (phase évolutive)</p>
          </div>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm hover:border-primary/40"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Actualiser
          </button>
        </div>

        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-border bg-card/50 p-4"><p className="text-xs text-muted-foreground">Utilisateurs</p><p className="text-2xl font-bold">{overview.kpi.users}</p></div>
            <div className="rounded-2xl border border-border bg-card/50 p-4"><p className="text-xs text-muted-foreground">Actifs</p><p className="text-2xl font-bold">{overview.kpi.activeUsers}</p></div>
            <div className="rounded-2xl border border-border bg-card/50 p-4"><p className="text-xs text-muted-foreground">Wallets</p><p className="text-2xl font-bold">{overview.kpi.wallets}</p></div>
            <div className="rounded-2xl border border-border bg-card/50 p-4"><p className="text-xs text-muted-foreground">Boards</p><p className="text-2xl font-bold">{overview.kpi.boards}</p></div>
            <div className="rounded-2xl border border-border bg-card/50 p-4"><p className="text-xs text-muted-foreground">Dépôts en attente</p><p className="text-2xl font-bold">{overview.kpi.pendingDeposits}</p></div>
            <div className="rounded-2xl border border-border bg-card/50 p-4"><p className="text-xs text-muted-foreground">Retraits en attente</p><p className="text-2xl font-bold">{overview.kpi.pendingWithdrawals}</p></div>
          </div>
        )}

        <section className="rounded-2xl border border-border bg-card/40 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Modules du Master Engine</h2>
          </div>
          <div className="space-y-2">
            {overview?.modules?.map((m) => (
              <div key={m.code} className="rounded-xl border border-border bg-background/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.note}</p>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-xs uppercase ${statusChip(m.status)}`}>{m.status}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card/40 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Network className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Live Strategic Tree</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedFlowBoard}
                onChange={(e) => { setSelectedFlowBoard(e.target.value); setSelectedInstanceId(""); }}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs"
              >
                {["F", "E", "D", "C", "B", "A", "S"].map((b) => <option key={b} value={b}>Board {b}</option>)}
              </select>
              <select
                value={selectedInstance?.id || ""}
                onChange={(e) => setSelectedInstanceId(e.target.value)}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs"
              >
                {(flow?.instances || []).map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    Inst #{inst.instanceNumber} · {inst.status} · Core {(inst.coreSlotsFilled ?? 0)}/6 · Starter {(inst.starterSlotsFilled ?? 0)}/8
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedInstance ? (
            <div className="rounded-2xl border border-border bg-background/40 p-3">
              <div className="mb-3 text-xs text-muted-foreground">
                Board {selectedInstance.boardId} · Instance #{selectedInstance.instanceNumber} · Flux temps réel (refresh auto 8s)
              </div>
              <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-violet-200">
                  Core {(selectedInstance.coreSlotsFilled ?? 0)}/6
                </span>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">
                  Starter {(selectedInstance.starterSlotsFilled ?? 0)}/8
                </span>
                <span className="rounded-full border border-border bg-card px-2 py-0.5 text-muted-foreground">
                  Total {(selectedInstance.totalSlotsFilled ?? selectedInstance.slotsFilled ?? 0)}/14
                </span>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {["N6*2+1", "N6*2", "N7*2+1", "N7*2"].map(renderTreeNode)}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
                  {["N6", "N7"].map(renderTreeNode)}
                </div>
                <div className="grid grid-cols-1 gap-2">{["N2"].map(renderTreeNode)}</div>
                <div className="grid grid-cols-1 gap-2">{["N1"].map(renderTreeNode)}</div>
                <div className="grid grid-cols-1 gap-2">{["N3"].map(renderTreeNode)}</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
                  {["N4", "N5"].map(renderTreeNode)}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {["N4*2", "N4*2+1", "N5*2", "N5*2+1"].map(renderTreeNode)}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Aucune instance disponible pour ce board.
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card/40 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">System Config Runtime</h2>
          </div>
          <div className="space-y-3">
            {settings.map((s) => (
              <div key={s.key} className="rounded-xl border border-border bg-background/40 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="sm:w-1/3">
                    <p className="text-sm font-medium">{LABELS[s.key] || s.key}</p>
                    <p className="text-xs text-muted-foreground">{s.key}</p>
                  </div>
                  <input
                    value={drafts[s.key] ?? ""}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [s.key]: e.target.value }))}
                    className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary/50"
                  />
                  <button
                    onClick={() => void saveSetting(s.key)}
                    disabled={savingKey === s.key}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {savingKey === s.key ? "Sauvegarde..." : "Sauvegarder"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card/40 p-5">
          <div className="mb-2 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Direction suivante</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Cette page est la base de travail de la prochaine phase: automation engine, monitoring temps réel, page/content builder admin, et contrôle avancé des cycles.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
            <Activity className="w-3.5 h-3.5" />
            Evolution mode actif
          </div>
          <div className="mt-4 rounded-xl border border-border bg-background/40 p-3">
            <p className="text-sm font-medium">Automatic Board Control (prochaine étape)</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Implémentation prévue: recalcul temps réel du parcours de chaque utilisateur, rotation dynamique des positions à chaque inscription + activation, puis moteur central basé sur numéros et positions stratégiques.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={accountPreview}
                onChange={(e) => setAccountPreview(e.target.value)}
                className="w-36 rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
                placeholder="Account #"
              />
              <button
                onClick={() => void loadPathPreview()}
                className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs text-primary"
              >
                Prévisualiser la formule
              </button>
            </div>
            {pathPreview && (
              <div className="mt-2 rounded-lg border border-border bg-card/50 p-2 text-xs text-muted-foreground">
                {Object.entries(pathPreview).map(([k, v]) => (
                  <span key={k} className="mr-3 inline-block">{k.toUpperCase()}={v}</span>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
