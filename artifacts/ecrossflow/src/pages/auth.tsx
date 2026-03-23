import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useLogin, useRegister, useCheckUsername } from '@workspace/api-client-react';
import { useAppStore } from '@/hooks/use-store';
import { Loader2, ArrowRight, ShieldCheck, Mail, Lock, User, Hash } from 'lucide-react';

export default function AuthPage() {
  const [location, setLocation] = useLocation();
  const isLogin = location === '/auth/login';
  const { setToken } = useAppStore();

  const [formData, setFormData] = useState({
    firstName: '', lastName: '', username: '', email: '', password: '', referralCode: ''
  });

  const { mutate: login, isPending: isLoginPending, error: loginError } = useLogin({
    mutation: {
      onSuccess: (data) => {
        setToken(data.token);
        setLocation('/dashboard');
      }
    }
  });

  const { mutate: register, isPending: isRegisterPending, error: registerError } = useRegister({
    mutation: {
      onSuccess: (data) => {
        setToken(data.token);
        setLocation('/dashboard');
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLogin) {
      login({ data: { emailOrUsername: formData.email, password: formData.password } });
    } else {
      register({ data: formData as any });
    }
  };

  const errData = (isLogin ? loginError : registerError) as any;
  const errorMessage = errData?.response?.data?.message || errData?.message;

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
        </div>
      </div>

      {/* Form Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative">
        <div className="w-full max-w-md">
          
          <div className="lg:hidden w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-8 mx-auto">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-6 h-6 invert brightness-0" />
          </div>

          <div className="mb-10 text-center lg:text-left">
            <h1 className="text-3xl font-display font-bold mb-2">{isLogin ? 'Welcome back' : 'Create account'}</h1>
            <p className="text-muted-foreground">
              {isLogin ? 'Enter your credentials to access your wallet.' : 'Start your journey with just $2.'}
            </p>
          </div>

          {errorMessage && (
            <div className="p-4 mb-6 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-3">
               <ShieldCheck className="w-5 h-5 shrink-0" />
               <p>{errorMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground ml-1">First Name</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3.5 w-5 h-5 text-muted-foreground" />
                    <input 
                      required type="text" 
                      className="w-full bg-card border border-border rounded-xl py-3 pl-11 pr-4 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                      placeholder="John"
                      value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground ml-1">Last Name</label>
                  <input 
                    required type="text" 
                    className="w-full bg-card border border-border rounded-xl py-3 px-4 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                    placeholder="Doe"
                    value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-sm font-medium text-foreground ml-1">Username</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3.5 text-muted-foreground font-mono">@</span>
                    <input 
                      required type="text" 
                      className="w-full bg-card border border-border rounded-xl py-3 pl-9 pr-4 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                      placeholder="johndoe"
                      value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground ml-1">{isLogin ? 'Email or Username' : 'Email Address'}</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 w-5 h-5 text-muted-foreground" />
                <input 
                  required type={isLogin ? "text" : "email"}
                  className="w-full bg-card border border-border rounded-xl py-3 pl-11 pr-4 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                  placeholder={isLogin ? "johndoe" : "name@example.com"}
                  value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="text-sm font-medium text-foreground">Password</label>
                {isLogin && <a href="#" className="text-xs text-primary hover:underline">Forgot password?</a>}
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 w-5 h-5 text-muted-foreground" />
                <input 
                  required type="password" 
                  className="w-full bg-card border border-border rounded-xl py-3 pl-11 pr-4 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                  placeholder="••••••••"
                  value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})}
                />
              </div>
            </div>

            {!isLogin && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground ml-1">Referral Code (Required)</label>
                <div className="relative">
                  <Hash className="absolute left-3.5 top-3.5 w-5 h-5 text-primary" />
                  <input 
                    required type="text" 
                    className="w-full bg-primary/5 border border-primary/30 rounded-xl py-3 pl-11 pr-4 focus:ring-2 focus:ring-primary outline-none transition-all text-primary font-mono uppercase"
                    placeholder="ECF-XXXXXX"
                    value={formData.referralCode} onChange={e => setFormData({...formData, referralCode: e.target.value.toUpperCase()})}
                  />
                </div>
              </div>
            )}

            <button 
              type="submit" 
              disabled={isLoginPending || isRegisterPending}
              className="w-full bg-primary text-primary-foreground py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(0,255,170,0.3)] transition-all hover:-translate-y-0.5 disabled:opacity-70 disabled:transform-none"
            >
              {(isLoginPending || isRegisterPending) ? <Loader2 className="w-5 h-5 animate-spin" /> : (isLogin ? 'Sign In' : 'Create Account')}
              {!(isLoginPending || isRegisterPending) && <ArrowRight className="w-5 h-5" />}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-muted-foreground">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <button 
                onClick={() => setLocation(isLogin ? '/auth/register' : '/auth/login')}
                className="text-primary font-semibold hover:underline"
              >
                {isLogin ? 'Register now' : 'Log in instead'}
              </button>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
