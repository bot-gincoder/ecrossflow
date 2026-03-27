import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { useLogin, useRegister } from '@workspace/api-client-react';
import type { RegisterRequest } from '@workspace/api-client-react';
import { useAppStore } from '@/hooks/use-store';
import { GoogleSignInButton } from '@/components/google-sign-in-button';
import {
  Loader2, ArrowRight, ShieldCheck, Mail, Lock, User, Hash,
  Check, X, Eye, EyeOff, Phone, AlertTriangle, ChevronDown,
  Smartphone
} from 'lucide-react';

// ── Country codes list ──────────────────────────────────────────────────────
const COUNTRY_CODES = [
  { code: '+509', flag: '🇭🇹', name: 'Haïti' },
  { code: '+1', flag: '🇺🇸', name: 'USA / Canada' },
  { code: '+33', flag: '🇫🇷', name: 'France' },
  { code: '+32', flag: '🇧🇪', name: 'Belgique' },
  { code: '+41', flag: '🇨🇭', name: 'Suisse' },
  { code: '+44', flag: '🇬🇧', name: 'UK' },
  { code: '+34', flag: '🇪🇸', name: 'Espagne' },
  { code: '+1809', flag: '🇩🇴', name: 'Rép. Dominicaine' },
  { code: '+590', flag: '🇬🇵', name: 'Guadeloupe' },
  { code: '+596', flag: '🇲🇶', name: 'Martinique' },
  { code: '+594', flag: '🇬🇫', name: 'Guyane' },
  { code: '+1868', flag: '🇹🇹', name: 'Trinidad' },
  { code: '+55', flag: '🇧🇷', name: 'Brésil' },
  { code: '+1876', flag: '🇯🇲', name: 'Jamaïque' },
  { code: '+212', flag: '🇲🇦', name: 'Maroc' },
  { code: '+225', flag: '🇨🇮', name: "Côte d'Ivoire" },
  { code: '+237', flag: '🇨🇲', name: 'Cameroun' },
  { code: '+221', flag: '🇸🇳', name: 'Sénégal' },
  { code: '+243', flag: '🇨🇩', name: 'Congo RDC' },
  { code: '+49', flag: '🇩🇪', name: 'Allemagne' },
  { code: '+39', flag: '🇮🇹', name: 'Italie' },
  { code: '+351', flag: '🇵🇹', name: 'Portugal' },
  { code: '+57', flag: '🇨🇴', name: 'Colombie' },
  { code: '+52', flag: '🇲🇽', name: 'Mexique' },
  { code: '+54', flag: '🇦🇷', name: 'Argentine' },
];

// ── Password strength ──────────────────────────────────────────────────────
function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: 'Faible', color: 'bg-red-500' };
  if (score <= 2) return { score, label: 'Moyen', color: 'bg-yellow-500' };
  if (score <= 3) return { score, label: 'Bon', color: 'bg-blue-500' };
  return { score, label: 'Fort', color: 'bg-green-500' };
}

// ── Constants ────────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_ID_RE = /^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/;

interface GoogleNewUser {
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  idToken: string;
}

// ── OTP Method Modal ─────────────────────────────────────────────────────────
type OtpMethod = 'email' | 'sms';

interface OTPMethodModalProps {
  email: string;
  token: string;
  onDone: (method: OtpMethod) => void;
}

