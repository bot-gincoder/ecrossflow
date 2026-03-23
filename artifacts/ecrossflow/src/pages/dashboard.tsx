import React from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Wallet, Layers, Users, Zap, TrendingUp, ChevronRight } from 'lucide-react';
import { useGetMe, useGetWallet, useGetMyBoardStatus, useGetTransactions } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout';

export default function Dashboard() {
  const { data: user } = useGetMe();
  const { data: wallet } = useGetWallet();
  const { data: boardStatus } = useGetMyBoardStatus();
  const { data: transactions } = useGetTransactions({ type: 'BOARD_RECEIPT', limit: 3 });

  const activeBoards = boardStatus?.statuses.filter(s => !s.completed) || [];
  const currentBoard = activeBoards.length > 0 ? activeBoards[activeBoards.length - 1] : null;

  return (
    <AppLayout>
      <div className="space-y-8">
        
        {/* Header Greeting */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <h1 className="text-3xl font-display font-bold">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Welcome back, {user?.firstName}. Let's grow together.</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex gap-3">
             <Link href="/wallet" className="px-5 py-2.5 bg-card border border-border rounded-xl font-medium hover:bg-muted transition-colors flex items-center gap-2">
               <ArrowDownRight className="w-4 h-4 text-primary" /> Deposit
             </Link>
             <Link href="/boards" className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:shadow-[0_0_20px_rgba(0,255,170,0.3)] transition-all flex items-center gap-2">
               <Layers className="w-4 h-4" /> Go to Boards
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
                   <Zap className="w-4 h-4 text-primary" /> Available Balance
                 </p>
                 <h2 className="text-5xl lg:text-6xl font-display font-bold tracking-tight text-glow">
                   ${wallet?.balanceUsd?.toFixed(2) || '0.00'}
                 </h2>
               </div>
               
               <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-10 pt-6 border-t border-border/50">
                 <div>
                   <p className="text-xs text-muted-foreground mb-1">Pending (In Boards)</p>
                   <p className="text-lg font-semibold text-orange-400">${wallet?.balancePending?.toFixed(2) || '0.00'}</p>
                 </div>
                 <div>
                   <p className="text-xs text-muted-foreground mb-1">Reserved</p>
                   <p className="text-lg font-semibold text-blue-400">${wallet?.balanceReserved?.toFixed(2) || '0.00'}</p>
                 </div>
                 <div className="hidden sm:block">
                   <p className="text-xs text-muted-foreground mb-1">Total Assets</p>
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
              <h3 className="font-semibold flex items-center gap-2"><Layers className="w-4 h-4 text-primary"/> Current Focus</h3>
              {currentBoard && (
                <span className="px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-bold uppercase">
                  {currentBoard.role}
                </span>
              )}
            </div>
            
            {currentBoard ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-3xl font-display font-bold shadow-lg shadow-black/50 mb-4 border-2 border-slate-600">
                  {currentBoard.boardId}
                </div>
                <h4 className="text-xl font-bold mb-1">Board {currentBoard.boardId}</h4>
                <p className="text-sm text-muted-foreground mb-6">You are progressing well. Invite more friends to accelerate completion.</p>
                <Link href={`/boards/${currentBoard.boardId}`} className="w-full py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold hover:bg-secondary/80 transition-colors text-sm">
                  View Pyramid
                </Link>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Layers className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground mb-4">Not in any active board.</p>
                <Link href="/boards" className="text-primary hover:underline text-sm font-semibold">Join Starter Board</Link>
              </div>
            )}
          </motion.div>
          
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Stats */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card border border-border rounded-3xl p-6">
            <h3 className="font-semibold mb-6 flex items-center gap-2"><Users className="w-4 h-4 text-primary"/> Referral Progress</h3>
            <div className="space-y-6">
               <div>
                 <div className="flex justify-between text-sm mb-2">
                   <span className="text-muted-foreground">Account Activation</span>
                   <span className="font-semibold">0/2</span>
                 </div>
                 <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                   <div className="h-full bg-primary w-[0%]"></div>
                 </div>
               </div>
               <div>
                 <div className="flex justify-between text-sm mb-2">
                   <span className="text-muted-foreground">Bonus Eligibility</span>
                   <span className="font-semibold">0/3</span>
                 </div>
                 <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                   <div className="h-full bg-accent w-[0%]"></div>
                 </div>
               </div>
               <div className="pt-4 border-t border-border">
                 <p className="text-sm text-muted-foreground mb-2">Your Code</p>
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
               <h3 className="font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary"/> Recent Gains</h3>
               <Link href="/history" className="text-xs text-primary hover:underline">View All</Link>
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
                  <p className="text-sm">No recent gains yet</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>

      </div>
    </AppLayout>
  );
}
