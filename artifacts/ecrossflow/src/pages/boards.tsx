import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, Trophy, Clock, ChevronRight, Users, ArrowRight, Zap, DollarSign, AlertCircle } from 'lucide-react';
import { useGetBoards, useGetMyBoardStatus, useGetWallet, usePayBoard } from '@workspace/api-client-react';
import type { Board, UserBoardStatus } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout';
import { useQueryClient } from '@tanstack/react-query';

const BOARD_COLORS: Record<string, { bg: string; text: string; ring: string; label: string }> = {
  F: { bg: 'from-slate-500/20 to-slate-600/10', text: 'text-slate-400', ring: 'ring-slate-500/30', label: 'Fondation' },
  E: { bg: 'from-amber-700/20 to-amber-800/10', text: 'text-amber-600', ring: 'ring-amber-700/30', label: 'Émergence' },
  D: { bg: 'from-zinc-400/20 to-zinc-500/10', text: 'text-zinc-300', ring: 'ring-zinc-400/30', label: 'Développement' },
  C: { bg: 'from-yellow-500/20 to-yellow-600/10', text: 'text-yellow-400', ring: 'ring-yellow-500/30', label: 'Croissance' },
  B: { bg: 'from-cyan-500/20 to-cyan-600/10', text: 'text-cyan-400', ring: 'ring-cyan-500/30', label: 'Breakthrough' },
  A: { bg: 'from-emerald-500/20 to-emerald-600/10', text: 'text-emerald-400', ring: 'ring-emerald-500/30', label: 'Altitude' },
  S: { bg: 'from-violet-500/20 to-violet-600/10', text: 'text-violet-400', ring: 'ring-violet-500/30', label: 'Sommet' },
};

export default function Boards() {
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: boardsData } = useGetBoards();
  const { data: statusData } = useGetMyBoardStatus();
  const { data: wallet } = useGetWallet();

  const { mutate: payBoard } = usePayBoard({
    mutation: {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries();
        setPaying(null);
        setSelectedBoard(null);
      },
      onError: () => setPaying(null),
    }
  });

  const boards = boardsData?.boards || [];
  const statuses = statusData?.statuses || [];

  const getStatus = (boardId: string): UserBoardStatus | undefined =>
    statuses.find((s: UserBoardStatus) => s.boardId === boardId);

  const handlePay = (boardId: string) => {
    setPaying(boardId);
    payBoard({ boardId });
  };

  const boardKeys = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];

  return (
    <AppLayout>
      <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-display font-bold">Pyramid Boards</h1>
          <p className="text-muted-foreground mt-1">7 niveaux progressifs — de F à S</p>
        </motion.div>

        {/* Pyramid Visual */}
        <div className="flex flex-col items-center space-y-2 py-4">
          {[...boardKeys].reverse().map((boardId, reversedIdx) => {
            const idx = boardKeys.length - 1 - reversedIdx;
            const board = boards.find((b: Board) => b.id === boardId);
            const status = getStatus(boardId);
            const colors = BOARD_COLORS[boardId];
            const width = `${20 + (idx * 12)}%`;
            const isActive = status?.role;
            const isSelected = selectedBoard === boardId;

            return (
              <motion.button
                key={boardId}
                onClick={() => setSelectedBoard(isSelected ? null : boardId)}
                initial={{ opacity: 0, scaleX: 0.8 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ delay: reversedIdx * 0.05 }}
                style={{ width }}
                className={`relative h-12 rounded-lg transition-all duration-300 ring-1 ${colors.ring} bg-gradient-to-r ${colors.bg} ${isSelected ? 'ring-2 scale-105' : 'hover:scale-102'} flex items-center justify-between px-4 overflow-hidden cursor-pointer`}
              >
                <span className={`font-display font-bold text-lg ${colors.text}`}>{boardId}</span>
                <span className="text-xs text-muted-foreground hidden sm:block">{board ? `$${board.entryFee}` : ''}</span>
                {isActive && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-primary rounded-full animate-pulse shadow-[0_0_8px_rgba(0,255,170,0.8)]" />
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Board Detail Panel */}
        <AnimatePresence>
          {selectedBoard && (() => {
            const board = boards.find((b: Board) => b.id === selectedBoard);
            const status = getStatus(selectedBoard);
            const colors = BOARD_COLORS[selectedBoard];
            if (!board) return null;

            const canAfford = (wallet?.balanceUsd || 0) >= board.entryFee;
            const alreadyJoined = !!status?.role;

            return (
              <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                className={`bg-gradient-to-br ${colors.bg} rounded-3xl p-6 border ring-1 ${colors.ring} shadow-2xl`}
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <span className={`text-sm font-semibold uppercase tracking-widest ${colors.text}`}>{BOARD_COLORS[selectedBoard].label}</span>
                    <h2 className="text-2xl font-display font-bold">Board {selectedBoard}</h2>
                  </div>
                  <div className={`text-4xl font-display font-black ${colors.text}`}>{selectedBoard}</div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {[
                    { label: "Mise d'entrée", value: `$${board.entryFee}`, icon: DollarSign },
                    { label: "Gain Total", value: `$${board.totalGain}`, icon: Trophy },
                    { label: "Retirable", value: `$${board.withdrawable}`, icon: Zap },
                    { label: "Slots", value: '8 participants', icon: Users },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="bg-card/40 rounded-2xl p-4 border border-border/50">
                      <Icon className={`w-5 h-5 mb-2 ${colors.text}`} />
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="font-bold font-display">{value}</p>
                    </div>
                  ))}
                </div>

                {alreadyJoined ? (
                  <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-5 py-3 text-primary font-semibold">
                    <Zap className="w-5 h-5" /> Vous êtes déjà sur ce board (rôle: {status?.role})
                  </div>
                ) : !canAfford ? (
                  <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-5 py-3 text-destructive">
                    <AlertCircle className="w-5 h-5" /> Solde insuffisant. Déposez au moins ${board.entryFee} pour continuer.
                  </div>
                ) : (
                  <button
                    onClick={() => handlePay(selectedBoard)}
                    disabled={!!paying}
                    className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-6 py-3 font-semibold hover:shadow-[0_0_20px_rgba(0,255,170,0.4)] transition-all disabled:opacity-50"
                  >
                    {paying === selectedBoard ? 'Traitement...' : `Rejoindre pour $${board.entryFee}`}
                    <ArrowRight className="w-5 h-5" />
                  </button>
                )}
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Board Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {boardKeys.map((boardId, idx) => {
            const board = boards.find((b: Board) => b.id === boardId);
            const status = getStatus(boardId);
            const colors = BOARD_COLORS[boardId];

            return (
              <motion.div
                key={boardId}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                onClick={() => setSelectedBoard(boardId)}
                className={`bg-gradient-to-br ${colors.bg} rounded-2xl p-5 ring-1 ${colors.ring} cursor-pointer hover:scale-[1.02] transition-all duration-200`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`text-3xl font-display font-black ${colors.text}`}>{boardId}</div>
                  {status?.role && (
                    <span className="text-xs bg-primary/20 text-primary rounded-full px-3 py-1 font-semibold">{status.role}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{BOARD_COLORS[boardId].label}</p>
                <div className="mt-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Mise</p>
                    <p className="font-bold font-display">${board?.entryFee || '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Retirable</p>
                    <p className={`font-bold font-display ${colors.text}`}>${board?.withdrawable || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground">
                  <ChevronRight className="w-4 h-4" /> Voir les détails
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
