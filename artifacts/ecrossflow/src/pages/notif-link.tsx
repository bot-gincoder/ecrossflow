import React, { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout";
import { useAppStore } from "@/hooks/use-store";
import { Bell, Link2, Mail, MessageSquare, RefreshCw, Save } from "lucide-react";

type DomainKey = "sms_otp" | "email_otp" | "email_verification" | "email_notif" | "email_transaction" | "referral_link";

type DomainState = {
  key: string;
  value: Record<string, unknown>;
  updatedAt: string | null;
};

type DomainsResponse = {
  domains: Record<DomainKey, DomainState>;
};

const DOMAIN_ORDER: DomainKey[] = ["sms_otp", "email_otp", "email_verification", "email_notif", "email_transaction", "referral_link"];

const DEFAULT_EXAMPLES: Record<DomainKey, Record<string, unknown>> = {
  sms_otp: {
    body: "Ecrossflow • Code securite: {{otp}} • Expire dans {{minutes}} min. Ne le partagez jamais.",
  },
  email_otp: {
    subject: "Votre code de securite Ecrossflow",
    bodyHtml: "<h2>Code de verification</h2><p>Utilisez ce code pour valider votre action:</p><p><strong style='font-size:24px'>{{otp}}</strong></p><p>Validite: {{minutes}} minutes.</p><p>Si vous n etes pas a l origine de cette demande, ignorez ce message.</p>",
  },
  email_verification: {
    subject: "Activez votre compte Ecrossflow",
    bodyHtml: "<h2>Confirmez votre email</h2><p>Votre compte est presque pret.</p><p><a href='{{verification_link}}'>Confirmer mon compte</a></p><p>Si le bouton ne fonctionne pas, copiez ce lien: {{verification_link}}</p>",
  },
  email_notif: {
    subject: "Compte active avec succes",
    bodyHtml: "<h2>Activation confirmee</h2><p>Votre compte est actif.</p><p>Etape suivante: rechargez votre wallet avec au moins {{min_deposit_usd}} USD pour commencer.</p>",
  },
  email_transaction: {
    subject: "Nouvelle transaction {{tx_type}} - {{tx_status}}",
    bodyHtml: "<p>Une nouvelle operation a ete enregistree sur votre compte.</p><p><strong>Type:</strong> {{tx_type}}<br><strong>Statut:</strong> {{tx_status}}<br><strong>Montant:</strong> {{amount}} {{currency}} ({{amount_usd}} USD)<br><strong>Reference:</strong> {{reference_id}}</p>",
    actionLabel: "Voir mon historique",
  },
  referral_link: {
    baseUrl: "https://ecrossflow.com",
    registerPath: "/auth/register",
    queryParam: "ref",
    whatsappTemplate: "Bonjour 👋 Rejoins {{app_name}} avec mon code {{referral_code}} et commence ici: {{referral_link}}",
    telegramTemplate: "🚀 Rejoins {{app_name}} | Code: {{referral_code}} | Lien: {{referral_link}}",
    genericTemplate: "Rejoins {{app_name}} avec mon code {{referral_code}}: {{referral_link}}",
  },
};

const DOMAIN_META: Record<DomainKey, { title: string; hint: string; icon: React.ElementType }> = {
  sms_otp: {
    title: "SMS OTP",
    hint: "Variables: {{otp}}, {{minutes}}, {{app_name}}",
    icon: MessageSquare,
  },
  email_otp: {
    title: "Email OTP",
    hint: "Variables: {{otp}}, {{minutes}}, {{app_name}}, {{email}}",
    icon: Mail,
  },
  email_verification: {
    title: "Email Verification",
    hint: "Variables: {{verification_link}}, {{app_name}}, {{email}}",
    icon: Bell,
  },
  email_notif: {
    title: "Email Notif",
    hint: "Variables: {{app_name}}, {{min_deposit_usd}}, {{email}}",
    icon: Bell,
  },
  email_transaction: {
    title: "Email Transaction",
    hint: "Variables: {{app_name}}, {{username}}, {{tx_type}}, {{tx_status}}, {{amount}}, {{currency}}, {{amount_usd}}, {{reference_id}}, {{description}}, {{history_url}}",
    icon: Bell,
  },
  referral_link: {
    title: "Referral Link",
    hint: "Variables: {{app_name}}, {{username}}, {{referral_code}}, {{referral_link}}",
    icon: Link2,
  },
};

function buildLocalDefaultDomains(): Record<DomainKey, DomainState> {
  return DOMAIN_ORDER.reduce<Record<DomainKey, DomainState>>((acc, domain) => {
    acc[domain] = {
      key: domain,
      value: { ...DEFAULT_EXAMPLES[domain] },
      updatedAt: null,
    };
    return acc;
  }, {} as Record<DomainKey, DomainState>);
}

function buildLocalDefaultDrafts(): Record<DomainKey, Record<string, unknown>> {
  return DOMAIN_ORDER.reduce<Record<DomainKey, Record<string, unknown>>>((acc, domain) => {
    acc[domain] = { ...DEFAULT_EXAMPLES[domain] };
    return acc;
  }, {} as Record<DomainKey, Record<string, unknown>>);
}

function toObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

export default function NotifLinkPage() {
  const { token } = useAppStore();
  const base = useMemo(() => import.meta.env.BASE_URL.replace(/\/$/, ""), []);
  const [domains, setDomains] = useState<Record<DomainKey, DomainState>>(buildLocalDefaultDomains);
  const [drafts, setDrafts] = useState<Record<DomainKey, Record<string, unknown>>>(buildLocalDefaultDrafts);
  const [loading, setLoading] = useState(false);
  const [savingDomain, setSavingDomain] = useState<DomainKey | null>(null);
  const [applyingDefaults, setApplyingDefaults] = useState(false);
  const [flash, setFlash] = useState("");

  const load = async () => {
    if (!token) {
      setFlash("Session admin requise pour charger la configuration serveur.");
      return;
    }
    setLoading(true);
    setFlash("");
    try {
      const res = await fetch(`${base}/api/admin/notif-link/config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || "Chargement config échoué");
      const typed = payload as DomainsResponse;
      const mergedDomains = DOMAIN_ORDER.reduce<Record<DomainKey, DomainState>>((acc, domain) => {
        const serverDomain = typed.domains?.[domain];
        acc[domain] = {
          key: serverDomain?.key || domain,
          value: {
            ...DEFAULT_EXAMPLES[domain],
            ...toObject(serverDomain?.value),
          },
          updatedAt: serverDomain?.updatedAt || null,
        };
        return acc;
      }, {} as Record<DomainKey, DomainState>);
      setDomains(mergedDomains);
      const nextDrafts = Object.entries(mergedDomains).reduce<Record<DomainKey, Record<string, unknown>>>((acc, [k, v]) => {
        acc[k as DomainKey] = {
          ...DEFAULT_EXAMPLES[k as DomainKey],
          ...toObject(v.value),
        } as Record<string, unknown>;
        return acc;
      }, {} as Record<DomainKey, Record<string, unknown>>);
      setDrafts(nextDrafts);
    } catch (error) {
      console.error(error);
      setFlash(error instanceof Error ? error.message : "Erreur de chargement");
      setDomains(buildLocalDefaultDomains());
      setDrafts(buildLocalDefaultDrafts());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  const saveDomain = async (domain: DomainKey) => {
    if (!token || !drafts) return;
    setSavingDomain(domain);
    setFlash("");
    try {
      const res = await fetch(`${base}/api/admin/notif-link/config/${domain}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value: drafts[domain] || {} }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || "Sauvegarde échouée");
      setFlash(`Configuration "${DOMAIN_META[domain].title}" mise à jour.`);
      await load();
    } catch (error) {
      console.error(error);
      setFlash(error instanceof Error ? error.message : "Erreur de sauvegarde");
    } finally {
      setSavingDomain(null);
    }
  };

  const applyDefaultExamples = async () => {
    if (!token) return;
    setApplyingDefaults(true);
    setFlash("");
    try {
      const res = await fetch(`${base}/api/admin/notif-link/defaults`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || "Application des valeurs exemple échouée");
      setFlash("Valeurs exemplaires appliquées.");
      setDomains(buildLocalDefaultDomains());
      setDrafts(buildLocalDefaultDrafts());
      await load();
    } catch (error) {
      console.error(error);
      setFlash(error instanceof Error ? error.message : "Erreur lors de l application des valeurs exemple");
    } finally {
      setApplyingDefaults(false);
    }
  };

  const updateDraft = (domain: DomainKey, key: string, value: string) => {
    setDrafts((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [domain]: {
          ...(prev[domain] || {}),
          [key]: value,
        },
      };
    });
  };

  const referralPreview = (() => {
    const ref = drafts?.referral_link || {};
    const baseUrl = String(ref.baseUrl || "https://ecrossflow.com");
    const registerPath = String(ref.registerPath || "/auth/register");
    const queryParam = String(ref.queryParam || "ref");
    try {
      const url = new URL(registerPath, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
      url.searchParams.set(queryParam, "ECF123456");
      return url.toString();
    } catch {
      return `${baseUrl}${registerPath}?${queryParam}=ECF123456`;
    }
  })();
  const renderTemplate = (template: string) => {
    const ref = drafts?.referral_link || {};
    return template
      .replace(/{{\s*app_name\s*}}/g, "Ecrossflow")
      .replace(/{{\s*username\s*}}/g, "demo_user")
      .replace(/{{\s*referral_code\s*}}/g, "ECF123456")
      .replace(/{{\s*referral_link\s*}}/g, referralPreview);
  };
  const whatsappPreview = renderTemplate(String(drafts?.referral_link?.whatsappTemplate || ""));
  const telegramPreview = renderTemplate(String(drafts?.referral_link?.telegramTemplate || ""));
  const genericPreview = renderTemplate(String(drafts?.referral_link?.genericTemplate || ""));

  return (
    <AppLayout requireAdmin>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-display font-bold">Notif & Link</h1>
            <p className="text-sm text-muted-foreground">Personnalisation avancée des messages et liens.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={applyDefaultExamples}
              disabled={applyingDefaults}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {applyingDefaults ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Charger valeurs exemple
            </button>
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm hover:border-primary/40"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Actualiser
            </button>
          </div>
        </div>

        {flash && (
          <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
            {flash}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {Array.from(new Set(DOMAIN_ORDER)).map((domain) => {
            const meta = DOMAIN_META[domain];
            const Icon = meta.icon;
            const data = drafts?.[domain] || {};
            const updatedAt = domains?.[domain]?.updatedAt;
            return (
              <section key={domain} className="rounded-2xl border border-border bg-card/40 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <h2 className="text-base font-semibold">{meta.title}</h2>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {updatedAt ? new Date(updatedAt).toLocaleString("fr-FR") : "jamais modifié"}
                  </span>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">{meta.hint}</p>

                {domain === "sms_otp" && (
                  <textarea
                    value={String(data.body || "")}
                    onChange={(e) => updateDraft(domain, "body", e.target.value)}
                    className="h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                )}

                {(domain === "email_otp" || domain === "email_verification" || domain === "email_notif" || domain === "email_transaction") && (
                  <div className="space-y-2">
                    <input
                      value={String(data.subject || "")}
                      onChange={(e) => updateDraft(domain, "subject", e.target.value)}
                      placeholder="Sujet email"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    <textarea
                      value={String(data.bodyHtml || "")}
                      onChange={(e) => updateDraft(domain, "bodyHtml", e.target.value)}
                      placeholder="Contenu HTML"
                      className="h-40 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    {domain === "email_transaction" && (
                      <input
                        value={String(data.actionLabel || "")}
                        onChange={(e) => updateDraft(domain, "actionLabel", e.target.value)}
                        placeholder="Label bouton (ex: Voir mon historique)"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                    )}
                  </div>
                )}

                {domain === "referral_link" && (
                  <div className="space-y-2">
                    <input
                      value={String(data.baseUrl || "")}
                      onChange={(e) => updateDraft(domain, "baseUrl", e.target.value)}
                      placeholder="Base URL (ex: https://ecrossflow.com)"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    <input
                      value={String(data.registerPath || "")}
                      onChange={(e) => updateDraft(domain, "registerPath", e.target.value)}
                      placeholder="Chemin inscription (ex: /auth/register)"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    <input
                      value={String(data.queryParam || "")}
                      onChange={(e) => updateDraft(domain, "queryParam", e.target.value)}
                      placeholder="Nom paramètre (ex: ref)"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    <textarea
                      value={String(data.whatsappTemplate || "")}
                      onChange={(e) => updateDraft(domain, "whatsappTemplate", e.target.value)}
                      placeholder="Template WhatsApp"
                      className="h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    <textarea
                      value={String(data.telegramTemplate || "")}
                      onChange={(e) => updateDraft(domain, "telegramTemplate", e.target.value)}
                      placeholder="Template Telegram"
                      className="h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    <textarea
                      value={String(data.genericTemplate || "")}
                      onChange={(e) => updateDraft(domain, "genericTemplate", e.target.value)}
                      placeholder="Template générique"
                      className="h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    <div className="rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground break-all">
                      Lien preview: {referralPreview}
                    </div>
                    <div className="rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                      WhatsApp preview: {whatsappPreview}
                    </div>
                    <div className="rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                      Telegram preview: {telegramPreview}
                    </div>
                    <div className="rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                      Texte preview: {genericPreview}
                    </div>
                  </div>
                )}

                <div className="mt-3">
                  <button
                    onClick={() => void saveDomain(domain)}
                    disabled={savingDomain === domain}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {savingDomain === domain ? "Sauvegarde..." : "Sauvegarder"}
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
