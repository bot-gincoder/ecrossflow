import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, CheckCircle2, Layers } from 'lucide-react';
import { useGetBoards, useGetMyBoardStatus, useGetWallet, usePayBoard } from '@workspace/api-client-react';
import type { Board, UserBoardStatus } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout';
import { useQueryClient } from '@tanstack/react-query';

const LEVEL_ORDER_ASC = ['F', 'E', 'D', 'C', 'B', 'A', 'S'] as const;
const LEVEL_ORDER_DESC = [...LEVEL_ORDER_ASC].reverse();

const LEVEL_STYLE: Record<string, { bar: string; text: string; chip: string; panel: string }> = {
  F: { bar: 'from-zinc-400/30 to-zinc-700/20', text: 'text-zinc-200', chip: 'bg-zinc-500/20 border-zinc-400/40 text-zinc-200', panel: 'from-zinc-500/10 to-zinc-800/20' },
  E: { bar: 'from-cyan-500/25 to-cyan-900/20', text: 'text-cyan-200', chip: 'bg-cyan-500/20 border-cyan-400/40 text-cyan-100', panel: 'from-cyan-500/10 to-cyan-900/20' },
  D: { bar: 'from-amber-600/25 to-amber-900/20', text: 'text-amber-200', chip: 'bg-amber-500/20 border-amber-400/40 text-amber-100', panel: 'from-amber-500/10 to-amber-900/20' },
  C: { bar: 'from-yellow-500/25 to-yellow-900/20', text: 'text-yellow-200', chip: 'bg-yellow-500/20 border-yellow-400/40 text-yellow-100', panel: 'from-yellow-500/10 to-yellow-900/20' },
  B: { bar: 'from-lime-500/25 to-lime-900/20', text: 'text-lime-200', chip: 'bg-lime-500/20 border-lime-400/40 text-lime-100', panel: 'from-lime-500/10 to-lime-900/20' },
  A: { bar: 'from-emerald-500/25 to-emerald-900/20', text: 'text-emerald-200', chip: 'bg-emerald-500/20 border-emerald-400/40 text-emerald-100', panel: 'from-emerald-500/10 to-emerald-900/20' },
  S: { bar: 'from-violet-500/30 to-fuchsia-900/20', text: 'text-violet-100', chip: 'bg-violet-500/20 border-violet-400/40 text-violet-100', panel: 'from-violet-500/10 to-fuchsia-900/20' },
};

const LEVEL_THEME_LABEL: Record<string, string> = {
  F: "Foundation",
  E: "Expansion",
  D: "Development",
  C: "Consolidation",
  B: "Breakthrough",
  A: "Ascension",
  S: "Summit",
};

function parseUsd(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? 0));
  return Number.isFinite(n) ? n : 0;
}

