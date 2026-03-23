import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'midnight' | 'gold';
export type Language = 'fr' | 'en' | 'es' | 'ht';

interface AppState {
  theme: Theme;
  language: Language;
  token: string | null;
  setTheme: (theme: Theme) => void;
  setLanguage: (lang: Language) => void;
  setToken: (token: string | null) => void;
  logout: () => void;
  t: (key: string) => string;
}

// Minimal dictionary for demonstration
const translations: Record<Language, Record<string, string>> = {
  fr: {
    'nav.dashboard': 'Tableau de bord',
    'nav.wallet': 'Bourse',
    'nav.boards': 'Boards',
    'nav.history': 'Historique',
    'nav.referrals': 'Parrainage',
    'nav.admin': 'Admin',
    'wallet.balance': 'Solde Disponible',
    'wallet.pending': 'En attente',
    'wallet.reserved': 'Réservé',
    'wallet.deposit': 'Déposer',
    'wallet.withdraw': 'Retirer',
    'wallet.convert': 'Convertir',
  },
  en: {
    'nav.dashboard': 'Dashboard',
    'nav.wallet': 'Wallet',
    'nav.boards': 'Boards',
    'nav.history': 'History',
    'nav.referrals': 'Referrals',
    'nav.admin': 'Admin',
    'wallet.balance': 'Available Balance',
    'wallet.pending': 'Pending',
    'wallet.reserved': 'Reserved',
    'wallet.deposit': 'Deposit',
    'wallet.withdraw': 'Withdraw',
    'wallet.convert': 'Convert',
  },
  es: {
    'nav.dashboard': 'Panel',
    'nav.wallet': 'Billetera',
    'nav.boards': 'Tableros',
    'nav.history': 'Historial',
    'nav.referrals': 'Referidos',
    'nav.admin': 'Admin',
    'wallet.balance': 'Saldo Disponible',
    'wallet.pending': 'Pendiente',
    'wallet.reserved': 'Reservado',
    'wallet.deposit': 'Depositar',
    'wallet.withdraw': 'Retirar',
    'wallet.convert': 'Convertir',
  },
  ht: {
    'nav.dashboard': 'Dachbòd',
    'nav.wallet': 'Bous',
    'nav.boards': 'Bòd yo',
    'nav.history': 'Istwa',
    'nav.referrals': 'Parennaj',
    'nav.admin': 'Admin',
    'wallet.balance': 'Balans ki disponib',
    'wallet.pending': 'An atant',
    'wallet.reserved': 'Rezève',
    'wallet.deposit': 'Depoze',
    'wallet.withdraw': 'Retire',
    'wallet.convert': 'Konvèti',
  }
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      language: 'fr',
      token: null,
      setTheme: (theme) => {
        const root = document.documentElement;
        root.classList.remove('light', 'dark', 'midnight', 'gold');
        if (theme !== 'light') root.classList.add(theme);
        set({ theme });
      },
      setLanguage: (language) => set({ language }),
      setToken: (token) => {
        if (token) localStorage.setItem('ecrossflow_token', token);
        else localStorage.removeItem('ecrossflow_token');
        set({ token });
      },
      logout: () => {
        localStorage.removeItem('ecrossflow_token');
        set({ token: null });
      },
      t: (key) => {
        const lang = get().language;
        return translations[lang][key] || key;
      }
    }),
    { 
      name: 'ecrossflow-storage',
      partialize: (state) => ({ theme: state.theme, language: state.language, token: state.token }),
    }
  )
);
