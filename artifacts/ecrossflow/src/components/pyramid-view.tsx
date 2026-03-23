import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BoardParticipant } from '@workspace/api-client-react';
import confetti from 'canvas-confetti';

interface PyramidViewProps {
  boardId: string;
  participants: BoardParticipant[];
  isCompleted?: boolean;
}

const ROLES = ['RANKER', 'LEADER', 'CHALLENGER', 'STARTER'] as const;
const SLOT_COUNTS = { RANKER: 1, LEADER: 2, CHALLENGER: 4, STARTER: 8 };
const ROLE_COLORS = {
  RANKER: 'from-accent to-yellow-600 border-accent text-white shadow-[0_0_30px_rgba(255,215,0,0.4)]',
  LEADER: 'from-slate-300 to-slate-500 border-slate-300 text-slate-900 shadow-[0_0_20px_rgba(200,200,200,0.3)]',
  CHALLENGER: 'from-orange-400 to-orange-700 border-orange-400 text-white shadow-[0_0_15px_rgba(255,140,0,0.2)]',
  STARTER: 'from-primary/80 to-primary border-primary text-primary-foreground shadow-[0_0_10px_rgba(0,255,170,0.2)]'
};

export const PyramidView = ({ boardId, participants, isCompleted }: PyramidViewProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isCompleted) {
      triggerCelebration();
    }
  }, [isCompleted]);

  const triggerCelebration = () => {
    const duration = 3000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#00FFB2', '#D4AF37', '#ffffff']
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#00FFB2', '#D4AF37', '#ffffff']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  };

  const getNodeData = (role: keyof typeof SLOT_COUNTS, index: number) => {
    const roleParticipants = participants.filter(p => p.role === role);
    return roleParticipants[index] || null;
  };

  return (
    <div className="w-full overflow-x-auto py-10 px-4 scrollbar-hide relative">
      {isCompleted && (
        <motion.div 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
          className="absolute inset-0 bg-primary/5 backdrop-blur-sm z-10 flex items-center justify-center pointer-events-none rounded-3xl"
        >
          <div className="bg-card/90 border border-primary p-8 rounded-3xl shadow-2xl text-center box-glow">
            <h2 className="text-3xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent mb-2">Board {boardId} Completed!</h2>
            <p className="text-muted-foreground">Ranker has been promoted to the next board.</p>
          </div>
        </motion.div>
      )}

      <div className="min-w-[800px] flex flex-col items-center gap-8 lg:gap-12 relative z-0">
        {/* SVG Connectors - abstract representation */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" style={{ zIndex: -1 }}>
           <path d="M 50% 10% L 25% 40% L 12.5% 70% M 50% 10% L 75% 40% L 87.5% 70%" stroke="url(#gradient)" strokeWidth="2" fill="none" />
           <defs>
             <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
               <stop offset="0%" stopColor="hsl(var(--accent))" />
               <stop offset="100%" stopColor="hsl(var(--primary))" />
             </linearGradient>
           </defs>
        </svg>

        {ROLES.map((role, rowIndex) => {
          const count = SLOT_COUNTS[role];
          return (
            <div key={role} className="flex justify-center w-full relative">
              <div className="absolute -left-12 lg:left-0 top-1/2 -translate-y-1/2 text-xs font-bold tracking-widest text-muted-foreground/50 uppercase rotate-[-90deg] lg:rotate-0">
                {role}
              </div>
              
              <div className="flex gap-4 lg:gap-8 justify-center w-full px-12 lg:px-24">
                {Array.from({ length: count }).map((_, i) => {
                  const node = getNodeData(role, i);
                  const isFilled = !!node;
                  
                  return (
                    <motion.div
                      key={`${role}-${i}`}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: mounted ? 0 : rowIndex * 0.1 + i * 0.05, type: 'spring' }}
                      className={`relative flex flex-col items-center ${isFilled ? 'cursor-pointer hover:-translate-y-2 transition-transform' : ''}`}
                    >
                      <div 
                        className={`
                          w-14 h-14 lg:w-20 lg:h-20 rounded-full flex items-center justify-center text-lg lg:text-2xl font-bold border-2
                          ${isFilled 
                            ? `bg-gradient-to-br ${ROLE_COLORS[role]}` 
                            : 'bg-muted/30 border-dashed border-border text-muted-foreground/30'}
                        `}
                      >
                        {isFilled ? (
                          node.avatarUrl ? (
                            <img src={node.avatarUrl} alt={node.username} className="w-full h-full rounded-full object-cover" />
                          ) : (
                            node.username.substring(0, 2).toUpperCase()
                          )
                        ) : (
                          <span className="opacity-50">+</span>
                        )}
                      </div>
                      
                      <div className="mt-2 text-center w-24">
                        <p className={`text-xs font-semibold truncate ${isFilled ? 'text-foreground' : 'text-muted-foreground/50'}`}>
                          {isFilled ? node.username : 'Empty Slot'}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