export default function Boards() {
  const queryClient = useQueryClient();
  const [paying, setPaying] = useState<string | null>(null);

  const { data: boardsData } = useGetBoards();
  const { data: statusData } = useGetMyBoardStatus();
  const { data: wallet } = useGetWallet();

  const boards = boardsData?.boards || [];
  const statuses = statusData?.statuses || [];

  const activeStatus = useMemo(() => {
    const active = statuses.filter((s) => !s.completed);
    return active.length ? active[active.length - 1] : undefined;
  }, [statuses]);

  const [selectedBoard, setSelectedBoard] = useState<string>(activeStatus?.boardId || 'F');

  React.useEffect(() => {
    if (activeStatus?.boardId && !selectedBoard) setSelectedBoard(activeStatus.boardId);
  }, [activeStatus, selectedBoard]);

  const selectedBoardData = boards.find((b: Board) => b.id === selectedBoard);
  const selectedStatus = statuses.find((s: UserBoardStatus) => s.boardId === selectedBoard);
  const walletBalance = parseUsd(wallet?.balanceUsd);
  const selectedEntry = parseUsd(selectedBoardData?.entryFee);
  const canAfford = walletBalance >= selectedEntry;
  const alreadyJoined = Boolean(selectedStatus?.role);
  const manualActivationAllowed = selectedBoardData?.id === 'F';

  const { mutate: payBoard } = usePayBoard({
    mutation: {
      onSuccess: () => {
        setPaying(null);
        queryClient.invalidateQueries();
      },
      onError: () => setPaying(null),
    },
  });

  const handleJoin = () => {
    if (!selectedBoardData) return;
    if (selectedBoardData.id !== 'F') return;
    setPaying(selectedBoardData.id);
    payBoard({ boardId: selectedBoardData.id });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
          <h1 className="text-4xl font-display font-black tracking-tight">CREATION BOARDS</h1>
          <p className="text-sm text-muted-foreground tracking-[0.16em] uppercase">7 progressive levels from F to S</p>
        </motion.div>

        <div className="rounded-3xl border border-border bg-card/40 p-4 sm:p-6 shadow-xl">
          <div className="space-y-2">
            {LEVEL_ORDER_DESC.map((level, idx) => {
              const board = boards.find((b: Board) => b.id === level);
              const fee = parseUsd(board?.entryFee);
              const width = `${74 - idx * 7}%`;
              const selected = selectedBoard === level;
              const style = LEVEL_STYLE[level];
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => setSelectedBoard(level)}
                  className={`mx-auto block h-11 rounded-xl border px-4 text-left transition-all ${selected ? 'border-primary shadow-[0_0_22px_rgba(0,255,170,0.24)]' : 'border-white/10 hover:border-white/25'} bg-gradient-to-r ${style.bar}`}
                  style={{ width }}
                >
                  <span className="flex h-full items-center justify-between">
                    <span className={`font-display text-lg font-black ${style.text}`}>{level}</span>
                    <span className="font-mono text-xs text-zinc-200">${fee ? fee.toFixed(0) : '0'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {selectedBoardData && (
          <motion.section
            key={selectedBoardData.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-3xl border border-border bg-gradient-to-br ${LEVEL_STYLE[selectedBoardData.id]?.panel || 'from-card/50 to-card/20'} p-4 sm:p-6 shadow-2xl`}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {LEVEL_THEME_LABEL[selectedBoardData.id] || `Level ${selectedBoardData.id}`}
                </p>
                <h2 className="text-3xl font-display font-black">Board{selectedBoardData.id}</h2>
              </div>
              <div className={`rounded-xl border px-4 py-2 text-2xl font-display font-black ${LEVEL_STYLE[selectedBoardData.id]?.chip || ''}`}>
                {selectedBoardData.id}
              </div>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/15 bg-black/30 px-4 py-4">
                <p className="text-3xl font-display font-black">entry cost: ${selectedEntry.toFixed(0)}</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-black/30 px-4 py-4">
                <p className="text-sm uppercase tracking-[0.12em] text-muted-foreground">activation status</p>
                <p className="text-2xl font-display font-black">{alreadyJoined ? 'Active' : 'Not active'}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {alreadyJoined ? (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-emerald-200">
                  <CheckCircle2 className="h-5 w-5" /> Your level is already activated.
                </div>
              ) : !manualActivationAllowed ? (
                <div className="flex items-center gap-2 rounded-xl border border-blue-500/35 bg-blue-500/10 px-4 py-3 text-blue-200">
                  <CheckCircle2 className="h-5 w-5" /> This level is activated automatically by progression after Board F completion.
                </div>
              ) : !canAfford ? (
                <div className="flex items-center gap-2 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-red-200">
                  <AlertCircle className="h-5 w-5" /> Insufficient balance. Deposit at least ${selectedEntry.toFixed(0)} to activate this level.
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={paying === selectedBoardData.id}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground transition hover:shadow-[0_0_20px_rgba(0,255,170,0.35)] disabled:opacity-60"
                >
                  {paying === selectedBoardData.id ? 'Processing...' : 'Activate this level'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-muted-foreground">Activation cost</p>
                  <p className="font-display text-xl font-black">${selectedEntry.toFixed(2)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-muted-foreground">Wallet balance</p>
                  <p className="font-display text-xl font-black">${walletBalance.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </motion.section>
        )}

        {!selectedBoardData && (
          <div className="rounded-2xl border border-border bg-card/40 p-8 text-center text-muted-foreground">
            <Layers className="mx-auto mb-2 h-7 w-7 opacity-60" />
            Loading levels...
          </div>
        )}
      </div>
    </AppLayout>
  );
}
