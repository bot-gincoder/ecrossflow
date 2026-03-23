import React, { ReactNode, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, Wallet, Layers, History, Users, 
  User, Bell, Settings, LogOut, Menu, X, ShieldAlert,
  CreditCard, BarChart
} from 'lucide-react';
import { useAppStore } from '@/hooks/use-store';
import type { Theme, Language } from '@/hooks/use-store';
import { useGetMe, useLogout, getGetMeQueryKey } from '@workspace/api-client-react';

const NavLink = ({ href, icon: Icon, children, currentPath }: { href: string, icon: React.ElementType, children: ReactNode, currentPath: string }) => {
  const isActive = currentPath === href || (href !== '/' && currentPath.startsWith(href));
  
  return (
    <Link 
      href={href} 
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative overflow-hidden ${
        isActive 
          ? 'bg-primary/10 text-primary font-medium' 
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      }`}
    >
      {isActive && (
        <motion.div 
          layoutId="activeNav" 
          className="absolute left-0 top-0 w-1 h-full bg-primary"
          initial={false}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}
      <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'group-hover:scale-110 transition-transform'}`} />
      <span>{children}</span>
    </Link>
  );
};

export const AppLayout = ({ children, requireAdmin = false }: { children: ReactNode, requireAdmin?: boolean }) => {
  const [location, setLocation] = useLocation();
  const { token, logout, t, theme, setTheme, language, setLanguage } = useAppStore();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  
  const { data: user, isLoading, isError } = useGetMe({ 
    query: { 
      queryKey: getGetMeQueryKey(),
      retry: false,
      enabled: !!token
    } 
  });

  const { mutate: doLogout } = useLogout();

  useEffect(() => {
    // Apply theme on mount
    const root = document.documentElement;
    root.classList.remove('light', 'dark', 'midnight', 'gold');
    if (theme !== 'light') root.classList.add(theme);
  }, [theme]);

  useEffect(() => {
    if (!token || isError) {
      logout();
      if (location !== '/auth/login' && location !== '/auth/register' && location !== '/') {
        setLocation('/auth/login');
      }
    } else if (requireAdmin && user && user.role !== 'ADMIN') {
      setLocation('/dashboard');
    }
  }, [token, isError, location, setLocation, logout, requireAdmin, user]);

  const handleLogout = () => {
    doLogout();
    logout();
    setLocation('/auth/login');
  };

  if (isLoading && token) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  const links = requireAdmin ? [
    { href: '/admin', icon: BarChart, label: 'Vue globale' },
    { href: '/admin?tab=users', icon: Users, label: 'Utilisateurs' },
    { href: '/admin?tab=deposits', icon: CreditCard, label: 'Dépôts en attente' },
    { href: '/dashboard', icon: LayoutDashboard, label: 'Quitter Admin' },
  ] : [
    { href: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    { href: '/wallet', icon: Wallet, label: t('nav.wallet') },
    { href: '/boards', icon: Layers, label: t('nav.boards') },
    { href: '/history', icon: History, label: t('nav.history') },
    { href: '/referrals', icon: Users, label: t('nav.referrals') },
  ];

  return (
    <div className="min-h-screen bg-background flex text-foreground selection:bg-primary/30">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-72 fixed top-0 left-0 h-screen border-r border-border bg-card/50 backdrop-blur-xl z-40">
        <div className="p-6">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-all">
              <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-6 h-6 object-contain invert brightness-0" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
              ECROSSFLOW
            </span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {links.map((link) => (
            <NavLink key={link.href} href={link.href} icon={link.icon} currentPath={location}>
              {link.label}
            </NavLink>
          ))}
          
          {user?.role === 'ADMIN' && !requireAdmin && (
            <>
              <div className="my-4 border-t border-border/50 mx-4"></div>
              <NavLink href="/admin" icon={ShieldAlert} currentPath={location}>
                {t('nav.admin')}
              </NavLink>
            </>
          )}
        </div>

        <div className="p-4 border-t border-border/50 bg-card/50">
          <div className="flex items-center justify-between mb-4 px-2">
            <select 
              value={theme} 
              onChange={(e) => setTheme(e.target.value as Theme)}
              className="bg-transparent text-xs text-muted-foreground outline-none cursor-pointer"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="midnight">Midnight</option>
              <option value="gold">Gold</option>
            </select>
            <select 
              value={language} 
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="bg-transparent text-xs text-muted-foreground outline-none cursor-pointer"
            >
              <option value="fr">FR</option>
              <option value="en">EN</option>
              <option value="es">ES</option>
              <option value="ht">HT</option>
            </select>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-muted-foreground truncate">@{user?.username}</p>
            </div>
            <button onClick={handleLogout} className="p-2 text-muted-foreground hover:text-destructive transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 border-b border-border bg-card/80 backdrop-blur-xl z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
             <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-5 h-5 object-contain invert brightness-0" />
          </div>
          <span className="font-display font-bold text-lg">ECROSSFLOW</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/notifications" className="relative p-2 text-muted-foreground">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive animate-pulse" />
          </Link>
          <button onClick={() => setMobileMenuOpen(true)} className="p-2">
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/95 backdrop-blur-xl z-50 lg:hidden flex flex-col"
          >
            <div className="flex justify-between items-center p-4 border-b border-border">
              <span className="font-display font-bold text-xl">Menu</span>
              <button onClick={() => setMobileMenuOpen(false)} className="p-2 bg-muted rounded-full">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {links.map((link) => (
                <Link 
                  key={link.href} 
                  href={link.href} 
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-4 p-4 rounded-xl hover:bg-muted/50 text-lg font-medium"
                >
                  <link.icon className="w-6 h-6 text-primary" />
                  {link.label}
                </Link>
              ))}
              <button onClick={handleLogout} className="w-full flex items-center gap-4 p-4 rounded-xl text-destructive hover:bg-destructive/10 text-lg font-medium mt-4">
                <LogOut className="w-6 h-6" />
                Logout
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 lg:ml-72 pt-16 lg:pt-0 pb-20 lg:pb-0 min-h-screen flex flex-col relative overflow-x-hidden">
        {/* Desktop Top Nav elements */}
        <div className="hidden lg:flex h-20 items-center justify-end px-8 absolute top-0 right-0 w-full z-10 pointer-events-none">
           <div className="pointer-events-auto flex items-center gap-4">
              <Link href="/notifications" className="relative p-3 bg-card/50 backdrop-blur-md rounded-full border border-border/50 hover:bg-card hover:border-primary/50 transition-all shadow-sm">
                <Bell className="w-5 h-5" />
                <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-destructive shadow-[0_0_10px_rgba(255,0,0,0.8)]" />
              </Link>
           </div>
        </div>

        <div className="flex-1 p-4 md:p-8 pt-6 lg:pt-24 z-0">
          <motion.div
            key={location}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="max-w-7xl mx-auto h-full"
          >
            {children}
          </motion.div>
        </div>
      </main>

      {/* Mobile Bottom Tab Nav */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-card/90 backdrop-blur-xl border-t border-border z-40 flex items-center justify-around px-2 pb-safe">
        {[
          { href: '/dashboard', icon: LayoutDashboard },
          { href: '/boards', icon: Layers },
          { href: '/wallet', icon: Wallet },
          { href: '/history', icon: History },
          { href: '/profile', icon: User },
        ].map((tab) => {
          const isActive = location === tab.href || (tab.href !== '/' && location.startsWith(tab.href));
          return (
            <Link key={tab.href} href={tab.href} className="flex flex-col items-center justify-center w-full h-full relative">
              {isActive && <motion.div layoutId="mobileTab" className="absolute top-0 w-8 h-1 bg-primary rounded-b-full" />}
              <tab.icon className={`w-6 h-6 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
            </Link>
          );
        })}
      </div>
    </div>
  );
};
