import nodemailer from "nodemailer";

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};
type MailLocale = string | undefined;

function createTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    const port = SMTP_PORT ? Number(SMTP_PORT) : 587;
    const secure = port === 465;
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure,
      requireTLS: !secure,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      tls: { rejectUnauthorized: false },
    });
  }

  return null;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const transport = createTransport();
  const from = process.env.SMTP_FROM || "noreply@ecrossflow.com";

  if (!transport) {
    console.log(`[EMAIL] (dev mode — no SMTP configured)`);
    console.log(`[EMAIL] To: ${payload.to}`);
    console.log(`[EMAIL] Subject: ${payload.subject}`);
    const otpMatch = payload.html.match(/\b\d{6}\b/);
    if (otpMatch) {
      console.log(`[EMAIL] OTP Code: ${otpMatch[0]}`);
    }
    return;
  }

  try {
    const info = await transport.sendMail({
      from: `Ecrossflow <${from}>`,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    });
    console.log(`[EMAIL] Sent to ${payload.to} — messageId: ${info.messageId}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[EMAIL] Failed to send to ${payload.to}: ${message}`);
    throw err;
  }
}

export function buildOtpEmail(otp: string, email: string): EmailPayload {
  return {
    to: email,
    subject: "Votre code de vérification Ecrossflow",
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family:sans-serif;background:#0a0a0a;color:#fff;margin:0;padding:40px 20px;">
          <div style="max-width:480px;margin:0 auto;background:#111;border:1px solid #222;border-radius:16px;padding:40px;">
            <h1 style="font-size:24px;font-weight:700;margin-bottom:8px;color:#00ffaa;">Ecrossflow</h1>
            <p style="color:#999;margin-bottom:32px;">Vérification de votre adresse email</p>
            <p style="color:#ccc;margin-bottom:16px;">Voici votre code de vérification à 6 chiffres :</p>
            <div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
              <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:#00ffaa;">${otp}</span>
            </div>
            <p style="color:#666;font-size:13px;line-height:1.6;">
              Ce code expire dans <strong style="color:#999;">10 minutes</strong>.<br>
              Si vous n'avez pas créé de compte sur Ecrossflow, ignorez cet email.
            </p>
          </div>
        </body>
      </html>
    `,
  };
}

export function buildEmailVerificationLinkEmail(link: string, email: string): EmailPayload {
  return buildEmailVerificationLinkEmailLocalized(link, email, "fr");
}

export function buildEmailVerificationLinkEmailLocalized(link: string, email: string, locale: MailLocale): EmailPayload {
  const lang = (locale || "fr").toLowerCase();
  const dict = (() => {
    if (lang === "en") {
      return {
        subject: "Confirm your Ecrossflow account",
        title: "Confirm your email address",
        intro: "Your account has been created. Please confirm your email before using the platform.",
        cta: "Confirm my account",
        fallback: "If the button does not work, copy this link in your browser:",
      };
    }
    if (lang === "es") {
      return {
        subject: "Confirma tu cuenta de Ecrossflow",
        title: "Confirmación de tu correo electrónico",
        intro: "Tu cuenta fue creada. Confirma tu correo antes de usar la plataforma.",
        cta: "Confirmar mi cuenta",
        fallback: "Si el botón no funciona, copia este enlace en tu navegador:",
      };
    }
    if (lang === "ht") {
      return {
        subject: "Konfime kont Ecrossflow ou",
        title: "Konfimasyon imèl ou",
        intro: "Kont ou kreye deja. Tanpri konfime imèl ou anvan ou itilize platfòm nan.",
        cta: "Konfime kont mwen",
        fallback: "Si bouton an pa mache, kopye lyen sa a nan navigatè ou:",
      };
    }
    return {
      subject: "Confirmez votre compte Ecrossflow",
      title: "Confirmation de votre adresse email",
      intro: "Votre compte a bien été créé. Pour l'activer, confirmez votre email avant d'utiliser la plateforme.",
      cta: "Confirmer mon compte",
      fallback: "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :",
    };
  })();

  return {
    to: email,
    subject: dict.subject,
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family:sans-serif;background:#0a0a0a;color:#fff;margin:0;padding:40px 20px;">
          <div style="max-width:520px;margin:0 auto;background:#111;border:1px solid #222;border-radius:16px;padding:40px;">
            <h1 style="font-size:24px;font-weight:700;margin-bottom:8px;color:#00ffaa;">Ecrossflow</h1>
            <p style="color:#999;margin-bottom:24px;">${dict.title}</p>
            <p style="color:#ccc;line-height:1.7;margin-bottom:24px;">
              ${dict.intro}
            </p>
            <div style="margin-bottom:24px;">
              <a href="${link}" style="display:inline-block;background:#00ffaa;color:#00110c;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:700;">
                ${dict.cta}
              </a>
            </div>
            <p style="color:#777;font-size:13px;line-height:1.6;">
              ${dict.fallback}<br>
              <span style="color:#9ef7dc;word-break:break-all;">${link}</span>
            </p>
          </div>
        </body>
      </html>
    `,
  };
}

export function buildAccountActivatedEmail(email: string, locale: MailLocale): EmailPayload {
  const lang = (locale || "fr").toLowerCase();
  const dict = (() => {
    if (lang === "en") {
      return {
        subject: "Your Ecrossflow account is now active",
        title: "Activation successful",
        body: "Your account has been confirmed successfully. You can now access the platform.",
        tip: "Next step: fund your wallet with at least $2 to start your progression from level F to S.",
      };
    }
    if (lang === "es") {
      return {
        subject: "Tu cuenta Ecrossflow ya está activa",
        title: "Activación completada",
        body: "Tu cuenta fue confirmada con éxito. Ya puedes acceder a la plataforma.",
        tip: "Siguiente paso: recarga tu wallet con al menos $2 para comenzar tu progresión de F a S.",
      };
    }
    if (lang === "ht") {
      return {
        subject: "Kont Ecrossflow ou aktive",
        title: "Aktivasyon reyisi",
        body: "Kont ou konfime avèk siksè. Ou kapab antre sou platfòm nan kounye a.",
        tip: "Pwochen etap: rechaje wallet ou ak omwen $2 pou kòmanse pwogresyon ou soti F rive S.",
      };
    }
    return {
      subject: "Votre compte Ecrossflow est activé",
      title: "Activation réussie",
      body: "Votre compte a été confirmé avec succès. Vous pouvez maintenant accéder à la plateforme.",
      tip: "Prochaine étape : rechargez votre wallet avec au moins $2 pour commencer votre progression de F à S.",
    };
  })();

  return {
    to: email,
    subject: dict.subject,
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family:sans-serif;background:#0a0a0a;color:#fff;margin:0;padding:40px 20px;">
          <div style="max-width:520px;margin:0 auto;background:#111;border:1px solid #222;border-radius:16px;padding:40px;">
            <h1 style="font-size:24px;font-weight:700;margin-bottom:8px;color:#00ffaa;">Ecrossflow</h1>
            <p style="color:#999;margin-bottom:24px;">${dict.title}</p>
            <p style="color:#ccc;line-height:1.7;margin-bottom:18px;">${dict.body}</p>
            <div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:16px;color:#c9ffe9;">
              ${dict.tip}
            </div>
          </div>
        </body>
      </html>
    `,
  };
}
