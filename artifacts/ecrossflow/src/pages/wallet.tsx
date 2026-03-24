import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, DollarSign,
  TrendingUp, Loader2, Copy, Check, Shield, CreditCard,
  Building2, Smartphone, X, Upload, CheckCircle
} from 'lucide-react';
import {
  useGetWallet, useGetExchangeRates, useCreateDeposit, useCreateWithdrawal,
  useRequestWithdrawalOtp,
} from '@workspace/api-client-react';
import type { DepositRequestPaymentMethod, WithdrawalRequestPaymentMethod } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout';
import { useQueryClient } from '@tanstack/react-query';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe } from '@stripe/react-stripe-js';

const DEPOSIT_METHODS = [
  { value: 'MONCASH', label: 'MonCash', flag: '🇭🇹', currencies: ['HTG', 'USD'] },
  { value: 'NATCASH', label: 'NatCash', flag: '🇭🇹', currencies: ['HTG', 'USD'] },
  { value: 'BANK_TRANSFER', label: 'Virement Bancaire', flag: '🏦', currencies: ['USD', 'EUR', 'HTG'] },
  { value: 'CARD', label: 'Carte Bancaire', flag: '💳', currencies: ['USD', 'EUR'] },
  { value: 'CRYPTO', label: 'Crypto (USDT)', flag: '🪙', currencies: ['USDT', 'BTC', 'ETH'] },
];

const WITHDRAW_METHODS = [
  { value: 'MONCASH', label: 'MonCash', flag: '🇭🇹' },
  { value: 'NATCASH', label: 'NatCash', flag: '🇭🇹' },
  { value: 'BANK_TRANSFER', label: 'Virement Bancaire', flag: '🏦' },
  { value: 'CRYPTO', label: 'Crypto (USDT)', flag: '🪙' },
];

const CURRENCIES = ['USD', 'HTG', 'EUR', 'GBP', 'CAD', 'BTC', 'ETH', 'USDT'];

type Tab = 'deposit' | 'withdraw';

const MONCASH_NUMBER = '+509 3777-8888';
const MONCASH_NAME = 'Ecrossflow Platform';

const BANK_COORDS = {
  bank: 'BNC (Banque Nationale de Crédit)',
  account: '123-456-789-0',
  holder: 'Ecrossflow S.A.',
  swift: 'BNCHHTH1',
  iban: 'HT12BNC0000000123456789',
};

const CRYPTO_ADDRESS = {
  USDT: 'TXf2Ld7CKYGXjnVQ8RFc7rFxQeP3Nkp1Q',
  BTC: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  ETH: '0x742d35Cc6634C0532925a3b8D4C9a3C8b7e2a1d',
};

const stripePublicKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY as string | undefined;
const stripePromise = stripePublicKey ? loadStripe(stripePublicKey) : null;

