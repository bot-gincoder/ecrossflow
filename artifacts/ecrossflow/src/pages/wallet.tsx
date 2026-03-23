import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, ArrowDownCircle, ArrowUpCircle, RefreshCcw, DollarSign, TrendingUp, Loader2, AlertCircle } from 'lucide-react';
import { useGetWallet, useGetExchangeRates, useCreateDeposit, useCreateWithdrawal, useConvertCurrency } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout';
import { useQueryClient } from '@tanstack/react-query';

const PAYMENT_METHODS = [
  { value: 'MONCASH', label: 'MonCash', flag: '🇭🇹' },
  { value: 'NATCASH', label: 'NatCash', flag: '🇭🇹' },
  { value: 'BANK_TRANSFER', label: 'Virement Bancaire', flag: '🏦' },
  { value: 'CRYPTO', label: 'Crypto (USDT)', flag: '🪙' },
  { value: 'PAYPAL', label: 'PayPal', flag: '💰' },
];

const CURRENCIES = ['USD', 'HTG', 'EUR', 'GBP', 'CAD', 'BTC', 'ETH', 'USDT'];

type Tab = 'deposit' | 'withdraw' | 'convert';

export default function WalletPage() {
  const [tab, setTab] = useState<Tab>('deposit');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [paymentMethod, setPaymentMethod] = useState('MONCASH');
  const [reference, setReference] = useState('');
  const [destination, setDestination] = useState('');
  const [toCurrency, setToCurrency] = useState('HTG');
  const queryClient = useQueryClient();

  const { data: wallet } = useGetWallet();
  const { data: rates } = useGetExchangeRates();
  const { mutate: deposit, isPending: isDepositing, isSuccess: depositSuccess, reset: resetDeposit } = useCreateDeposit({
    mutation: {
      onSuccess: () => { setAmount(''); setReference(''); queryClient.invalidateQueries(); }
    }
  });
  const { mutate: withdraw, isPending: isWithdrawing, isSuccess: withdrawSuccess, reset: resetWithdraw } = useCreateWithdrawal({
    mutation: {
      onSuccess: () => { setAmount(''); setDestination(''); queryClient.invalidateQueries(); }
    }
  });
  const { mutate: convert, isPending: isConverting, data: convertResult, reset: resetConvert } = useConvertCurrency();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === 'deposit') {
      deposit({ data: { amount: parseFloat(amount), currency, paymentMethod, reference } });
    } else if (tab === 'withdraw') {
      withdraw({ data: { amount: parseFloat(amount), currency, paymentMethod, destination } });
    } else {
      convert({ data: { amount: parseFloat(amount), fromCurrency: currency, toCurrency } });
    }
  };

  const usdEquivalent = amount && rates?.rates[currency]
    ? (parseFloat(amount) / rates.rates[currency]).toFixed(2)
    : null;

  return (
    <AppLayout>
      <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-display font-bold">Bourse Virtuelle</h1>
          <p className="text-muted-foreground mt-1">Gérez vos dépôts, retraits et conversions</p>
        </motion.div>

        {/* Wallet Balance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Solde Disponible', value: wallet?.balanceUsd || 0, color: 'from-primary/20 to-primary/5', textColor: 'text-primary', icon: Wallet },
            { label: 'En Attente', value: wallet?.balancePending || 0, color: 'from-yellow-500/20 to-yellow-500/5', textColor: 'text-yellow-400', icon: TrendingUp },
            { label: 'Total Balance', value: wallet?.totalBalance || 0, color: 'from-violet-500/20 to-violet-500/5', textColor: 'text-violet-400', icon: DollarSign },
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
              {Object.entries(rates.rates).filter(([k]) => !['USD', 'USDT'].includes(k)).map(([code, rate]) => (
                <div key={code} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground font-mono">{code}/USD</span>
                  <span className="font-semibold">{(rate as number).toFixed(code === 'HTG' ? 0 : code.startsWith('BT') ? 8 : 4)}</span>
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
            {(['deposit', 'withdraw', 'convert'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); resetDeposit?.(); resetWithdraw?.(); resetConvert?.(); setAmount(''); }}
                className={`px-5 py-2 rounded-lg font-medium capitalize transition-all ${tab === t ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {t === 'deposit' ? '↓ Déposer' : t === 'withdraw' ? '↑ Retirer' : '⇌ Convertir'}
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

            {tab !== 'convert' && (
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-2">Méthode de paiement</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map(m => (
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
            )}

            {tab === 'deposit' && (
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-2">Référence de paiement</label>
                <input
                  type="text"
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  placeholder="Ex: TXN123456"
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            )}

            {tab === 'withdraw' && (
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-2">Destination</label>
                <input
                  type="text" required
                  value={destination}
                  onChange={e => setDestination(e.target.value)}
                  placeholder="Numéro de compte, adresse, etc."
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            )}

            {tab === 'convert' && (
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-2">Convertir en</label>
                <select
                  value={toCurrency}
                  onChange={e => setToCurrency(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {CURRENCIES.filter(c => c !== currency).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}

            {/* Convert Result */}
            {convertResult && tab === 'convert' && (
              <div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
                <p className="text-sm text-muted-foreground">Résultat estimé</p>
                <p className="font-bold text-xl font-display text-primary">{convertResult.convertedAmount.toFixed(6)} {toCurrency}</p>
                <p className="text-xs text-muted-foreground mt-1">Frais: ${convertResult.fee.toFixed(2)} | Taux: {convertResult.rate.toFixed(6)}</p>
              </div>
            )}

            {/* Success feedback */}
            {(depositSuccess || withdrawSuccess) && (
              <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 text-primary">
                ✓ Transaction soumise avec succès !
              </div>
            )}

            <button
              type="submit"
              disabled={isDepositing || isWithdrawing || isConverting}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-3.5 font-semibold text-lg hover:shadow-[0_0_20px_rgba(0,255,170,0.3)] transition-all disabled:opacity-60"
            >
              {(isDepositing || isWithdrawing || isConverting) ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                tab === 'deposit' ? <><ArrowDownCircle className="w-5 h-5" /> Déposer</> :
                tab === 'withdraw' ? <><ArrowUpCircle className="w-5 h-5" /> Retirer</> :
                <><RefreshCcw className="w-5 h-5" /> Convertir</>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </AppLayout>
  );
}
