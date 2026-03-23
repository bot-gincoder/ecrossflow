import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAppStore } from "@/hooks/use-store";
import { useToast } from "@/hooks/use-toast";

export default function VerifyEmailPage() {
  const { t, token } = useAppStore();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const email = new URLSearchParams(window.location.search).get("email") || "";

  const [code, setCode] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!email || !token) {
      navigate("/auth/login");
    }
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) {
      setCanResend(true);
      return;
    }
    const timer = setTimeout(() => setResendCooldown(r => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    if (newCode.every(d => d !== "") && newCode.join("").length === 6) {
      handleVerify(newCode.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const newCode = [...code];
    for (let i = 0; i < pasted.length; i++) {
      newCode[i] = pasted[i];
    }
    setCode(newCode);
    const nextIndex = Math.min(pasted.length, 5);
    inputRefs.current[nextIndex]?.focus();
    if (pasted.length === 6) {
      handleVerify(pasted);
    }
  };

  const handleVerify = async (otp: string) => {
    if (otp.length !== 6 || loading) return;
    setLoading(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/auth/verify-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ otp }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({
          title: "Code incorrect",
          description: (data as { message?: string }).message || "Code invalide ou expiré. Réessayez.",
          variant: "destructive",
        });
        setCode(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
        setLoading(false);
        return;
      }
      toast({ title: "Email vérifié !", description: "Bienvenue sur Ecrossflow." });
      navigate("/onboarding");
    } catch {
      toast({ title: "Erreur", description: "Vérification impossible.", variant: "destructive" });
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!canResend) return;
    setCanResend(false);
    setResendCooldown(60);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      await fetch(`${base}/api/auth/resend-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email }),
      });
      toast({ title: t("verify.resend"), description: "Code envoyé à " + email });
    } catch {
      toast({ title: "Erreur", description: "Impossible de renvoyer le code.", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground mb-2">{t("verify.title")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("verify.subtitle")}{" "}
            <span className="font-medium text-foreground">{email}</span>
          </p>
        </div>

        <div className="bg-card border border-card-border rounded-2xl p-8">
          <p className="text-sm text-center text-muted-foreground mb-6">{t("verify.enter_code")}</p>
          
          <div className="flex gap-3 justify-center mb-8" onPaste={handlePaste}>
            {code.map((digit, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={e => handleChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                disabled={loading}
                className={`w-12 h-14 text-center text-xl font-bold border-2 rounded-xl bg-background transition-all focus:outline-none focus:border-primary ${
                  digit ? "border-primary text-foreground" : "border-border text-muted-foreground"
                } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
              />
            ))}
          </div>

          <button
            onClick={() => handleVerify(code.join(""))}
            disabled={code.join("").length !== 6 || loading}
            className="w-full py-3 rounded-xl font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-4"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Vérification...
              </span>
            ) : t("verify.verify")}
          </button>

          <div className="text-center text-sm text-muted-foreground">
            {canResend ? (
              <button
                onClick={handleResend}
                className="text-primary font-medium hover:underline"
              >
                {t("verify.resend")}
              </button>
            ) : (
              <span>{t("verify.resend_in")} <span className="font-mono font-medium text-foreground">{resendCooldown}s</span></span>
            )}
          </div>
        </div>

        <div className="text-center mt-6">
          <button
            onClick={() => navigate("/auth/login")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("verify.back")}
          </button>
        </div>
      </div>
    </div>
  );
}
