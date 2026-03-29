import React from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Wallet, Layers, Users, Zap, TrendingUp } from 'lucide-react';
import { useGetMe, useGetWallet, useGetMyBoardStatus, useGetTransactions, useGetBoardInstance, useGetReferrals } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout';
import { useAppStore } from '@/hooks/use-store';

export default function Dashboard() {
  const { t } = useAppStore();
  const { data: user } = useGetMe();
  const { data: wallet } = useGetWallet();
  const { data: referralsData } = useGetReferrals();
  const { data: boardStatus } = useGetMyBoardStatus();
  const { data: transactions } = useGetTransactions({ type: 'BOARD_RECEIPT', limit: 3 });
  const displayName = user?.firstName || user?.username || '';
  const requiredActiveReferrals = 1;
  const activeReferrals = referralsData?.activeReferrals || 0;
  const referralActivationProgress = Math.min((activeReferrals / requiredActiveReferrals) * 100, 100);
  const referralUnlocked = activeReferrals >= requiredActiveReferrals;

  const activeBoards = boardStatus?.statuses.filter((s) => !s.completed && Boolean(s.role)) || [];
  const currentBoard = activeBoards.length > 0 ? activeBoards[activeBoards.length - 1] : null;
  const { data: currentBoardInstance } = useGetBoardInstance(
    currentBoard?.boardId || "F",
    {
      query: {
        enabled: Boolean(currentBoard?.boardId && user?.id),
      },
    },
  );
  const myParticipant = currentBoardInstance?.participants?.find((p) => p.userId === user?.id) || null;
  const strategicRole = myParticipant?.role || currentBoard?.role || null;
  const strategicPosition = typeof myParticipant?.position === "number" ? myParticipant.position : null;
  const rootOwner = currentBoardInstance?.ranker?.username || null;
  const roleLabel = strategicRole ? t(`boards.step.${String(strategicRole).toLowerCase()}`) : t("dashboard.na");

  return (
    <AppLayout>
      <div className="space-y-8">
        
        {/* Header Greeting */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <h1 className="text-3xl font-display font-bold">{t('dashboard.title')}</h1>
            <p className="text-muted-foreground mt-1">
              {displayName
                ? t('dashboard.welcome_back_named').replace('{name}', displayName)
                : t('dashboard.welcome_back')}
            </p>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex gap-3">
             <Link href="/wallet" className="px-5 py-2.5 bg-card border border-border rounded-xl font-medium hover:bg-muted transition-colors flex items-center gap-2">
               <ArrowDownRight className="w-4 h-4 text-primary" /> {t('dashboard.deposit')}
             </Link>
             <Link href="/boards" className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:shadow-[0_0_20px_rgba(0,255,170,0.3)] transition-all flex items-center gap-2">
               <Layers className="w-4 h-4" /> {t('dashboard.go_boards')}
             </Link>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* Main Wallet Card */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="md:col-span-8 bg-gradient-to-br from-card to-card/50 border border-border rounded-3xl p-6 lg:p-8 relative overflow-hidden shadow-xl"
          >
            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
               <Wallet className="w-32 h-32 text-primary" />
            </div>
            
            <div className="relative z-10 flex flex-col h-full justify-between">
               <div>
                 <p className="text-muted-foreground font-medium mb-2 flex items-center gap-2">
                   <Zap className="w-4 h-4 text-primary" /> {t('dashboard.balance_title')}
                 </p>
                 <h2 className="text-5xl lg:text-6xl font-display font-bold tracking-tight text-glow">
                   ${wallet?.balanceUsd?.toFixed(2) || '0.00'}
                 </h2>
               </div>
               
               <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-10 pt-6 border-t border-border/50">
                 <div>
                   <p className="text-xs text-muted-foreground mb-1">{t('dashboard.pending_in_boards')}</p>
                   <p className="text-lg font-semibold text-orange-400">${wallet?.balancePending?.toFixed(2) || '0.00'}</p>
                 </div>
                 <div>
                   <p className="text-xs text-muted-foreground mb-1">{t('dashboard.reserved')}</p>
                   <p className="text-lg font-semibold text-blue-400">${wallet?.balanceReserved?.toFixed(2) || '0.00'}</p>
                 </div>
                 <div className="hidden sm:block">
                   <p className="text-xs text-muted-foreground mb-1">{t('dashboard.total_assets')}</p>
                   <p className="text-lg font-semibold">${wallet?.totalBalance?.toFixed(2) || '0.00'}</p>
                 </div>
               </div>
            </div>
          </motion.div>

          {/* Current Board Card */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="md:col-span-4 bg-card border border-border rounded-3xl p-6 flex flex-col hover:border-primary/50 transition-colors"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold flex items-center gap-2"><Layers className="w-4 h-4 text-primary"/> {t('dashboard.current_focus')}</h3>
              {currentBoard && (
                <span className="px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-bold uppercase">
                  {t(`boards.step.${String(currentBoard.role).toLowerCase()}`)}
                </span>
              )}
            </div>
            
            {currentBoard ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-3xl font-display font-bold shadow-lg shadow-black/50 mb-4 border-2 border-slate-600">
                  {currentBoard.boardId}
                </div>
                <h4 className="text-xl font-bold mb-1">{t('dashboard.level_label')} {currentBoard.boardId}</h4>
                <p className="text-sm text-muted-foreground">{t('dashboard.progress_hint')}</p>
                {rootOwner && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('dashboard.root_owner')}: <span className="font-semibold text-foreground">@{rootOwner}</span>
                  </p>
                )}
                <p className="mt-1 mb-6 text-xs text-muted-foreground">
                    {t('dashboard.position')}:{" "}
                  <span className="font-semibold text-foreground">
                    {roleLabel}
                    {strategicPosition !== null ? ` #${strategicPosition}` : ""}
                  </span>
                </p>
                <Link href="/boards" className="w-full py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold hover:bg-secondary/80 transition-colors text-sm">
                  {t('dashboard.view_level_details')}
                </Link>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Layers className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground mb-4">{t('dashboard.not_in_board')}</p>
                <Link href="/boards" className="text-primary hover:underline text-sm font-semibold">{t('dashboard.join_starter')}</Link>
              </div>
            )}
          </motion.div>
          
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Stats */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card border border-border rounded-3xl p-6">
            <h3 className="font-semibold mb-6 flex items-center gap-2"><Users className="w-4 h-4 text-primary"/> {t('dashboard.referral_progress')}</h3>
            <div className="space-y-6">
               <div>
                 <div className="flex justify-between text-sm mb-2">
                   <span className="text-muted-foreground">{t('dashboard.account_activation')}</span>
                   <span className="font-semibold">{Math.min(activeReferrals, requiredActiveReferrals)}/{requiredActiveReferrals}</span>
                 </div>
                 <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                   <div className="h-full bg-primary transition-all" style={{ width: `${referralActivationProgress}%` }}></div>
                 </div>
               </div>
               <div>
                 <p className="text-sm text-muted-foreground">
                   {t('dashboard.first_referral_unlock')}
                 </p>
                 <p className={`mt-1 text-sm font-medium ${referralUnlocked ? 'text-primary' : 'text-muted-foreground'}`}>
                   {referralUnlocked
                     ? t('referrals.activation_done')
                     : t('referrals.activation_left').replace('{left}', String(Math.max(requiredActiveReferrals - activeReferrals, 0)))}
                 </p>
               </div>
               <div className="pt-4 border-t border-border">
                 <p className="text-sm text-muted-foreground mb-2">{t('dashboard.your_code')}</p>
                 <div className="flex items-center gap-2">
                   <code className="flex-1 bg-muted p-3 rounded-xl font-mono text-center tracking-widest font-bold text-lg border border-border">
                     {user?.referralCode || '------'}
                   </code>
                 </div>
               </div>
            </div>
          </motion.div>

          {/* Recent Activity */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-card border border-border rounded-3xl p-6 flex flex-col">
            <div className="flex justify-between items-center mb-6">
               <h3 className="font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary"/> {t('dashboard.recent_gains')}</h3>
               <Link href="/history" className="text-xs text-primary hover:underline">{t('dashboard.view_all')}</Link>
            </div>
            
            <div className="flex-1 flex flex-col gap-4">
              {transactions?.transactions?.length ? (
                transactions.transactions.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between p-4 rounded-xl bg-background border border-border/50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                        <ArrowUpRight className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-semibold">{tx.type.replace('_', ' ')}</p>
                        <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <span className="font-bold text-primary">+{tx.amountUsd} USD</span>
                  </div>
                ))
              ) : (
                <div className="flex-1 flex items-center justify-center flex-col text-muted-foreground">
                  <TrendingUp className="w-8 h-8 opacity-20 mb-2" />
                  <p className="text-sm">{t('dashboard.no_recent_gains')}</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>

      </div>
    </AppLayout>
  );
}
