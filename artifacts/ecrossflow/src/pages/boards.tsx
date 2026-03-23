import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, Trophy, Clock, ChevronRight, Users, ArrowRight, Zap, DollarSign, AlertCircle, X, Sparkles } from 'lucide-react';
import { useGetBoards, useGetMyBoardStatus, useGetWallet, usePayBoard, useGetBoardInstance } from '@workspace/api-client-react';
import type { Board, UserBoardStatus, BoardInstance } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout';
import { useQueryClient } from '@tanstack/react-query';
import { PyramidView } from '@/components/pyramid-view';

const BOARD_COLORS: Record<string, { bg: string; text: string; ring: string; label: string; badge: string }> = {
  F: { bg: 'from-slate-500/20 to-slate-600/10', text: 'text-slate-400', ring: 'ring-slate-500/30', label: 'Fondation', badge: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
  E: { bg: 'from-amber-700/20 to-amber-800/10', text: 'text-amber-600', ring: 'ring-amber-700/30', label: 'Émergence', badge: 'bg-amber-700/20 text-amber-600 border-amber-700/30' },
  D: { bg: 'from-zinc-400/20 to-zinc-500/10', text: 'text-zinc-300', ring: 'ring-zinc-400/30', label: 'Développement', badge: 'bg-zinc-400/20 text-zinc-300 border-zinc-400/30' },
  C: { bg: 'from-yellow-500/20 to-yellow-600/10', text: 'text-yellow-400', ring: 'ring-yellow-500/30', label: 'Croissance', badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  B: { bg: 'from-cyan-500/20 to-cyan-600/10', text: 'text-cyan-400', ring: 'ring-cyan-500/30', label: 'Breakthrough', badge: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  A: { bg: 'from-emerald-500/20 to-emerald-600/10', text: 'text-emerald-400', ring: 'ring-emerald-500/30', label: 'Altitude', badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  S: { bg: 'from-violet-500/20 to-violet-600/10', text: 'text-violet-400', ring: 'ring-violet-500/30', label: 'Sommet', badge: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
};

interface CelebrationModalProps {
  boardId: string;
  withdrawable: number;
  onClose: () => void;
}

function CelebrationModal({ boardId, withdrawable, onClose }: CelebrationModalProps) {
  const colors = BOARD_COLORS[boardId];
  const [count, setCount] = useState(0);
  const targetGain = withdrawable;
  const confettiIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const increment = Math.max(1, Math.floor(targetGain / 60));
    const timer = setInterval(() => {
      setCount(prev => {
        if (prev >= targetGain) { clearInterval(timer); return targetGain; }
        return Math.min(prev + increment, targetGain);
      });
    }, 30);
    return () => clearInterval(timer);
  }, [targetGain]);

  useEffect(() => {
    const fire = () => {
      confetti({ particleCount: 80, spread: 100, origin: { y: 0.5 }, colors: ['#f59e0b', '#6d28d9', '#10b981', '#ef4444', '#3b82f6'] });
    };
    fire();
    confettiIntervalRef.current = setInterval(fire, 1200);
    return () => {
      if (confettiIntervalRef.current) clearInterval(confettiIntervalRef.current);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.5, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="bg-card border border-primary rounded-3xl p-8 max-w-md w-full text-center shadow-2xl shadow-primary/20"
        onClick={e => e.stopPropagation()}
      >
        <motion.div
          animate={{ rotate: [0, -10, 10, -10, 10, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-6xl mb-4"
        >
          🎊
        </motion.div>
        <h2 className="text-3xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-primary to-yellow-400 mb-2">
          Board {boardId} Complété !
        </h2>
        <p className="text-muted-foreground mb-6">
          Vous avez rejoint le 8e slot et complété le board ! Le RANKER a reçu ses gains et de nouveaux cycles ont démarré.
        </p>
        <div className={`bg-gradient-to-br ${colors.bg} border ${colors.badge} rounded-2xl p-5 mb-6`}>
          <p className="text-sm text-muted-foreground mb-1">Gains du RANKER</p>
          <p className="text-4xl font-display font-black text-primary">
            ${count.toFixed(0)}
          </p>
        </div>
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold mb-6 ${colors.badge}`}>
          <Sparkles className="w-4 h-4" />
          Promotion en cours pour les leaders
        </div>
        <button
          onClick={onClose}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-semibold hover:shadow-[0_0_20px_rgba(0,255,170,0.4)] transition-all"
        >
          Continuer
        </button>
      </motion.div>
    </motion.div>
  );
}

interface BoardDetailProps {
  boardId: string;
  board: Board;
  status?: UserBoardStatus;
  walletBalance: number;
  paying: boolean;
  onPay: () => void;
  onClose: () => void;
}

function BoardDetail({ boardId, board, status, walletBalance, paying, onPay, onClose }: BoardDetailProps) {
  const colors = BOARD_COLORS[boardId];
  const canAfford = walletBalance >= board.entryFee;
  const alreadyJoined = !!status?.role;

  const { data: instance } = useGetBoardInstance(boardId);
  const queryClient = useQueryClient();
  useEffect(() => {
    const timer = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: [`/api/boards/${boardId}/instance`] });
    }, 5000);
    return () => clearInterval(timer);
  }, [boardId, queryClient]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
      className={`bg-gradient-to-br ${colors.bg} rounded-3xl p-6 border ring-1 ${colors.ring} shadow-2xl`}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <span className={`text-sm font-semibold uppercase tracking-widest ${colors.text}`}>{BOARD_COLORS[boardId].label}</span>
          <h2 className="text-2xl font-display font-bold">Board {boardId}</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className={`text-4xl font-display font-black ${colors.text}`}>{boardId}</div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted/40 transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Mise d'entrée", value: `$${board.entryFee}`, icon: DollarSign },
          { label: "Gain Total", value: `$${board.totalGain}`, icon: Trophy },
          { label: "Retirable", value: `$${board.withdrawable}`, icon: Zap },
          { label: "Slots", value: `${instance?.slotsFilled ?? 0}/8`, icon: Users },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-card/40 rounded-2xl p-4 border border-border/50">
            <Icon className={`w-5 h-5 mb-2 ${colors.text}`} />
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-bold font-display">{value}</p>
          </div>
        ))}
      </div>

      {/* Pyramid visualization */}
      <div className="mb-6 bg-card/20 rounded-2xl border border-border/30 overflow-hidden">
        <p className="text-xs text-muted-foreground px-4 pt-3 pb-1 font-medium uppercase tracking-widest">Pyramide en temps réel</p>
        {instance ? (
          <PyramidView
            boardId={boardId}
            participants={instance.participants || []}
            isCompleted={instance.status === 'COMPLETED'}
          />
        ) : (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Layers className="w-6 h-6 mr-2 opacity-40" />
            <span className="text-sm">Chargement de la pyramide...</span>
          </div>
        )}
      </div>

      {alreadyJoined ? (
        <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-5 py-3 text-primary font-semibold">
          <Zap className="w-5 h-5" /> Vous êtes sur ce board — Rôle : <span className="font-black">{status?.role}</span>
        </div>
      ) : !canAfford ? (
        <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-5 py-3 text-destructive">
          <AlertCircle className="w-5 h-5" /> Solde insuffisant. Déposez au moins ${board.entryFee} pour continuer.
        </div>
      ) : (
        <button
          onClick={onPay}
          disabled={paying}
          className="flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-6 py-3 font-semibold hover:shadow-[0_0_20px_rgba(0,255,170,0.4)] transition-all disabled:opacity-50"
        >
          {paying ? 'Traitement...' : `Rejoindre pour $${board.entryFee}`}
          <ArrowRight className="w-5 h-5" />
        </button>
      )}
    </motion.div>
  );
}

export default function Boards() {
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{ boardId: string; withdrawable: number } | null>(null);
  const queryClient = useQueryClient();

  const { data: boardsData } = useGetBoards();
  const { data: statusData } = useGetMyBoardStatus();
  const { data: wallet } = useGetWallet();

  const { mutate: payBoard } = usePayBoard({
    mutation: {
      onSuccess: (data, variables) => {
        queryClient.invalidateQueries();
        setPaying(null);
        if (data.boardCompleted) {
          const paidBoard = boards.find(b => b.id === variables.boardId);
          setCelebration({ boardId: variables.boardId, withdrawable: paidBoard?.withdrawable || 0 });
        }
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

        {/* Pyramid Visual - Top down F→S */}
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
                className={`relative h-12 rounded-lg transition-all duration-300 ring-1 ${colors.ring} bg-gradient-to-r ${colors.bg} ${isSelected ? 'ring-2 scale-105' : 'hover:scale-[1.02]'} flex items-center justify-between px-4 overflow-hidden cursor-pointer`}
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
            if (!board) return null;

            return (
              <BoardDetail
                key={selectedBoard}
                boardId={selectedBoard}
                board={board}
                status={status}
                walletBalance={wallet?.balanceUsd || 0}
                paying={paying === selectedBoard}
                onPay={() => handlePay(selectedBoard)}
                onClose={() => setSelectedBoard(null)}
              />
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
                  <div className="flex items-center gap-2">
                    {status?.role && (
                      <span className={`text-xs rounded-full px-3 py-1 font-semibold border ${colors.badge}`}>{status.role}</span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground font-medium">{BOARD_COLORS[boardId].label}</p>
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
                  <ChevronRight className="w-4 h-4" /> Voir la pyramide
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Celebration Modal */}
      <AnimatePresence>
        {celebration && (
          <CelebrationModal
            boardId={celebration.boardId}
            withdrawable={celebration.withdrawable}
            onClose={() => setCelebration(null)}
          />
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