function StripeCardForm() {
  const stripe = useStripe();
  const [cardError, setCardError] = useState('');

  return (
    <div className="bg-card/60 rounded-xl p-4 space-y-3">
      <div className="bg-background border border-border rounded-lg px-4 py-3">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#ffffff',
                '::placeholder': { color: '#6b7280' },
                fontFamily: 'monospace',
              },
              invalid: { color: '#f87171' },
            },
          }}
          onChange={(e) => {
            setCardError(e.error?.message || '');
          }}
        />
      </div>
      {cardError && <p className="text-xs text-red-400">{cardError}</p>}
      <div className="flex items-center gap-1.5 text-xs text-primary">
        <Shield className="w-3 h-3" /> Sécurisé par Stripe Elements — PCI DSS Compliant
      </div>
      {!stripe && <p className="text-xs text-muted-foreground">Chargement de Stripe...</p>}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="p-1.5 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground">
      {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

function MethodInstructions({ method, currency }: { method: string; currency: string }) {
  if (method === 'MONCASH') {
    return (
      <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-orange-400 font-semibold text-sm">
          <Smartphone className="w-4 h-4" /> Instructions MonCash
        </div>
        <ol className="text-sm text-muted-foreground space-y-2 list-decimal pl-4">
          <li>Ouvrez l'application MonCash sur votre téléphone</li>
          <li>Sélectionnez <strong className="text-foreground">Envoyer de l'argent</strong></li>
          <li>Entrez le numéro : <span className="font-mono font-bold text-foreground">{MONCASH_NUMBER}</span> <CopyButton text={MONCASH_NUMBER} /></li>
          <li>Montant en HTG (1 USD = 140 HTG)</li>
          <li>Notez votre code de transaction et entrez-le dans le champ Référence ci-dessous</li>
        </ol>
        <div className="flex items-center gap-2 bg-card/60 rounded-xl px-3 py-2">
          <span className="text-sm text-muted-foreground">Bénéficiaire :</span>
          <span className="font-semibold text-sm">{MONCASH_NAME}</span>
        </div>
      </div>
    );
  }

  if (method === 'NATCASH') {
    return (
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm">
          <Smartphone className="w-4 h-4" /> Instructions NatCash
        </div>
        <ol className="text-sm text-muted-foreground space-y-2 list-decimal pl-4">
          <li>Ouvrez l'application NatCash</li>
          <li>Sélectionnez <strong className="text-foreground">Transfert</strong></li>
          <li>Numéro destinataire : <span className="font-mono font-bold text-foreground">+509 2222-9999</span> <CopyButton text="+509 2222-9999" /></li>
          <li>Entrez le montant et confirmez avec votre PIN</li>
          <li>Copiez la référence de transaction dans le champ ci-dessous</li>
        </ol>
      </div>
    );
  }

  if (method === 'BANK_TRANSFER') {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
          <Building2 className="w-4 h-4" /> Coordonnées Bancaires
        </div>
        <div className="grid grid-cols-1 gap-2 text-sm">
          {Object.entries({
            'Banque': BANK_COORDS.bank,
            'Compte': BANK_COORDS.account,
            'Titulaire': BANK_COORDS.holder,
            'SWIFT': BANK_COORDS.swift,
            'IBAN': BANK_COORDS.iban,
          }).map(([label, value]) => (
            <div key={label} className="flex items-center justify-between bg-card/60 rounded-xl px-3 py-2">
              <span className="text-muted-foreground">{label} :</span>
              <div className="flex items-center gap-1">
                <span className="font-mono font-medium text-sm">{value}</span>
                <CopyButton text={value} />
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Les virements peuvent prendre 1-3 jours ouvrés. Incluez votre identifiant Ecrossflow en référence.</p>
      </div>
    );
  }

  if (method === 'CARD') {
    const stripeConfigured = !!(import.meta.env.VITE_STRIPE_PUBLIC_KEY);
    return (
      <div className="bg-violet-500/10 border border-violet-500/20 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-violet-400 font-semibold text-sm">
          <CreditCard className="w-4 h-4" /> Paiement par Carte
        </div>
        {stripeConfigured ? (
          <StripeCardForm />
        ) : (
          <div className="bg-card/60 rounded-xl p-4 text-center">
            <div className="w-16 h-16 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto mb-3">
              <CreditCard className="w-8 h-8 text-violet-400" />
            </div>
            <p className="text-sm text-muted-foreground">Paiement par carte via Stripe</p>
            <p className="text-xs text-muted-foreground mt-1">Visa, Mastercard, Amex acceptés</p>
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary rounded-full px-3 py-1">
              <Shield className="w-3 h-3" /> Paiement sécurisé SSL
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground text-center">
          {stripeConfigured ? 'Entrez vos informations de carte ci-dessus.' : 'Configuration Stripe requise pour activer le paiement par carte.'}
        </p>
      </div>
    );
  }

  if (method === 'CRYPTO') {
    const address = CRYPTO_ADDRESS[currency as keyof typeof CRYPTO_ADDRESS] || CRYPTO_ADDRESS.USDT;
    return (
      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-yellow-400 font-semibold text-sm">
          🪙 Dépôt Crypto
        </div>
        <div className="bg-card/60 rounded-xl p-4 flex flex-col items-center gap-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Adresse {currency}</p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs break-all text-foreground">{address}</span>
              <CopyButton text={address} />
            </div>
          </div>
        </div>
        <p className="text-xs text-red-400 text-center">⚠️ Envoyez uniquement du {currency} à cette adresse. Les autres tokens seront perdus.</p>
      </div>
    );
  }

  return null;
}

interface OTPModalProps {
  amount: number;
  currency: string;
  paymentMethod: string;
  destination: string;
  serverOtp: string | null;
  onConfirm: (otp: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}

function OTPModal({ amount, currency, paymentMethod, destination, serverOtp, onConfirm, onCancel, isLoading }: OTPModalProps) {
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) return;
    setError('');
    onConfirm(otp);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-card border border-border rounded-3xl p-6 max-w-sm w-full shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="font-display font-bold text-lg">Confirmation OTP</h3>
          </div>
          <button onClick={onCancel} className="p-2 rounded-xl hover:bg-muted/40 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="bg-muted/40 rounded-2xl p-4 mb-4 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Montant</span>
            <span className="font-bold">{amount} {currency}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Via</span>
            <span className="font-medium">{paymentMethod}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Destination</span>
            <span className="font-mono text-xs">{destination}</span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-3">
          Un code OTP à 6 chiffres a été généré. Entrez-le pour confirmer le retrait.
        </p>

        {serverOtp && (
          <div className="bg-primary/10 border border-primary/20 rounded-xl px-3 py-2 mb-4 flex items-center justify-between">
            <span className="text-xs text-primary/80">Code OTP (simulation) :</span>
            <span className="font-mono font-bold text-primary tracking-widest">{serverOtp}</span>
          </div>
        )}

        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={e => { setOtp(e.target.value.replace(/\D/g, '')); setError(''); }}
              placeholder="000000"
              className="w-full text-center text-3xl font-mono tracking-[0.5em] bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={otp.length !== 6 || isLoading}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-3 font-semibold disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Shield className="w-5 h-5" /> Confirmer le Retrait</>}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default function WalletPage() {
  return (
    <AppLayout>
      {stripePromise ? (
        <Elements stripe={stripePromise}>
          <WalletInner />
        </Elements>
      ) : <WalletInner />}
    </AppLayout>
  );
}

function WalletInner() {
  const [tab, setTab] = React.useState<Tab>('deposit');
  const [amount, setAmount] = React.useState('');
  const [currency, setCurrency] = React.useState('USD');
  const [paymentMethod, setPaymentMethod] = React.useState('MONCASH');
  const [reference, setReference] = React.useState('');
  const [destination, setDestination] = React.useState('');
  const [showOTP, setShowOTP] = React.useState(false);
  const [serverOtp, setServerOtp] = React.useState<string | null>(null);
  const [otpError, setOtpError] = React.useState('');
  const [evidenceUrl, setEvidenceUrl] = React.useState('');
  const [evidenceFile, setEvidenceFile] = React.useState<File | null>(null);
  const queryClient = useQueryClient();

  const { data: wallet } = useGetWallet();
  const { data: rates } = useGetExchangeRates();

  const { mutate: deposit, isPending: isDepositing, isSuccess: depositSuccess, reset: resetDeposit } = useCreateDeposit({
    mutation: {
      onSuccess: () => { setAmount(''); setReference(''); setEvidenceUrl(''); setEvidenceFile(null); queryClient.invalidateQueries(); }
    }
  });
  const { mutate: withdraw, isPending: isWithdrawing, isSuccess: withdrawSuccess, reset: resetWithdraw } = useCreateWithdrawal({
    mutation: {
      onSuccess: () => { setAmount(''); setDestination(''); setShowOTP(false); setServerOtp(null); queryClient.invalidateQueries(); }
    }
  });
  const { mutate: requestOtpMutate, isPending: isRequestingOtp } = useRequestWithdrawalOtp({
    mutation: {
      onSuccess: (data) => {
        setServerOtp(data.otp ?? null);
        setOtpError('');
        setShowOTP(true);
      },
      onError: () => {
        setOtpError('Erreur lors de la génération du code OTP. Vérifiez votre solde.');
      }
    }
  });

  const requestOtp = () => {
    if (!amount || !currency) return;
    setOtpError('');
    requestOtpMutate({ data: { amount: parseFloat(amount), currency } });
  };

  const handleEvidenceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEvidenceFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) setEvidenceUrl(ev.target.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === 'deposit') {
      deposit({ data: { amount: parseFloat(amount), currency, paymentMethod: paymentMethod as DepositRequestPaymentMethod, reference, evidenceUrl: evidenceUrl || undefined } });
    } else if (tab === 'withdraw') {
      requestOtp();
    }
  };

  const confirmWithdraw = (otp: string) => {
    withdraw({ data: { amount: parseFloat(amount), currency, paymentMethod: paymentMethod as WithdrawalRequestPaymentMethod, destination, otp } });
  };

  const usdEquivalent = amount && rates?.rates[currency]
    ? (parseFloat(amount) / (rates.rates[currency] as number)).toFixed(2)
    : null;

  const currentDepositMethods = tab === 'withdraw' ? WITHDRAW_METHODS : DEPOSIT_METHODS;

  return (
    <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-display font-bold">Bourse Virtuelle</h1>
          <p className="text-muted-foreground mt-1">Gérez vos dépôts et retraits</p>
        </motion.div>

        {/* Wallet Balance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Solde Disponible', value: wallet?.balanceUsd || 0, color: 'from-primary/20 to-primary/5', textColor: 'text-primary', icon: Wallet },
            { label: 'En Attente', value: wallet?.balancePending || 0, color: 'from-yellow-500/20 to-yellow-500/5', textColor: 'text-yellow-400', icon: TrendingUp },
            { label: 'Réservé', value: wallet?.balanceReserved || 0, color: 'from-violet-500/20 to-violet-500/5', textColor: 'text-violet-400', icon: DollarSign },
          ].map(({ label, value, color, textColor, icon: Icon }) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className={`bg-gradient-to-br ${color} rounded-2xl p-6 border border-border/50 backdrop-blur`}
            >
              <Icon className={`w-6 h-6 mb-3 ${textColor}`} />
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className={`text-3xl font-display font-bold mt-1 ${textColor}`}>
                ${Number(value).toFixed(2)}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Rates Ticker */}
        {rates && (
          <div className="overflow-x-auto rounded-xl bg-card/40 border border-border/50 px-4 py-2">
            <div className="flex items-center gap-6 min-w-max">
              {Object.entries(rates.rates as Record<string, number>).filter(([k]) => !['USD', 'USDT'].includes(k)).map(([code, rate]) => (
                <div key={code} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground font-mono">{code}/USD</span>
                  <span className="font-semibold">{rate.toFixed(code === 'HTG' ? 0 : code.startsWith('BT') ? 8 : 4)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transaction Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card/40 border border-border rounded-3xl p-6 shadow-xl"
        >
          {/* Tabs */}
          <div className="flex gap-2 mb-6 bg-muted/40 p-1 rounded-xl w-fit">
            {(['deposit', 'withdraw'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); resetDeposit?.(); resetWithdraw?.(); setAmount(''); setPaymentMethod('MONCASH'); }}
                className={`px-5 py-2 rounded-lg font-medium capitalize transition-all ${tab === t ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {t === 'deposit' ? '↓ Déposer' : '↑ Retirer'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-2">Montant</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full bg-background border border-border rounded-xl pl-8 pr-4 py-3 font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                {usdEquivalent && currency !== 'USD' && (
                  <p className="text-xs text-muted-foreground mt-1">≈ ${usdEquivalent} USD</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-2">Devise</label>
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div>
                <label className="text-sm font-medium text-muted-foreground block mb-2">Méthode de paiement</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {currentDepositMethods.map(m => (
                    <button
                      type="button"
                      key={m.value}
                      onClick={() => setPaymentMethod(m.value)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${paymentMethod === m.value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-border/80 text-muted-foreground'}`}
                    >
                      <span>{m.flag}</span> {m.label}
                    </button>
                  ))}
                </div>
              </div>

            {/* Payment Method Instructions */}
            {tab === 'deposit' && paymentMethod && amount && (
              <MethodInstructions method={paymentMethod} currency={currency} />
            )}

            {tab === 'deposit' && (
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-2">Référence de paiement</label>
                <input
                  type="text"
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  placeholder="Ex: TXN123456 (code de transaction)"
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            )}

            {tab === 'deposit' && (paymentMethod === 'MONCASH' || paymentMethod === 'NATCASH') && (
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-2">
                  <Upload className="w-4 h-4 inline mr-1" /> Capture d'écran de confirmation (optionnel)
                </label>
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-4 cursor-pointer hover:border-primary/50 transition-colors bg-card/40">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleEvidenceFileChange}
                  />
                  {evidenceFile ? (
                    <div className="flex items-center gap-2 text-primary">
                      <CheckCircle className="w-5 h-5" />
                      <span className="text-sm font-medium">{evidenceFile.name}</span>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-muted-foreground mb-1" />
                      <p className="text-sm text-muted-foreground">Cliquez pour joindre votre screenshot MonCash/NatCash</p>
                    </>
                  )}
                </label>
              </div>
            )}

            {tab === 'withdraw' && (
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-2">Destination</label>
                <input
                  type="text" required
                  value={destination}
                  onChange={e => setDestination(e.target.value)}
                  placeholder="Numéro MonCash / IBAN / adresse crypto"
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Une confirmation OTP sera requise avant le retrait.
                </p>
              </div>
            )}

            {/* Success feedback */}
            {(depositSuccess || withdrawSuccess) && (
              <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 text-primary">
                <Check className="w-5 h-5" /> Transaction soumise avec succès — En cours de traitement
              </div>
            )}

            {otpError && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                {otpError}
              </div>
            )}

            <button
              type="submit"
              disabled={isDepositing || isWithdrawing || isRequestingOtp}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-3.5 font-semibold text-lg hover:shadow-[0_0_20px_rgba(0,255,170,0.3)] transition-all disabled:opacity-60"
            >
              {(isDepositing || isWithdrawing || isRequestingOtp) ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                tab === 'deposit' ? <><ArrowDownCircle className="w-5 h-5" /> Déposer</> :
                <><ArrowUpCircle className="w-5 h-5" /> Retirer</>
              )}
            </button>
          </form>
        </motion.div>

        {/* OTP Modal (fixed position, DOM location doesn't matter) */}
        <AnimatePresence>
          {showOTP && (
            <OTPModal
              amount={parseFloat(amount)}
              currency={currency}
              paymentMethod={paymentMethod}
              destination={destination}
              serverOtp={serverOtp}
              onConfirm={confirmWithdraw}
              onCancel={() => { setShowOTP(false); setServerOtp(null); }}
              isLoading={isWithdrawing}
            />
          )}
        </AnimatePresence>
      </div>
  );
}
