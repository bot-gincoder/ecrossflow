import React, { useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { ShieldCheck, Zap, Globe, ArrowRight, ChevronRight, PlayCircle, ChevronDown } from 'lucide-react';
import { useAppStore, type Language } from '@/hooks/use-store';

const LANG_OPTIONS: { value: Language; flag: string; label: string }[] = [
  { value: 'fr', flag: '🇫🇷', label: 'FR' },
  { value: 'en', flag: '🇬🇧', label: 'EN' },
  { value: 'es', flag: '🇪🇸', label: 'ES' },
  { value: 'ht', flag: '🇭🇹', label: 'HT' },
];

export default function Landing() {
  const { language, setLanguage, t } = useAppStore();
  const [langOpen, setLangOpen] = useState(false);
  const currentLang = LANG_OPTIONS.find(l => l.value === language) || LANG_OPTIONS[0];

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
            <a href="#how-it-works" className="hover:text-foreground transition-colors">{t('nav.how_it_works')}</a>
            <a href="#boards" className="hover:text-foreground transition-colors">{t('nav.boards')}</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setLangOpen(o => !o)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border hover:border-primary/50 text-sm font-medium transition-colors"
              >
                <span>{currentLang.flag}</span>
                <span className="text-muted-foreground">{currentLang.label}</span>
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </button>
              {langOpen && (
                <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                  {LANG_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => { setLanguage(opt.value); setLangOpen(false); }}
                      className={`flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-muted transition-colors ${language === opt.value ? 'text-primary font-semibold' : 'text-foreground'}`}
                    >
                      <span>{opt.flag}</span>
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Link href="/auth/login" className="text-sm font-medium hover:text-primary transition-colors hidden sm:block">{t('auth.login')}</Link>
            <Link href="/auth/register" className="bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-semibold hover:shadow-[0_0_20px_rgba(0,255,170,0.4)] transition-all hover:-translate-y-0.5">
              {t('auth.register_now')}
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

      {/* How It Works */}
      <section id="how-it-works" className="py-24 bg-card/20 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-primary font-semibold text-sm uppercase tracking-wider mb-3 block">{t('nav.how_it_works')}</span>
            <h2 className="text-3xl lg:text-4xl font-display font-bold mb-4">{language === 'fr' ? '3 étapes pour commencer' : language === 'es' ? '3 pasos para empezar' : language === 'ht' ? '3 etap pou kòmanse' : '3 Steps to Get Started'}</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">{language === 'fr' ? 'Un processus simple et transparent pour rejoindre la communauté.' : language === 'es' ? 'Un proceso simple y transparente para unirse a la comunidad.' : language === 'ht' ? 'Yon pwosesis senp ak transparan pou rantre nan kominote a.' : 'A simple, transparent process to join the community.'}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 relative">
            <div className="hidden md:block absolute top-10 left-[calc(33%+2rem)] right-[calc(33%+2rem)] h-px bg-gradient-to-r from-primary/0 via-primary/50 to-primary/0" />
            {[
              {
                step: '01',
                icon: '🔑',
                title: language === 'fr' ? "S'inscrire" : language === 'es' ? 'Regístrate' : language === 'ht' ? 'Enskri' : 'Register',
                desc: language === 'fr' ? "Créez un compte avec un code de parrainage obligatoire. Vérifiez votre email en 60 secondes." : language === 'es' ? 'Crea una cuenta con un código de referido obligatorio. Verifica tu email en 60 segundos.' : language === 'ht' ? 'Kreye yon kont ak yon kòd parenn obligatwa. Verifye imèl ou nan 60 segonn.' : 'Create an account with a mandatory referral code. Verify your email in 60 seconds.',
              },
              {
                step: '02',
                icon: '💳',
                title: language === 'fr' ? 'Rejoindre un board' : language === 'es' ? 'Unirse a un tablero' : language === 'ht' ? 'Rantre nan yon bòd' : 'Join a Board',
                desc: language === 'fr' ? "Effectuez votre premier don de $2 (Board F). Invitez 8 membres pour compléter votre ligne et débloquer votre gain de $16." : language === 'es' ? 'Haz tu primera donación de $2 (Tablero F). Invita 8 miembros para completar tu fila y desbloquear tu ganancia de $16.' : language === 'ht' ? 'Fè premye don ou $2 (Bòd F). Envite 8 manm pou konplete liy ou epi debloke $16.' : 'Make your first $2 donation (Board F). Invite 8 members to complete your row and unlock your $16 gain.',
              },
              {
                step: '03',
                icon: '🚀',
                title: language === 'fr' ? 'Progresser automatiquement' : language === 'es' ? 'Progresar automáticamente' : language === 'ht' ? 'Avanse otomatikman' : 'Progress Automatically',
                desc: language === 'fr' ? "Quand votre board est complet, vous montez automatiquement au prochain niveau (Board E: $8, gain $64) et ainsi de suite jusqu'au Board S." : language === 'es' ? 'Cuando tu tablero está completo, subes automáticamente al siguiente nivel (Tablero E: $8, ganancia $64) y así sucesivamente hasta el Tablero S.' : language === 'ht' ? "Lè bòd ou konplete, ou monte otomatikman nan pwochèn nivo a (Bòd E: $8, gen $64) konsa jis Bòd S." : "When your board completes, you automatically advance to the next level (Board E: $8, gain $64) all the way to Board S.",
              },
            ].map((item) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="flex flex-col items-center text-center relative"
              >
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20 flex items-center justify-center text-3xl mb-6 shadow-lg">
                  {item.icon}
                </div>
                <div className="absolute top-0 right-0 w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center -mt-1 mr-8 md:mr-0 md:right-auto md:left-[calc(50%+2rem)]">
                  {item.step}
                </div>
                <h3 className="text-xl font-display font-bold mb-3">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed max-w-xs">{item.desc}</p>
              </motion.div>
            ))}
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
