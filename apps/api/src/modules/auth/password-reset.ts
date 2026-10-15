import { sendEmail } from "../../common/email";
import { config } from "../../common/config/env";

export function resetUrl(token: string): string {
  return `${config.webUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

export async function sendPasswordResetEmail(data: {
  email: string;
  token: string;
}): Promise<void> {
  const link = resetUrl(data.token);

  const outcome = await sendEmail({
    to: data.email,
    subject: "Reset your Heptadec password",
    text: [
      "Someone asked to reset the password on your Heptadec account.",
      "",
      `Choose a new password: ${link}`,
      "",
      "The link expires in one hour. If this was not you, ignore this message —",
      "nothing has changed and your password still works.",
    ].join("\n"),
  });

  if (outcome.status === "sent") {
    return;
  }
  if (outcome.status === "skipped") {
    console.log(`[api] no email transport, password reset not sent. link: ${link}`);
    return;
  }
  throw new Error(outcome.reason);
}