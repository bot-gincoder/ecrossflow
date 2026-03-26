import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, DollarSign,
  TrendingUp, Loader2, Copy, Check, Shield, CreditCard,
  Building2, Smartphone, X, Upload, CheckCircle, Sparkles
} from 'lucide-react';
import {
  useGetWallet, useGetExchangeRates, useCreateDeposit, useCreateWithdrawal,
  useRequestWithdrawalOtp,
} from '@workspace/api-client-react';
import type { CreateDepositMutationResult, DepositRequestPaymentMethod, WithdrawalRequestPaymentMethod } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout';
import { useQueryClient } from '@tanstack/react-query';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe } from '@stripe/react-stripe-js';

const DEPOSIT_METHODS = [
  { value: 'MONCASH', label: 'MonCash', flag: '🇭🇹', currencies: ['HTG', 'USD'] },
  { value: 'NATCASH', label: 'NatCash', flag: '🇭🇹', currencies: ['HTG', 'USD'] },
  { value: 'BANK_TRANSFER', label: 'Virement Bancaire', flag: '🏦', currencies: ['USD', 'EUR', 'HTG'] },
  { value: 'CARD', label: 'Carte Bancaire', flag: '💳', currencies: ['USD', 'EUR'] },
  { value: 'CRYPTO', label: 'Crypto (Polygon/BSC)', flag: '🪙', currencies: ['USD'] },
];

const WITHDRAW_METHODS = [
  { value: 'MONCASH', label: 'MonCash', flag: '🇭🇹' },
  { value: 'NATCASH', label: 'NatCash', flag: '🇭🇹' },
  { value: 'BANK_TRANSFER', label: 'Virement Bancaire', flag: '🏦' },
  { value: 'CRYPTO', label: 'Crypto (Polygon/BSC)', flag: '🪙' },
];

const CURRENCIES = ['USD', 'HTG', 'EUR', 'GBP', 'CAD', 'BTC', 'ETH', 'USDT', 'USDC', 'MATIC', 'BNB'];
const APP_MIN_DEPOSIT_USD = 2;
const APP_MIN_WITHDRAW_USD = 3;
const NETWORK_SOFT_MIN_USD = 7;

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

const CRYPTO_ASSETS = [
  { value: 'MATIC_POLYGON', label: 'MATIC (POLYGON)', ticker: 'MATIC', network: 'POLYGON' },
  { value: 'BNB_BSC', label: 'BNB (BSC)', ticker: 'BNB', network: 'BSC' },
] as const;

type CryptoAssetValue = typeof CRYPTO_ASSETS[number]['value'];

type CryptoInstructions = {
  provider: string;
  paymentId: string;
  payAddress: string;
  payAmount?: number | null;
  payCurrency: string;
  network?: string | null;
  expiresAt?: string | null;
  asset: CryptoAssetValue;
  assetLabel: string;
};

type CircleAssetOption = {
  asset: string;
  network: string;
  blockchain: string;
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

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const maybe = error as {
    message?: unknown;
    data?: { message?: unknown; detail?: unknown; error?: unknown } | null;
  };
  if (maybe.data && typeof maybe.data === 'object') {
    if (typeof maybe.data.message === 'string' && maybe.data.message.trim()) return maybe.data.message;
    if (typeof maybe.data.detail === 'string' && maybe.data.detail.trim()) return maybe.data.detail;
    if (typeof maybe.data.error === 'string' && maybe.data.error.trim()) return maybe.data.error;
  }
  if (typeof maybe.message === 'string' && maybe.message.trim()) return maybe.message;
  return fallback;
}

