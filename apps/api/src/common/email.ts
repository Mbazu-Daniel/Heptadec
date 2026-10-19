import { Resend } from "resend";
import { driverFailure } from "./driver-error";

export interface IEmail {
  to: string;
  subject: string;
  text: string;
}

export type EmailOutcome =
  | { status: "sent" }
  | { status: "failed"; reason: string }
  | { status: "skipped"; reason: string };

type EmailTransport = "resend" | "cloudflare";

const REQUEST_TIMEOUT_MS = 10_000;

function emailTransport(): EmailTransport | null {
  const chosen = process.env.EMAIL_TRANSPORT;
  if (chosen === "resend" || chosen === "cloudflare") {
    return chosen;
  }
  if (cloudflareReady()) {
    return "cloudflare";
  }
  if ((process.env.RESEND_API_KEY ?? "") !== "") {
    return "resend";
  }
  return null;
}

export async function sendEmail(email: IEmail): Promise<EmailOutcome> {
  const transport = emailTransport();
  if (transport === null) {
    return { status: "skipped", reason: "No email transport is configured" };
  }
  try {
    return transport === "cloudflare" ? await cloudflare(email) : await resend(email);
  } catch (caught) {
    return {
      status: "failed",
      reason:
        driverFailure(caught, "reach the email provider") ??
        "The email provider could not be reached",
    };
  }
}

function cloudflareReady(): boolean {
  return (
    (process.env.CLOUDFLARE_ACCOUNT_ID ?? "") !== "" &&
    (process.env.CLOUDFLARE_EMAIL_TOKEN ?? "") !== "" &&
    (process.env.CLOUDFLARE_EMAIL_FROM ?? "") !== ""
  );
}

async function resend(email: IEmail): Promise<EmailOutcome> {
  const client = new Resend(process.env.RESEND_API_KEY ?? "");
  const { error } = await client.emails.send({
    from: process.env.RESEND_FROM ?? "Heptadec <invite@heptadec.local>",
    to: email.to,
    subject: email.subject,
    text: email.text,
  });
  if (error !== null) {
    return { status: "failed", reason: "The email provider refused the message" };
  }
  return { status: "sent" };
}

async function cloudflare(email: IEmail): Promise<EmailOutcome> {
  const base =
    process.env.CLOUDFLARE_API_BASE ?? "https://api.cloudflare.com/client/v4";
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
  const response = await fetch(`${base}/accounts/${accountId}/email/sending/send`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.CLOUDFLARE_EMAIL_TOKEN ?? ""}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      to: email.to,
      from: process.env.CLOUDFLARE_EMAIL_FROM ?? "",
      subject: email.subject,
      text: email.text,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    return { status: "failed", reason: `The email provider answered ${response.status}` };
  }
  return { status: "sent" };
}