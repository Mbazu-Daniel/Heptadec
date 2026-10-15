import { sendEmail } from "../../common/email";
import { config } from "../../common/config/env";
import type { IInvitationMail } from "./contracts";

export function acceptUrl(invitationId: string): string {
  return `${config.webUrl}/invite/${invitationId}`;
}

export async function sendInvitationEmail(data: IInvitationMail): Promise<void> {
  const link = acceptUrl(data.invitation.id);

  const outcome = await sendEmail({
    to: data.email,
    subject: `${data.inviter.user.name} invited you to ${data.organization.name}`,
    text: [
      `${data.inviter.user.name} invited you to join ${data.organization.name}.`,
      "",
      `You will join as ${data.role}.`,
      "",
      `Accept the invitation: ${link}`,
      "",
      `The link expires on ${data.invitation.expiresAt.toISOString()}.`,
    ].join("\n"),
  });

  if (outcome.status === "sent") {
    return;
  }
  if (outcome.status === "skipped") {
    console.log(`[api] no email transport, invitation not sent. link: ${link}`);
    return;
  }
  throw new Error(outcome.reason);
}