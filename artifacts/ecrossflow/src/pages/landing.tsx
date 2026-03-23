import React from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { ShieldCheck, Zap, Globe, ArrowRight, ChevronRight, PlayCircle } from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden selection:bg-primary/30">
      {/* Header */}
      <header className="fixed top-0 left-0 w-full z-50 bg-background/50 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-6 h-6 object-contain invert brightness-0" />
             </div>
             <span className="font-display font-bold text-xl tracking-tight">ECROSSFLOW</span>
          </div>
          <nav className="hidden md:flex gap-8 text-sm font-medium text-muted-foreground">
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How it Works</a>
            <a href="#boards" className="hover:text-foreground transition-colors">The Boards</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/auth/login" className="text-sm font-medium hover:text-primary transition-colors hidden sm:block">Login</Link>
            <Link href="/auth/register" className="bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-semibold hover:shadow-[0_0_20px_rgba(0,255,170,0.4)] transition-all hover:-translate-y-0.5">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        {/* Abstract Background */}
        <div className="absolute inset-0 z-0 opacity-40">
          <img 
            src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
            alt="Hero Background" 
            className="w-full h-full object-cover mix-blend-screen"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background" />
        </div>

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="max-w-3xl">
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-semibold mb-6"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Next Gen Digital Giving
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
              className="text-5xl lg:text-7xl font-display font-bold leading-[1.1] tracking-tight mb-6"
            >
              The Smart Way to <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Empower Communities.</span>
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg lg:text-xl text-muted-foreground mb-10 max-w-2xl leading-relaxed"
            >
              Ecrossflow is a revolutionary pyramid-based donation platform. Start with just $2, invite friends, and rise through 7 boards to unlock financial freedom in a fully automated, secure ecosystem.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-wrap gap-4"
            >
              <Link href="/auth/register" className="flex items-center gap-2 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground px-8 py-4 rounded-2xl font-bold text-lg hover:shadow-[0_0_30px_rgba(0,255,170,0.4)] transition-all hover:-translate-y-1">
                Start with $2
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a href="#how-it-works" className="flex items-center gap-2 bg-secondary text-secondary-foreground px-8 py-4 rounded-2xl font-bold text-lg hover:bg-secondary/80 transition-all border border-border">
                <PlayCircle className="w-5 h-5" />
                See How it Works
              </a>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 border-y border-border bg-card/30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-border">
            <div className="py-4">
              <h3 className="text-4xl font-display font-bold text-primary mb-2">10k+</h3>
              <p className="text-muted-foreground font-medium">Active Members</p>
            </div>
            <div className="py-4">
              <h3 className="text-4xl font-display font-bold text-primary mb-2">$500k+</h3>
              <p className="text-muted-foreground font-medium">Distributed Volume</p>
            </div>
            <div className="py-4">
              <h3 className="text-4xl font-display font-bold text-primary mb-2">24/7</h3>
              <p className="text-muted-foreground font-medium">Automated Payouts</p>
            </div>
          </div>
        </div>
      </section>

      {/* Boards Preview */}
      <section id="boards" className="py-24 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-display font-bold mb-4">7 Levels of Growth</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">Progress through our unique board system. Each completed board multiplies your initial entry and automatically upgrades you to the next tier.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { id: 'F', name: 'Starter', fee: 2, gain: 16, color: 'from-gray-500 to-gray-700' },
              { id: 'E', name: 'Bronze', fee: 8, gain: 64, color: 'from-amber-600 to-amber-800' },
              { id: 'D', name: 'Silver', fee: 32, gain: 256, color: 'from-slate-300 to-slate-500 text-slate-900' },
              { id: 'C', name: 'Gold', fee: 128, gain: 1024, color: 'from-yellow-400 to-yellow-600' },
            ].map((board) => (
              <div key={board.id} className="bg-card border border-border rounded-3xl p-6 hover:-translate-y-2 hover:shadow-xl transition-all duration-300 group">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${board.color} flex items-center justify-center text-2xl font-bold font-display shadow-lg mb-6 group-hover:scale-110 transition-transform`}>
                  {board.id}
                </div>
                <h3 className="text-xl font-bold mb-1">{board.name} Board</h3>
                <p className="text-muted-foreground text-sm mb-6">Entry: ${board.fee}</p>
                <div className="pt-6 border-t border-border flex justify-between items-end">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total Gain</p>
                    <p className="text-2xl font-display font-bold text-primary">${board.gain}</p>
                  </div>
                  <ChevronRight className="text-muted-foreground w-5 h-5 group-hover:text-primary transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-6 h-6 invert brightness-0 opacity-50" />
            <span className="font-display font-bold text-muted-foreground">Ecrossflow © 2026</span>
          </div>
          <p className="text-sm text-muted-foreground text-center md:text-left max-w-md">
            Ecrossflow is a community donation platform. Past performance does not guarantee future results. Participate responsibly.
          </p>
        </div>
      </footer>
    </div>
  );
}
