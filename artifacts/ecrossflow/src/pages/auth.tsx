import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useLogin, useRegister } from '@workspace/api-client-react';
import type { RegisterRequest } from '@workspace/api-client-react';
import { useAppStore } from '@/hooks/use-store';
import { GoogleSignInButton } from '@/components/google-sign-in-button';
import { Loader2, ArrowRight, ShieldCheck, Mail, Lock, User, Hash, Check, X, Eye, EyeOff, Phone, AlertTriangle } from 'lucide-react';

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

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const PLATFORM_REF_CODE = import.meta.env.VITE_PLATFORM_REF_CODE || "ECFADMIN0";

interface GoogleNewUser {
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  idToken: string;
}

export default function AuthPage() {
  const [location, setLocation] = useLocation();
  const isLogin = location === '/auth/login';
  const { setToken } = useAppStore();

  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const refFromUrl = urlParams.get('ref') || '';

  const [formData, setFormData] = useState({
    firstName: '', lastName: '', username: '', email: '', password: '', referralCode: refFromUrl, phone: ''
  });
  const [showPassword, setShowPassword] = useState(false);

  const [usernameState, setUsernameState] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [referralState, setReferralState] = useState<{ status: 'idle' | 'checking' | 'valid' | 'invalid'; name?: string }>({ status: 'idle' });
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [googleNewUser, setGoogleNewUser] = useState<GoogleNewUser | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const passwordStrength = getPasswordStrength(formData.password);

  const checkUsername = useCallback(async (username: string) => {
    if (!username || username.length < 3) {
      setUsernameState('idle');
      return;
    }
    setUsernameState('checking');
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/auth/check-username?username=${encodeURIComponent(username)}`);
      const data = await res.json() as { available: boolean };
      setUsernameState(data.available ? 'available' : 'taken');
    } catch {
      setUsernameState('idle');
    }
  }, []);

  const checkReferral = useCallback(async (code: string) => {
    if (!code || code.length < 6) {
      setReferralState({ status: 'idle' });
      return;
    }
    setReferralState({ status: 'checking' });
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/auth/verify-referral?code=${encodeURIComponent(code)}`);
      if (res.ok) {
        const data = await res.json() as { valid: boolean; referrerName: string };
        setReferralState({ status: 'valid', name: data.referrerName });
      } else {
        setReferralState({ status: 'invalid' });
      }
    } catch {
      setReferralState({ status: 'idle' });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isLogin && formData.username) checkUsername(formData.username);
    }, 400);
    return () => clearTimeout(timer);
  }, [formData.username, isLogin, checkUsername]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isLogin && formData.referralCode && formData.referralCode.length >= 6) checkReferral(formData.referralCode);
    }, 500);
    return () => clearTimeout(timer);
  }, [formData.referralCode, isLogin, checkReferral]);

  useEffect(() => {
    if (refFromUrl && refFromUrl.length >= 6) {
      checkReferral(refFromUrl);
    }
  }, []);

  useEffect(() => {
    if (googleNewUser && formData.referralCode.length >= 6) {
      checkReferral(formData.referralCode);
    }
  }, [formData.referralCode, googleNewUser]);

  const { mutate: login, isPending: isLoginPending, error: loginError } = useLogin({
    mutation: {
      onSuccess: (data) => {
        setToken(data.token);
        setLocation('/dashboard');
      },
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

  const { mutate: register, isPending: isRegisterPending, error: registerError } = useRegister({
    mutation: {
      onSuccess: async (data) => {
        setToken(data.token);
        try {
          const base = import.meta.env.BASE_URL.replace(/\/$/, "");
          await fetch(`${base}/api/auth/send-otp`, {
            method: "POST",
            headers: { Authorization: `Bearer ${data.token}` },
          });
        } catch {
          // OTP send is best-effort
        }
        setLocation(`/auth/verify-email?email=${encodeURIComponent(data.user.email)}`);
      }
    }
  });

  const handleGoogleSuccess = useCallback(async (accessToken: string) => {
    setIsGoogleLoading(true);
    setGoogleError(null);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
      });
      const data = await res.json() as {
        code?: string;
        token?: string;
        email?: string;
        firstName?: string;
        lastName?: string;
        avatarUrl?: string | null;
        error?: string;
        message?: string;
      };

      if (data.code === 'GOOGLE_NEW_USER') {
        setGoogleNewUser({
          email: data.email!,
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          avatarUrl: data.avatarUrl || null,
          idToken: accessToken,
        });
        setFormData(prev => ({
          ...prev,
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email || '',
        }));
        if (!isLogin) setLocation('/auth/register');
      } else if (data.token) {
        setToken(data.token);
        setLocation('/dashboard');
      } else {
        setGoogleError(data.message || 'Erreur de connexion Google');
      }
    } catch {
      setGoogleError('Erreur réseau. Réessayez.');
    } finally {
      setIsGoogleLoading(false);
    }
  }, [isLogin, setToken, setLocation]);

  const handleGoogleNewUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleNewUser || referralState.status !== 'valid') return;
    setIsGoogleLoading(true);
    setGoogleError(null);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: googleNewUser.idToken,
          referralCode: formData.referralCode,
          phone: formData.phone || undefined,
        }),
      });
      const data = await res.json() as { token?: string; message?: string; user?: { email: string } };
      if (data.token) {
        setToken(data.token);
        setLocation('/dashboard');
      } else {
        setGoogleError(data.message || 'Erreur lors de la création du compte');
      }
    } catch {
      setGoogleError('Erreur réseau. Réessayez.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLogin) {
      login({ data: { emailOrUsername: formData.email, password: formData.password } });
    } else {
      if (usernameState === 'taken') return;
      if (referralState.status !== 'valid') return;
      const registerData: RegisterRequest = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        username: formData.username,
        email: formData.email,
        password: formData.password,
        referralCode: formData.referralCode,
        phone: formData.phone || undefined,
      };
      register({ data: registerData });
    }
  };

  const loginErrorMsg = loginError?.data?.message || loginError?.message;
  const registerErrorMsg = registerError?.data?.message || registerError?.message;
  const activeErrorMsg = isLogin ? loginErrorMsg : registerErrorMsg;

  const isGoogleConfigured = Boolean(GOOGLE_CLIENT_ID);

  return (
    <div className="min-h-screen flex bg-background selection:bg-primary/30">
      {/* Image Panel */}
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
          <h2 className="text-4xl font-display font-bold mb-6 text-glow">Unlock the power of collective giving.</h2>
          <p className="text-lg text-muted-foreground leading-relaxed">Join thousands of members building sustainable wealth through structured community boards and total transparency.</p>
          {!isLogin && (
            <div className="mt-8 p-4 rounded-xl bg-primary/10 border border-primary/20">
              <p className="text-sm text-muted-foreground mb-1">Code de démarrage de la plateforme :</p>
              <p className="font-mono font-bold text-primary text-lg tracking-widest">{PLATFORM_REF_CODE}</p>
              <p className="text-xs text-muted-foreground mt-1">Utilisez ce code si vous n'avez pas encore de parrain</p>
            </div>
          )}
        </div>
      </div>

      {/* Form Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative overflow-y-auto">
        <div className="w-full max-w-md py-6">
          
          <div className="lg:hidden w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-8 mx-auto">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-6 h-6 invert brightness-0" />
          </div>

          <div className="mb-8 text-center lg:text-left">
            <h1 className="text-3xl font-display font-bold mb-2">{isLogin ? 'Welcome back' : 'Create account'}</h1>
            <p className="text-muted-foreground">
              {isLogin ? 'Enter your credentials to access your wallet.' : 'Start your journey with just $2.'}
            </p>
          </div>

          {(activeErrorMsg || googleError) && !pendingEmail && (
            <div className="p-4 mb-6 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <p>{googleError || activeErrorMsg}</p>
            </div>
          )}

          {pendingEmail && (
            <div className="p-4 mb-6 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 text-sm">
              <p className="font-semibold mb-1">Vérification requise</p>
              <p className="mb-3 text-xs opacity-90">Votre compte n'est pas encore vérifié. Consultez votre boîte mail pour le code OTP.</p>
              <button
                onClick={() => setLocation(`/auth/verify-email?email=${encodeURIComponent(pendingEmail)}`)}
                className="text-xs font-semibold underline hover:no-underline"
              >
                Accéder à la vérification →
              </button>
            </div>
          )}

          {/* ===================== GOOGLE NEW USER FLOW ===================== */}
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
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground ml-1">Téléphone</label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-3.5 w-5 h-5 text-muted-foreground" />
                    <input
                      required type="tel" autoComplete="tel"
                      className="w-full bg-card border border-border rounded-xl py-3 pl-11 pr-4 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                      placeholder="+1 234 567 8900"
                      value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </div>

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
                      value={formData.referralCode} onChange={e => setFormData({ ...formData, referralCode: e.target.value.toUpperCase() })}
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
                    <p className="text-xs text-destructive ml-1">Code de parrainage invalide</p>
                  )}
                  <p className="text-xs text-muted-foreground ml-1">
                    Code de démarrage : <button type="button" className="font-mono text-primary hover:underline font-semibold" onClick={() => setFormData(prev => ({ ...prev, referralCode: PLATFORM_REF_CODE }))}>{PLATFORM_REF_CODE}</button>
                  </p>
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
            /* ===================== STANDARD FORM ===================== */
            <>
              {/* Google Auth Button */}
              <div className="mb-6">
                {isGoogleConfigured ? (
                  <GoogleSignInButton
                    label={isLogin ? 'Connexion avec Google' : 'Inscription avec Google'}
                    isLoading={isGoogleLoading}
                    onSuccess={(accessToken) => { setGoogleError(null); handleGoogleSuccess(accessToken); }}
                    onError={() => setGoogleError('Connexion Google annulée ou échouée.')}
                  />
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
                          value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground ml-1">Nom</label>
                      <input 
                        required type="text" autoComplete="family-name"
                        className="w-full bg-card border border-border rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                        placeholder="Dupont"
                        value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})}
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
                          value={formData.username} onChange={e => setFormData({...formData, username: e.target.value.toLowerCase()})}
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

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground ml-1">{isLogin ? 'Email ou Nom d\'utilisateur' : 'Adresse email'}</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3.5 w-5 h-5 text-muted-foreground" />
                    <input 
                      required type={isLogin ? "text" : "email"}
                      autoComplete={isLogin ? "username" : "email"}
                      className="w-full bg-card border border-border rounded-xl py-3 pl-11 pr-4 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                      placeholder={isLogin ? "jeandupont" : "nom@exemple.com"}
                      value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                </div>

                {!isLogin && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground ml-1">Téléphone</label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-3.5 w-5 h-5 text-muted-foreground" />
                      <input 
                        required type="tel" autoComplete="tel"
                        className="w-full bg-card border border-border rounded-xl py-3 pl-11 pr-4 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                        placeholder="+1 234 567 8900"
                        value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})}
                      />
                    </div>
                  </div>
                )}

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
                      value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})}
                    />
                    <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-3.5 top-3.5 text-muted-foreground hover:text-foreground transition-colors">
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {!isLogin && formData.password && (
                    <div className="mt-2 space-y-1">
                      <div className="flex gap-1">
                        {[1,2,3,4].map(i => (
                          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= passwordStrength.score ? passwordStrength.color : 'bg-border'}`} />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground ml-1">
                        Force: <span className={`font-semibold ${passwordStrength.score >= 4 ? 'text-green-500' : passwordStrength.score >= 3 ? 'text-blue-500' : passwordStrength.score >= 2 ? 'text-yellow-500' : 'text-red-500'}`}>{passwordStrength.label}</span>
                        {passwordStrength.score < 3 && ' — ajoutez des majuscules, chiffres et symboles'}
                      </p>
                    </div>
                  )}
                </div>

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
                        value={formData.referralCode} onChange={e => setFormData({...formData, referralCode: e.target.value.toUpperCase()})}
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
                      <p className="text-xs text-destructive ml-1">Code de parrainage invalide</p>
                    )}
                    <p className="text-xs text-muted-foreground ml-1">
                      Pas de code ?{' '}
                      <button
                        type="button"
                        className="font-mono text-primary hover:underline font-semibold"
                        onClick={() => setFormData(prev => ({ ...prev, referralCode: PLATFORM_REF_CODE }))}
                      >
                        Utiliser le code de la plateforme ({PLATFORM_REF_CODE})
                      </button>
                    </p>
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={isLoginPending || isRegisterPending || (!isLogin && (usernameState === 'taken' || referralState.status !== 'valid'))}
                  className="w-full bg-primary text-primary-foreground py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(0,255,170,0.3)] transition-all hover:-translate-y-0.5 disabled:opacity-70 disabled:transform-none disabled:cursor-not-allowed"
                >
                  {(isLoginPending || isRegisterPending) ? <Loader2 className="w-5 h-5 animate-spin" /> : (isLogin ? 'Se connecter' : 'Créer mon compte')}
                  {!(isLoginPending || isRegisterPending) && <ArrowRight className="w-5 h-5" />}
                </button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-muted-foreground">
                  {isLogin ? "Pas encore de compte ? " : "Déjà un compte ? "}
                  <button 
                    onClick={() => { setLocation(isLogin ? '/auth/register' : '/auth/login'); setPendingEmail(null); setGoogleNewUser(null); setGoogleError(null); }}
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