function OTPMethodModal({ email, token, onDone }: OTPMethodModalProps) {
  const [selected, setSelected] = useState<OtpMethod>('email');
  const [sending, setSending] = useState(false);
  const [smsAvailable, setSmsAvailable] = useState(false);
  const [phonePresent, setPhonePresent] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadOptions = async () => {
      try {
        const base = import.meta.env.BASE_URL.replace(/\/$/, "");
        const res = await fetch(`${base}/api/auth/otp-delivery-options`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json() as {
          methods?: {
            sms?: { available?: boolean };
          };
          phonePresent?: boolean;
        };
        if (!mounted) return;
        setSmsAvailable(Boolean(data.methods?.sms?.available));
        setPhonePresent(Boolean(data.phonePresent));
      } catch {
        // keep email-only mode on failure
      }
    };
    void loadOptions();
    return () => { mounted = false; };
  }, [token]);

  const methods: { key: OtpMethod; label: string; desc: string; icon: React.ReactNode; available: boolean }[] = [
    {
      key: 'email',
      label: 'Email',
      desc: email,
      icon: <Mail className="w-5 h-5" />,
      available: true,
    },
    {
      key: 'sms',
      label: 'SMS',
      desc: smsAvailable
        ? 'Via votre numéro de téléphone'
        : phonePresent
        ? 'Indisponible temporairement'
        : 'Ajoutez un numéro de téléphone',
      icon: <Smartphone className="w-5 h-5" />,
      available: smsAvailable,
    },
  ];

  const handleContinue = async () => {
    setSending(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      await fetch(`${base}/api/auth/send-otp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ method: selected }),
      });
    } catch {
      // best-effort
    }
    onDone(selected);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        className="bg-card border border-border rounded-3xl p-6 max-w-sm w-full shadow-2xl"
      >
        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-7 h-7 text-primary" />
          </div>
          <h3 className="text-lg font-display font-bold">Vérification de compte</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Comment voulez-vous recevoir votre code de vérification ?
          </p>
        </div>

        <div className="space-y-2 mb-5">
          {methods.map(m => (
            <button
              key={m.key}
              type="button"
              disabled={!m.available}
              onClick={() => m.available && setSelected(m.key)}
              className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all ${
                selected === m.key && m.available
                  ? 'border-primary bg-primary/10'
                  : m.available
                  ? 'border-border hover:border-primary/40 hover:bg-primary/5'
                  : 'border-border/40 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className={`shrink-0 ${selected === m.key && m.available ? 'text-primary' : 'text-muted-foreground'}`}>
                {m.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm ${selected === m.key && m.available ? 'text-primary' : ''}`}>
                  {m.label}
                  {!m.available && <span className="ml-2 text-xs font-normal text-muted-foreground">Bientôt</span>}
                </p>
                <p className="text-xs text-muted-foreground truncate">{m.desc}</p>
              </div>
              {selected === m.key && m.available && (
                <Check className="w-4 h-4 text-primary shrink-0" />
              )}
            </button>
          ))}
        </div>

        <button
          onClick={handleContinue}
          disabled={sending}
          className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(0,255,170,0.3)] transition-all disabled:opacity-70"
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-5 h-5" /> Envoyer le code</>}
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AuthPage() {
  const [location, setLocation] = useLocation();
  const isLogin = location === '/auth/login';
  const { setToken, language } = useAppStore();

  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const refFromUrl = urlParams.get('ref') || '';

  // Form state
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', username: '', email: '', emailConfirm: '',
    password: '', passwordConfirm: '', referralCode: refFromUrl, phone: ''
  });
  const [countryCode, setCountryCode] = useState('+509');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // OTP modal state
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [registeredUser, setRegisteredUser] = useState<{ email: string; token: string } | null>(null);

  // Auth state
  const [usernameState, setUsernameState] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [referralState, setReferralState] = useState<{ status: 'idle' | 'checking' | 'valid' | 'invalid'; name?: string }>({ status: 'idle' });
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [googleNewUser, setGoogleNewUser] = useState<GoogleNewUser | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const passwordStrength = getPasswordStrength(formData.password);

  // ── Username check ─────────────────────────────────────────────────────────
  const checkUsername = useCallback(async (username: string) => {
    if (!username || username.length < 3) { setUsernameState('idle'); return; }
    setUsernameState('checking');
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/auth/check-username?username=${encodeURIComponent(username)}`);
      const data = await res.json() as { available: boolean };
      setUsernameState(data.available ? 'available' : 'taken');
    } catch { setUsernameState('idle'); }
  }, []);

  // ── Referral check ─────────────────────────────────────────────────────────
  const checkReferral = useCallback(async (code: string) => {
    if (!code || code.length < 6) { setReferralState({ status: 'idle' }); return; }
    setReferralState({ status: 'checking' });
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/auth/verify-referral?code=${encodeURIComponent(code)}`);
      if (res.ok) {
        const data = await res.json() as { valid: boolean; referrerName: string };
        setReferralState({ status: 'valid', name: data.referrerName });
      } else {
        const errData = await res.json() as { message?: string };
        setReferralState({ status: 'invalid', name: errData?.message });
      }
    } catch { setReferralState({ status: 'idle' }); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { if (!isLogin && formData.username) checkUsername(formData.username); }, 400);
    return () => clearTimeout(t);
  }, [formData.username, isLogin, checkUsername]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!isLogin && formData.referralCode && formData.referralCode.length >= 6) checkReferral(formData.referralCode);
    }, 500);
    return () => clearTimeout(t);
  }, [formData.referralCode, isLogin, checkReferral]);

  useEffect(() => { if (refFromUrl && refFromUrl.length >= 6) checkReferral(refFromUrl); }, []);

  useEffect(() => {
    if (googleNewUser && formData.referralCode.length >= 6) checkReferral(formData.referralCode);
  }, [formData.referralCode, googleNewUser]);

  // ── Login mutation ─────────────────────────────────────────────────────────
  const { mutate: login, isPending: isLoginPending, error: loginError } = useLogin({
    mutation: {
      onSuccess: (data) => { setToken(data.token); setLocation('/dashboard'); },
      onError: (error) => {
        const data = error?.data as { code?: string; email?: string; verificationToken?: string } | undefined;
        if (data?.code === 'EMAIL_NOT_VERIFIED' && data?.email) {
          setPendingEmail(data.email);
          if (data.verificationToken) {
            setToken(data.verificationToken);
            setLocation(`/auth/verify-email?email=${encodeURIComponent(data.email)}`);
          }
        }
      }
    }
  });

  // ── Register mutation ──────────────────────────────────────────────────────
  const { mutate: register, isPending: isRegisterPending, error: registerError } = useRegister({
    mutation: {
      onSuccess: async (data) => {
        setToken(data.token);
        // Show OTP method selection modal instead of auto-sending
        setRegisteredUser({ email: data.user.email, token: data.token });
        setShowOTPModal(true);
      }
    }
  });

  // ── Google auth ────────────────────────────────────────────────────────────
  const handleGoogleSuccess = useCallback(async (accessToken: string) => {
    setIsGoogleLoading(true);
    setGoogleError(null);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const payload: { accessToken: string; referralCode?: string; phone?: string; preferredLanguage?: string } = { accessToken };
      if (!isLogin && referralState.status === 'valid' && formData.referralCode) {
        payload.referralCode = formData.referralCode;
        if (formData.phone) payload.phone = `${countryCode}${formData.phone}`;
        payload.preferredLanguage = language;
      }
      const res = await fetch(`${base}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as {
        code?: string; token?: string; email?: string;
        firstName?: string; lastName?: string; avatarUrl?: string | null;
        error?: string; message?: string;
      };

      if (data.code === 'GOOGLE_NEW_USER') {
        setGoogleNewUser({
          email: data.email!, firstName: data.firstName || '',
          lastName: data.lastName || '', avatarUrl: data.avatarUrl || null, idToken: accessToken,
        });
        setFormData(prev => ({ ...prev, firstName: data.firstName || '', lastName: data.lastName || '', email: data.email || '' }));
        if (!isLogin) setLocation('/auth/register');
      } else if (data.code === 'EMAIL_NOT_VERIFIED' && data.email) {
        setPendingEmail(data.email);
        setLocation(`/auth/check-email?email=${encodeURIComponent(data.email)}`);
      } else if (data.token) {
        setToken(data.token);
        setLocation('/dashboard');
      } else {
        setGoogleError(data.message || 'Erreur de connexion Google');
      }
    } catch { setGoogleError('Erreur réseau. Réessayez.'); }
    finally { setIsGoogleLoading(false); }
  }, [countryCode, formData.phone, formData.referralCode, isLogin, language, referralState.status, setLocation, setToken]);

  const handleGoogleNewUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleNewUser || referralState.status !== 'valid') return;
    setIsGoogleLoading(true);
    setGoogleError(null);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const fullPhone = formData.phone ? `${countryCode}${formData.phone}` : undefined;
      const res = await fetch(`${base}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: googleNewUser.idToken,
          referralCode: formData.referralCode,
          phone: fullPhone,
          preferredLanguage: language,
        }),
      });
      const data = await res.json() as { token?: string; code?: string; email?: string; message?: string };
      if (data.token) {
        setToken(data.token);
        setLocation('/dashboard');
      } else if (data.code === 'EMAIL_NOT_VERIFIED' && data.email) {
        setPendingEmail(data.email);
        setGoogleNewUser(null);
        setLocation(`/auth/check-email?email=${encodeURIComponent(data.email)}`);
      } else {
        setGoogleError(data.message || 'Erreur lors de la création du compte');
      }
    } catch { setGoogleError('Erreur réseau. Réessayez.'); }
    finally { setIsGoogleLoading(false); }
  };

  // ── Form submit ────────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (isLogin) {
      login({ data: { emailOrUsername: formData.email, password: formData.password } });
      return;
    }

    // Register validations
    if (usernameState === 'taken') return;
    if (referralState.status !== 'valid') return;

    if (formData.email.toLowerCase() !== formData.emailConfirm.toLowerCase()) {
      setValidationError("Les adresses email ne correspondent pas.");
      return;
    }
    if (formData.password !== formData.passwordConfirm) {
      setValidationError("Les mots de passe ne correspondent pas.");
      return;
    }

    const fullPhone = formData.phone ? `${countryCode}${formData.phone}` : undefined;

    const registerData: RegisterRequest = {
      firstName: formData.firstName,
      lastName: formData.lastName,
      username: formData.username,
      email: formData.email,
      password: formData.password,
      referralCode: formData.referralCode,
      phone: fullPhone,
    };
    register({ data: registerData });
  };

  const handleOTPDone = (method: OtpMethod) => {
    setShowOTPModal(false);
    if (registeredUser) {
      setLocation(`/auth/verify-email?email=${encodeURIComponent(registeredUser.email)}`);
    }
  };

  // ── Errors ─────────────────────────────────────────────────────────────────
  const loginErrorMsg = loginError?.data?.message || loginError?.message;
  const registerErrorMsg = registerError?.data?.message || registerError?.message;
  const activeErrorMsg = isLogin ? loginErrorMsg : registerErrorMsg;
  const isGoogleConfigured = GOOGLE_CLIENT_ID_RE.test(GOOGLE_CLIENT_ID);
  const isGoogleRegisterBlocked = !isLogin && referralState.status !== 'valid';

  // Referral invalid message (custom from backend for ECFSTART)
  const referralInvalidMsg = referralState.status === 'invalid' && (referralState as any).name
    ? (referralState as any).name as string
    : 'Code de parrainage invalide';

  return (
    <div className="min-h-screen flex bg-background selection:bg-primary/30">

      {/* OTP Method Modal */}
      <AnimatePresence>
        {showOTPModal && registeredUser && (
          <OTPMethodModal
            email={registeredUser.email}
            token={registeredUser.token}
            onDone={handleOTPDone}
          />
        )}
      </AnimatePresence>

      {/* ── Left Image Panel ───────────────────────────────────────────── */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden bg-card items-center justify-center border-r border-border">
        <img
          src={`${import.meta.env.BASE_URL}images/auth-bg.png`}
          alt="Auth background"
          className="absolute inset-0 w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background/20 to-background" />
        <div className="relative z-10 max-w-md p-12">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-8 shadow-2xl box-glow">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-8 h-8 invert brightness-0" />
          </div>
          <h2 className="text-4xl font-display font-bold mb-6 text-glow">
            Unlock the power of collective giving.
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Join thousands of members building sustainable wealth through structured community boards and total transparency.
          </p>
          {!isLogin && (
            <div className="mt-8 grid grid-cols-2 gap-3">
              {[
                { icon: '🏆', label: '7 Boards', sub: 'F → S' },
                { icon: '🌍', label: '4 Langues', sub: 'FR · EN · ES · HT' },
                { icon: '💰', label: 'Multi-devises', sub: 'USD · HTG · EUR…' },
                { icon: '🔐', label: 'OTP sécurisé', sub: 'Email · SMS · WhatsApp' },
              ].map(f => (
                <div key={f.label} className="p-3 rounded-xl bg-card/50 border border-border/50">
                  <span className="text-xl">{f.icon}</span>
                  <p className="text-sm font-semibold mt-1">{f.label}</p>
                  <p className="text-xs text-muted-foreground">{f.sub}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right Form Panel ───────────────────────────────────────────── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative overflow-y-auto">
        <div className="w-full max-w-md py-6">

          <div className="lg:hidden w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-8 mx-auto">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-6 h-6 invert brightness-0" />
          </div>

          <div className="mb-8 text-center lg:text-left">
            <h1 className="text-3xl font-display font-bold mb-2">
              {isLogin ? 'Bon retour !' : 'Créer un compte'}
            </h1>
            <p className="text-muted-foreground">
              {isLogin ? 'Connectez-vous pour accéder à votre espace.' : 'Rejoignez la communauté Ecrossflow.'}
            </p>
          </div>

          {/* Error banner */}
          {(activeErrorMsg || googleError || validationError) && !pendingEmail && (
            <div className="p-4 mb-6 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <p>{googleError || validationError || activeErrorMsg}</p>
            </div>
          )}

          {/* Email not verified notice */}
          {pendingEmail && (
            <div className="p-4 mb-6 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 text-sm">
              <p className="font-semibold mb-1">Vérification requise</p>
              <p className="mb-3 text-xs opacity-90">Votre compte n'est pas encore vérifié. Consultez votre boîte mail et utilisez le lien de confirmation.</p>
              <button
                onClick={() => setLocation(`/auth/verify-email?email=${encodeURIComponent(pendingEmail)}`)}
                className="text-xs font-semibold underline hover:no-underline"
              >
                Accéder à la vérification OTP →
              </button>
            </div>
          )}

          {/* ── GOOGLE NEW USER FLOW ─────────────────────────────────── */}
          {googleNewUser ? (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-sm flex items-start gap-3">
                {googleNewUser.avatarUrl && (
                  <img src={googleNewUser.avatarUrl} alt="avatar" className="w-10 h-10 rounded-full shrink-0" />
                )}
                <div>
                  <p className="font-semibold text-foreground">{googleNewUser.firstName} {googleNewUser.lastName}</p>
                  <p className="text-muted-foreground text-xs">{googleNewUser.email}</p>
                  <p className="text-blue-500 text-xs mt-1">Compte Google détecté — entrez votre code de parrainage pour finaliser.</p>
                </div>
              </div>

              <form onSubmit={handleGoogleNewUserSubmit} className="space-y-5">
                {/* Phone with country code */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground ml-1">Téléphone</label>
                  <div className="flex gap-2">
                    <div className="relative">
                      <select
                        value={countryCode}
                        onChange={e => setCountryCode(e.target.value)}
                        className="appearance-none bg-card border border-border rounded-xl py-3 pl-3 pr-7 text-sm focus:ring-2 focus:ring-primary/50 outline-none cursor-pointer"
                      >
                        {COUNTRY_CODES.map(c => (
                          <option key={`${c.code}-${c.name}`} value={c.code}>
                            {c.flag} {c.code}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-3.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    </div>
                    <input
                      type="tel" autoComplete="tel"
                      className="flex-1 bg-card border border-border rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                      placeholder="3777-8888"
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </div>

                {/* Referral code */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground ml-1">Code de parrainage (obligatoire)</label>
                  <div className="relative">
                    <Hash className={`absolute left-3.5 top-3.5 w-5 h-5 ${referralState.status === 'valid' ? 'text-green-500' : referralState.status === 'invalid' ? 'text-destructive' : 'text-primary'}`} />
                    <input
                      required type="text"
                      className={`w-full border rounded-xl py-3 pl-11 pr-10 focus:ring-2 outline-none transition-all font-mono uppercase ${
                        referralState.status === 'valid' ? 'bg-green-500/5 border-green-500 focus:ring-green-500/30 text-green-600 dark:text-green-400' :
                        referralState.status === 'invalid' ? 'bg-destructive/5 border-destructive focus:ring-destructive/30 text-destructive' :
                        'bg-primary/5 border-primary/30 focus:ring-primary text-primary'
                      }`}
                      placeholder="ECFXXXXXX"
                      value={formData.referralCode}
                      onChange={e => setFormData({ ...formData, referralCode: e.target.value.toUpperCase() })}
                    />
                    <span className="absolute right-3.5 top-3.5">
                      {referralState.status === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                      {referralState.status === 'valid' && <Check className="w-4 h-4 text-green-500" />}
                      {referralState.status === 'invalid' && <X className="w-4 h-4 text-destructive" />}
                    </span>
                  </div>
                  {referralState.status === 'valid' && referralState.name && (
                    <p className="text-xs text-green-500 ml-1">Parrainé par <span className="font-semibold">{referralState.name}</span> ✓</p>
                  )}
                  {referralState.status === 'invalid' && (
                    <p className="text-xs text-destructive ml-1">{referralInvalidMsg}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isGoogleLoading || referralState.status !== 'valid'}
                  className="w-full bg-primary text-primary-foreground py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(0,255,170,0.3)] transition-all hover:-translate-y-0.5 disabled:opacity-70 disabled:transform-none disabled:cursor-not-allowed"
                >
                  {isGoogleLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Créer mon compte <ArrowRight className="w-5 h-5" /></>}
                </button>
                <button type="button" onClick={() => setGoogleNewUser(null)} className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors">
                  ← Retour au formulaire classique
                </button>
              </form>
            </div>
          ) : (
            /* ── STANDARD FORM ───────────────────────────────────────── */
            <>
              {/* Google auth button */}
              <div className="mb-6">
                {isGoogleConfigured ? (
                  <>
                    <GoogleSignInButton
                      label={isLogin ? 'Connexion avec Google' : 'Inscription avec Google'}
                      isLoading={isGoogleLoading}
                      disabled={isGoogleRegisterBlocked}
                      disabledTitle={isGoogleRegisterBlocked ? "Renseignez d'abord un code de parrainage valide" : undefined}
                      onSuccess={(accessToken) => { setGoogleError(null); handleGoogleSuccess(accessToken); }}
                      onError={() => setGoogleError('Connexion Google annulée ou échouée.')}
                    />
                    {isGoogleRegisterBlocked && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        L'inscription Google est désactivée tant que le code de parrainage n'est pas valide.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-card border border-border/50 rounded-xl text-sm text-muted-foreground opacity-60 cursor-not-allowed">
                    <AlertTriangle className="w-4 h-4" />
                    Google Auth non configuré (VITE_GOOGLE_CLIENT_ID requis)
                  </div>
                )}
                <div className="flex items-center gap-4 mt-5">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">ou</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">

                {/* ── Registration-only fields ─────────────────────── */}
                {!isLogin && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground ml-1">Prénom</label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-3.5 w-5 h-5 text-muted-foreground" />
                        <input
                          required type="text" autoComplete="given-name"
                          className="w-full bg-card border border-border rounded-xl py-3 pl-11 pr-4 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                          placeholder="Jean"
                          value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground ml-1">Nom</label>
                      <input
                        required type="text" autoComplete="family-name"
                        className="w-full bg-card border border-border rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                        placeholder="Dupont"
                        value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <label className="text-sm font-medium text-foreground ml-1">Nom d'utilisateur</label>
                      <div className="relative">
                        <span className="absolute left-4 top-3.5 text-muted-foreground font-mono">@</span>
                        <input
                          required type="text" autoComplete="username"
                          className={`w-full bg-card border rounded-xl py-3 pl-9 pr-10 focus:ring-2 outline-none transition-all ${
                            usernameState === 'available' ? 'border-green-500 focus:ring-green-500/30' :
                            usernameState === 'taken' ? 'border-destructive focus:ring-destructive/30' :
                            'border-border focus:ring-primary/50 focus:border-primary'
                          }`}
                          placeholder="jeandupont"
                          value={formData.username}
                          onChange={e => setFormData({ ...formData, username: e.target.value.toLowerCase() })}
                        />
                        <span className="absolute right-3.5 top-3.5">
                          {usernameState === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                          {usernameState === 'available' && <Check className="w-4 h-4 text-green-500" />}
                          {usernameState === 'taken' && <X className="w-4 h-4 text-destructive" />}
                        </span>
                      </div>
                      {usernameState === 'taken' && <p className="text-xs text-destructive ml-1">Ce nom d'utilisateur est déjà pris</p>}
                      {usernameState === 'available' && <p className="text-xs text-green-500 ml-1">Disponible ✓</p>}
                    </div>
                  </div>
                )}

                {/* ── Email ─────────────────────────────────────────── */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground ml-1">
                    {isLogin ? "Email ou Nom d'utilisateur" : 'Adresse email'}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3.5 w-5 h-5 text-muted-foreground" />
                    <input
                      required type={isLogin ? "text" : "email"}
                      autoComplete={isLogin ? "username" : "email"}
                      className="w-full bg-card border border-border rounded-xl py-3 pl-11 pr-4 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                      placeholder={isLogin ? "jeandupont" : "nom@exemple.com"}
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                </div>

                {/* ── Confirm Email (registration only) ─────────────── */}
                {!isLogin && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground ml-1">Confirmer l'email</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3.5 w-5 h-5 text-muted-foreground" />
                      <input
                        required type="email" autoComplete="off"
                        className={`w-full bg-card border rounded-xl py-3 pl-11 pr-10 focus:ring-2 outline-none transition-all ${
                          formData.emailConfirm && formData.email.toLowerCase() !== formData.emailConfirm.toLowerCase()
                            ? 'border-destructive focus:ring-destructive/30'
                            : formData.emailConfirm && formData.email.toLowerCase() === formData.emailConfirm.toLowerCase()
                            ? 'border-green-500 focus:ring-green-500/30'
                            : 'border-border focus:ring-primary/50 focus:border-primary'
                        }`}
                        placeholder="Répétez votre email"
                        value={formData.emailConfirm}
                        onChange={e => { setFormData({ ...formData, emailConfirm: e.target.value }); setValidationError(null); }}
                      />
                      {formData.emailConfirm && (
                        <span className="absolute right-3.5 top-3.5">
                          {formData.email.toLowerCase() === formData.emailConfirm.toLowerCase()
                            ? <Check className="w-4 h-4 text-green-500" />
                            : <X className="w-4 h-4 text-destructive" />}
                        </span>
                      )}
                    </div>
                    {formData.emailConfirm && formData.email.toLowerCase() !== formData.emailConfirm.toLowerCase() && (
                      <p className="text-xs text-destructive ml-1">Les emails ne correspondent pas</p>
                    )}
                  </div>
                )}

                {/* ── Phone with country code (registration only) ────── */}
                {!isLogin && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground ml-1">Téléphone</label>
                    <div className="flex gap-2">
                      <div className="relative shrink-0">
                        <select
                          value={countryCode}
                          onChange={e => setCountryCode(e.target.value)}
                          className="appearance-none bg-card border border-border rounded-xl py-3 pl-3 pr-7 text-sm focus:ring-2 focus:ring-primary/50 outline-none cursor-pointer h-full"
                        >
                          {COUNTRY_CODES.map(c => (
                            <option key={`${c.code}-${c.name}`} value={c.code}>
                              {c.flag} {c.code}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      </div>
                      <div className="relative flex-1">
                        <Phone className="absolute left-3.5 top-3.5 w-5 h-5 text-muted-foreground" />
                        <input
                          required type="tel" autoComplete="tel"
                          className="w-full bg-card border border-border rounded-xl py-3 pl-11 pr-4 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                          placeholder="3777-8888"
                          value={formData.phone}
                          onChange={e => setFormData({ ...formData, phone: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Password ──────────────────────────────────────── */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center ml-1">
                    <label className="text-sm font-medium text-foreground">Mot de passe</label>
                    {isLogin && <a href="#" className="text-xs text-primary hover:underline">Mot de passe oublié ?</a>}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3.5 w-5 h-5 text-muted-foreground" />
                    <input
                      required type={showPassword ? "text" : "password"}
                      autoComplete={isLogin ? "current-password" : "new-password"}
                      className="w-full bg-card border border-border rounded-xl py-3 pl-11 pr-11 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={e => { setFormData({ ...formData, password: e.target.value }); setValidationError(null); }}
                    />
                    <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-3.5 top-3.5 text-muted-foreground hover:text-foreground transition-colors">
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {!isLogin && formData.password && (
                    <div className="mt-2 space-y-1">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map(i => (
                          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= passwordStrength.score ? passwordStrength.color : 'bg-border'}`} />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground ml-1">
                        Force : <span className={`font-semibold ${passwordStrength.score >= 4 ? 'text-green-500' : passwordStrength.score >= 3 ? 'text-blue-500' : passwordStrength.score >= 2 ? 'text-yellow-500' : 'text-red-500'}`}>{passwordStrength.label}</span>
                        {passwordStrength.score < 3 && ' — ajoutez des majuscules, chiffres et symboles'}
                      </p>
                    </div>
                  )}
                </div>

                {/* ── Confirm Password (registration only) ─────────── */}
                {!isLogin && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground ml-1">Confirmer le mot de passe</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3.5 w-5 h-5 text-muted-foreground" />
                      <input
                        required type={showPasswordConfirm ? "text" : "password"}
                        autoComplete="new-password"
                        className={`w-full bg-card border rounded-xl py-3 pl-11 pr-11 focus:ring-2 outline-none transition-all ${
                          formData.passwordConfirm && formData.password !== formData.passwordConfirm
                            ? 'border-destructive focus:ring-destructive/30'
                            : formData.passwordConfirm && formData.password === formData.passwordConfirm
                            ? 'border-green-500 focus:ring-green-500/30'
                            : 'border-border focus:ring-primary/50 focus:border-primary'
                        }`}
                        placeholder="Répétez votre mot de passe"
                        value={formData.passwordConfirm}
                        onChange={e => { setFormData({ ...formData, passwordConfirm: e.target.value }); setValidationError(null); }}
                      />
                      <button type="button" onClick={() => setShowPasswordConfirm(s => !s)} className="absolute right-3.5 top-3.5 text-muted-foreground hover:text-foreground transition-colors">
                        {showPasswordConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    {formData.passwordConfirm && formData.password !== formData.passwordConfirm && (
                      <p className="text-xs text-destructive ml-1">Les mots de passe ne correspondent pas</p>
                    )}
                    {formData.passwordConfirm && formData.password === formData.passwordConfirm && formData.password && (
                      <p className="text-xs text-green-500 ml-1">Mots de passe identiques ✓</p>
                    )}
                  </div>
                )}

                {/* ── Referral code (registration only) ────────────── */}
                {!isLogin && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground ml-1">Code de parrainage (obligatoire)</label>
                    <div className="relative">
                      <Hash className={`absolute left-3.5 top-3.5 w-5 h-5 ${referralState.status === 'valid' ? 'text-green-500' : referralState.status === 'invalid' ? 'text-destructive' : 'text-primary'}`} />
                      <input
                        required type="text"
                        className={`w-full border rounded-xl py-3 pl-11 pr-10 focus:ring-2 outline-none transition-all font-mono uppercase ${
                          referralState.status === 'valid' ? 'bg-green-500/5 border-green-500 focus:ring-green-500/30 text-green-600 dark:text-green-400' :
                          referralState.status === 'invalid' ? 'bg-destructive/5 border-destructive focus:ring-destructive/30 text-destructive' :
                          'bg-primary/5 border-primary/30 focus:ring-primary text-primary'
                        }`}
                        placeholder="ECFXXXXXX"
                        value={formData.referralCode}
                        onChange={e => setFormData({ ...formData, referralCode: e.target.value.toUpperCase() })}
                      />
                      <span className="absolute right-3.5 top-3.5">
                        {referralState.status === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                        {referralState.status === 'valid' && <Check className="w-4 h-4 text-green-500" />}
                        {referralState.status === 'invalid' && <X className="w-4 h-4 text-destructive" />}
                      </span>
                    </div>
                    {referralState.status === 'valid' && referralState.name && (
                      <p className="text-xs text-green-500 ml-1">Parrainé par <span className="font-semibold">{referralState.name}</span> ✓</p>
                    )}
                    {referralState.status === 'invalid' && (
                      <p className="text-xs text-destructive ml-1">{referralInvalidMsg}</p>
                    )}
                    <p className="text-xs text-muted-foreground ml-1">
                      Demandez le code à votre parrain pour vous inscrire.
                    </p>
                  </div>
                )}

                {/* ── Submit ────────────────────────────────────────── */}
                <button
                  type="submit"
                  disabled={
                    isLoginPending || isRegisterPending ||
                    (!isLogin && (
                      usernameState === 'taken' ||
                      referralState.status !== 'valid' ||
                      (!!formData.emailConfirm && formData.email.toLowerCase() !== formData.emailConfirm.toLowerCase()) ||
                      (!!formData.passwordConfirm && formData.password !== formData.passwordConfirm)
                    ))
                  }
                  className="w-full bg-primary text-primary-foreground py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(0,255,170,0.3)] transition-all hover:-translate-y-0.5 disabled:opacity-70 disabled:transform-none disabled:cursor-not-allowed"
                >
                  {(isLoginPending || isRegisterPending)
                    ? <Loader2 className="w-5 h-5 animate-spin" />
                    : <>{isLogin ? 'Se connecter' : 'Créer mon compte'} <ArrowRight className="w-5 h-5" /></>}
                </button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-muted-foreground">
                  {isLogin ? "Pas encore de compte ? " : "Déjà un compte ? "}
                  <button
                    onClick={() => {
                      setLocation(isLogin ? '/auth/register' : '/auth/login');
                      setPendingEmail(null);
                      setGoogleNewUser(null);
                      setGoogleError(null);
                      setValidationError(null);
                    }}
                    className="text-primary font-semibold hover:underline"
                  >
                    {isLogin ? "S'inscrire maintenant" : "Se connecter"}
                  </button>
                </p>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