function MethodInstructions({ method, currency, asset, instructions }: { method: string; currency: string; asset: CryptoAssetValue; instructions: CryptoInstructions | null }) {
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
    const selectedAsset = CRYPTO_ASSETS.find(a => a.value === asset) || CRYPTO_ASSETS[0];
    return (
      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-yellow-400 font-semibold text-sm">
          🪙 Dépôt Crypto Custodial
        </div>
        <div className="bg-card/60 rounded-xl p-4 space-y-2">
          <p className="text-sm text-muted-foreground">Réseau sélectionné: <span className="text-foreground font-semibold">{selectedAsset.label}</span></p>
          {!instructions ? (
            <p className="text-xs text-muted-foreground">
              Saisissez le montant puis cliquez sur <strong className="text-foreground">Déposer</strong> pour générer une adresse unique de paiement.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Adresse {instructions.payCurrency.toUpperCase()}</span>
                <CopyButton text={instructions.payAddress} />
              </div>
              <p className="font-mono text-xs break-all text-foreground">{instructions.payAddress}</p>
              {typeof instructions.payAmount === 'number' && (
                <p className="text-xs text-muted-foreground">
                  Montant à payer: <span className="text-foreground font-semibold">{instructions.payAmount} {instructions.payCurrency.toUpperCase()}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">ID paiement: <span className="text-foreground font-mono">{instructions.paymentId}</span></p>
            </div>
          )}
        </div>
        <p className="text-xs text-red-400 text-center">⚠️ Envoyez uniquement du {selectedAsset.ticker} sur le réseau {selectedAsset.network}.</p>
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
  const [cryptoAsset, setCryptoAsset] = React.useState<CryptoAssetValue>('MATIC_POLYGON');
  const [cryptoInstructions, setCryptoInstructions] = React.useState<CryptoInstructions | null>(null);
  const [depositError, setDepositError] = React.useState('');
  const [formError, setFormError] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [destination, setDestination] = React.useState('');
  const [showOTP, setShowOTP] = React.useState(false);
  const [serverOtp, setServerOtp] = React.useState<string | null>(null);
  const [otpError, setOtpError] = React.useState('');
  const [evidenceUrl, setEvidenceUrl] = React.useState('');
  const [evidenceFile, setEvidenceFile] = React.useState<File | null>(null);
  const [circleEnabled, setCircleEnabled] = React.useState(false);
  const [circleConfigured, setCircleConfigured] = React.useState(false);
  const [circleAssets, setCircleAssets] = React.useState<CircleAssetOption[]>([]);
  const [circleSelected, setCircleSelected] = React.useState<string>('');
  const [circleAddress, setCircleAddress] = React.useState<string>('');
  const [circleAddressLoading, setCircleAddressLoading] = React.useState(false);
  const [circleError, setCircleError] = React.useState('');
  const queryClient = useQueryClient();

  const { data: wallet } = useGetWallet();
  const { data: rates } = useGetExchangeRates();

  const authHeaders = React.useCallback(() => {
    const token = localStorage.getItem('ecrossflow_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const { mutate: deposit, isPending: isDepositing, isSuccess: depositSuccess, reset: resetDeposit } = useCreateDeposit({
    mutation: {
      onSuccess: (data) => {
        setDepositError('');
        setFormError('');
        const payload = data as CreateDepositMutationResult & { cryptoInstructions?: CryptoInstructions | null };
        if ((payload.paymentMethod || '').toUpperCase() === 'CRYPTO' && payload.cryptoInstructions) {
          setCryptoInstructions(payload.cryptoInstructions);
          setReference('');
          setEvidenceUrl('');
          setEvidenceFile(null);
        } else {
          setAmount('');
          setReference('');
          setEvidenceUrl('');
          setEvidenceFile(null);
        }
        queryClient.invalidateQueries();
      },
      onError: (error) => {
        setDepositError(getApiErrorMessage(error, 'Echec du depot. Verifiez le montant et reessayez.'));
      },
    }
  });

  const { mutate: withdraw, isPending: isWithdrawing, isSuccess: withdrawSuccess, reset: resetWithdraw } = useCreateWithdrawal({
    mutation: {
      onSuccess: () => {
        setAmount('');
        setDestination('');
        setShowOTP(false);
        setServerOtp(null);
        queryClient.invalidateQueries();
      }
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
        setOtpError('Erreur lors de la generation du code OTP. Verifiez votre solde.');
      }
    }
  });

  const amountNum = Number.parseFloat(amount);
  const rateNum = Number((rates?.rates as Record<string, number> | undefined)?.[currency] ?? 1);
  const amountUsd = Number.isFinite(amountNum) && amountNum > 0
    ? amountNum / (Number.isFinite(rateNum) && rateNum > 0 ? rateNum : 1)
    : 0;

  const requestOtp = () => {
    setOtpError('');
    requestOtpMutate({ data: { amount: amountNum, currency } });
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

  const validateForm = (): boolean => {
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setFormError('Veuillez saisir un montant valide.');
      return false;
    }

    if (tab === 'deposit') {
      if (amountUsd < APP_MIN_DEPOSIT_USD) {
        setFormError(`Le montant minimum est ${APP_MIN_DEPOSIT_USD} USD.`);
        return false;
      }
      setFormError('');
      return true;
    }

    if (!destination.trim()) {
      setFormError('La destination de retrait est obligatoire.');
      return false;
    }
    if (amountUsd < APP_MIN_WITHDRAW_USD) {
      setFormError(`Le retrait minimum est ${APP_MIN_WITHDRAW_USD} USD.`);
      return false;
    }
    if (amountUsd > Number(wallet?.balanceUsd || 0)) {
      setFormError('Solde disponible insuffisant.');
      return false;
    }

    setFormError('');
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    if (tab === 'deposit') {
      if (paymentMethod === 'CRYPTO' && circleEnabled) {
        if (!circleAddress) {
          setFormError('Adresse Circle indisponible pour le reseau selectionne.');
          return;
        }
        setFormError('Adresse Circle prete. Envoyez les fonds puis attendez la confirmation on-chain.');
        return;
      }
      setDepositError('');
      deposit({
        data: {
          amount: amountNum,
          currency,
          paymentMethod: paymentMethod as DepositRequestPaymentMethod,
          reference,
          evidenceUrl: evidenceUrl || undefined,
          ...(paymentMethod === 'CRYPTO' ? { cryptoAsset } : {}),
        }
      });
      return;
    }

    requestOtp();
  };

  const confirmWithdraw = (otp: string) => {
    withdraw({
      data: {
        amount: amountNum,
        currency,
        paymentMethod: paymentMethod as WithdrawalRequestPaymentMethod,
        destination,
        otp,
        ...(paymentMethod === 'CRYPTO' ? { cryptoAsset } : {}),
      }
    });
  };

  const usdEquivalent = amount && rates?.rates[currency]
    ? (amountNum / (rates.rates[currency] as number)).toFixed(2)
    : null;

  const currentDepositMethods = tab === 'withdraw' ? WITHDRAW_METHODS : DEPOSIT_METHODS;
  const selectedCryptoAsset = CRYPTO_ASSETS.find(a => a.value === cryptoAsset) || CRYPTO_ASSETS[0];
  const selectableCurrencies = paymentMethod === 'CRYPTO'
    ? (tab === 'deposit' ? ['USD'] : [selectedCryptoAsset.ticker])
    : CURRENCIES;

  React.useEffect(() => {
    if (paymentMethod === 'CRYPTO') {
      const requiredCurrency = tab === 'deposit' ? 'USD' : selectedCryptoAsset.ticker;
      if (currency !== requiredCurrency) setCurrency(requiredCurrency);
    }
  }, [paymentMethod, selectedCryptoAsset, currency, tab]);

  React.useEffect(() => {
    setFormError('');
  }, [amount, currency, paymentMethod, tab, destination]);

  React.useEffect(() => {
    let cancelled = false;
    const shouldLoad = paymentMethod === 'CRYPTO' && tab === 'deposit';
    if (!shouldLoad) return;
    (async () => {
      try {
        setCircleError('');
        const configRes = await fetch('/api/wallet/circle/config', {
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
          },
        });
        const config = await configRes.json();
        if (cancelled) return;
        setCircleEnabled(Boolean(config?.enabled));
        setCircleConfigured(Boolean(config?.configured));

        const assetsRes = await fetch('/api/wallet/circle/assets', {
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
          },
        });
        const assetsPayload = await assetsRes.json();
        if (cancelled) return;
        const assets = Array.isArray(assetsPayload?.assets) ? assetsPayload.assets as CircleAssetOption[] : [];
        setCircleAssets(assets);
        if (!circleSelected && assets.length) {
          setCircleSelected(`${assets[0].asset}:${assets[0].network}`);
        }
      } catch {
        if (!cancelled) setCircleError('Impossible de charger les reseaux Circle.');
      }
    })();
    return () => { cancelled = true; };
  }, [paymentMethod, tab, authHeaders, circleSelected]);

  React.useEffect(() => {
    let cancelled = false;
    const shouldLoadAddress = paymentMethod === 'CRYPTO' && tab === 'deposit' && circleEnabled && circleConfigured && Boolean(circleSelected);
    if (!shouldLoadAddress) return;
    const network = circleSelected.split(':')[1];
    if (!network) return;
    (async () => {
      try {
        setCircleAddressLoading(true);
        setCircleError('');
        const res = await fetch(`/api/wallet/circle/address?network=${encodeURIComponent(network)}`, {
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
          },
        });
        const payload = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setCircleAddress('');
          setCircleError(payload?.message || 'Impossible de generer une adresse Circle.');
          return;
        }
        setCircleAddress(String(payload?.address || ''));
      } catch {
        if (!cancelled) setCircleError('Erreur lors de la recuperation de ladresse Circle.');
      } finally {
        if (!cancelled) setCircleAddressLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [circleSelected, circleEnabled, circleConfigured, paymentMethod, tab, authHeaders]);

  const quickAmounts = tab === 'deposit' ? ['2', '5', '10', '20'] : ['3', '10', '25', '50'];
  const ctaBusy = isDepositing || isWithdrawing || isRequestingOtp;
  const ctaDisabled = ctaBusy || !amount || (tab === 'withdraw' && !destination.trim());

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-display font-bold">Bourse Virtuelle</h1>
        <p className="text-muted-foreground mt-1">Panneau de depot/retrait moderne, rapide et securise.</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { label: 'Disponible', value: wallet?.balanceUsd || 0, icon: Wallet, tone: 'text-primary border-primary/30 bg-primary/10' },
          { label: 'En Attente', value: wallet?.balancePending || 0, icon: TrendingUp, tone: 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10' },
          { label: 'Bloque', value: wallet?.balanceReserved || 0, icon: DollarSign, tone: 'text-violet-300 border-violet-500/30 bg-violet-500/10' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className={`rounded-2xl border p-4 ${tone}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-2xl font-display font-bold mt-2">${Number(value).toFixed(2)}</p>
          </div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-border bg-card/50 p-4 sm:p-6 shadow-xl"
      >
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 sm:gap-6">
          <div className="space-y-5">
            <div className="inline-flex w-full sm:w-auto rounded-2xl bg-muted/50 p-1">
              {(['deposit', 'withdraw'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTab(t);
                    resetDeposit?.();
                    resetWithdraw?.();
                    setAmount('');
                    setPaymentMethod('MONCASH');
                    setCryptoInstructions(null);
                    setDepositError('');
                    setFormError('');
                  }}
                  className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                    tab === t ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t === 'deposit' ? 'Depot' : 'Retrait'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-2">Montant</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      required
                      className="w-full rounded-xl border border-border bg-background pl-7 pr-3 py-3 font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  {usdEquivalent && currency !== 'USD' && (
                    <p className="text-xs text-muted-foreground mt-1">~ ${usdEquivalent} USD</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-2">Devise</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-3 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    {selectableCurrencies.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {quickAmounts.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmount(v)}
                    className="px-3 py-1.5 rounded-full text-xs border border-border bg-background/70 hover:border-primary/50 hover:text-primary transition"
                  >
                    ${v}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-2">Methode</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {currentDepositMethods.map((m) => (
                    <button
                      type="button"
                      key={m.value}
                      onClick={() => { setPaymentMethod(m.value); setDepositError(''); if (m.value !== 'CRYPTO') setCryptoInstructions(null); }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition ${
                        paymentMethod === m.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span>{m.flag}</span> {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {paymentMethod === 'CRYPTO' && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-2">Reseau crypto</label>
                  {circleEnabled ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {circleAssets.map((opt) => {
                          const key = `${opt.asset}:${opt.network}`;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => { setCircleSelected(key); setCryptoInstructions(null); }}
                              className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition ${
                                circleSelected === key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
                              }`}
                            >
                              {opt.asset} ({opt.network})
                            </button>
                          );
                        })}
                      </div>
                      {circleAddressLoading && (
                        <p className="text-xs text-muted-foreground">Generation de ladresse Circle...</p>
                      )}
                      {circleAddress && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-emerald-300">Adresse de depot Circle</p>
                            <CopyButton text={circleAddress} />
                          </div>
                          <p className="font-mono text-xs break-all text-foreground">{circleAddress}</p>
                        </div>
                      )}
                      {circleError && (
                        <p className="text-xs text-red-300">{circleError}</p>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {CRYPTO_ASSETS.map((asset) => (
                        <button
                          key={asset.value}
                          type="button"
                          onClick={() => { setCryptoAsset(asset.value); setCryptoInstructions(null); }}
                          className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition ${
                            cryptoAsset === asset.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
                          }`}
                        >
                          {asset.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === 'deposit' && paymentMethod && amount && (
                <MethodInstructions method={paymentMethod} currency={currency} asset={cryptoAsset} instructions={cryptoInstructions} />
              )}

              {tab === 'deposit' && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-2">Reference (optionnel)</label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Ex: TXN123456"
                    className="w-full rounded-xl border border-border bg-background px-3 py-3 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              )}

              {tab === 'deposit' && (paymentMethod === 'MONCASH' || paymentMethod === 'NATCASH') && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-2">
                    <Upload className="w-4 h-4 inline mr-1" /> Capture d'ecran (optionnel)
                  </label>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-4 cursor-pointer hover:border-primary/50 transition-colors bg-card/40">
                    <input type="file" accept="image/*" className="hidden" onChange={handleEvidenceFileChange} />
                    {evidenceFile ? (
                      <div className="flex items-center gap-2 text-primary">
                        <CheckCircle className="w-5 h-5" />
                        <span className="text-sm font-medium">{evidenceFile.name}</span>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-6 h-6 text-muted-foreground mb-1" />
                        <p className="text-sm text-muted-foreground">Ajouter une preuve de paiement</p>
                      </>
                    )}
                  </label>
                </div>
              )}

              {tab === 'withdraw' && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground block mb-2">Destination</label>
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="Numero / IBAN / adresse crypto"
                    className="w-full rounded-xl border border-border bg-background px-3 py-3 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                    <Shield className="w-3 h-3" /> Confirmation OTP obligatoire avant envoi.
                  </p>
                </div>
              )}

              {(depositSuccess || withdrawSuccess) && (
                <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 text-primary text-sm">
                  <Check className="w-4 h-4" /> Transaction soumise avec succes.
                </div>
              )}

              {tab === 'deposit' && depositError && (
                <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  {depositError}
                </div>
              )}

              {formError && (
                <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  {formError}
                </div>
              )}

              {tab === 'deposit' && paymentMethod === 'CRYPTO' && cryptoInstructions && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-emerald-300 text-sm space-y-1">
                  <p className="font-semibold">Adresse generee avec succes.</p>
                  <p>Envoyez {cryptoInstructions.payCurrency.toUpperCase()} sur le reseau demande pour finaliser le credit du wallet.</p>
                </div>
              )}

              {otpError && (
                <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  {otpError}
                </div>
              )}

              <button
                type="submit"
                disabled={ctaDisabled}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-3.5 font-semibold text-base sm:text-lg hover:shadow-[0_0_20px_rgba(0,255,170,0.3)] transition disabled:opacity-60"
              >
                {ctaBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                  tab === 'deposit' ? <><ArrowDownCircle className="w-5 h-5" /> Deposer</> : <><ArrowUpCircle className="w-5 h-5" /> Retirer</>
                )}
              </button>
            </form>
          </div>

          <aside className="space-y-3">
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Resume</p>
              <p className="text-lg font-semibold mt-2">{tab === 'deposit' ? 'Depot' : 'Retrait'} {amount || '0'} {currency}</p>
              <p className="text-xs text-muted-foreground mt-1">Equivalent USD: ${amountUsd.toFixed(2)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background/70 p-4 text-sm text-muted-foreground space-y-2">
              <p className="flex items-center gap-2 text-foreground font-semibold"><Sparkles className="w-4 h-4 text-primary" /> Guide automatique</p>
              <p>Provider crypto actif: {circleEnabled ? 'Circle' : 'Fallback custodial'}</p>
              <p>Minimum depot: ${APP_MIN_DEPOSIT_USD}. Minimum retrait: ${APP_MIN_WITHDRAW_USD}.</p>
              {paymentMethod === 'CRYPTO' && tab === 'deposit' && (
                <p>Crypto: si le reseau refuse, commence a ${NETWORK_SOFT_MIN_USD} (minimum provider variable).</p>
              )}
              <p>Les retraits demandent OTP + KYC approuve.</p>
            </div>
          </aside>
        </div>
      </motion.div>

      <AnimatePresence>
        {showOTP && (
          <OTPModal
            amount={amountNum || 0}
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
