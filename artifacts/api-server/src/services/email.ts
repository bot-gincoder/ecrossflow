import nodemailer from "nodemailer";

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};

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
