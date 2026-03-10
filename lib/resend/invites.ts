import { sendEmailWithResend } from "@/lib/resend/client";

type SendAgencyInviteEmailArgs = {
  agencyName: string;
  inviteUrl: string;
  roleLabel: string;
  toEmail: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function sendAgencyInviteEmail({
  agencyName,
  inviteUrl,
  roleLabel,
  toEmail,
}: SendAgencyInviteEmailArgs) {
  const safeAgencyName = escapeHtml(agencyName);
  const safeRoleLabel = escapeHtml(roleLabel);
  const safeInviteUrl = escapeHtml(inviteUrl);

  return sendEmailWithResend({
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <p>You have been invited to join <strong>${safeAgencyName}</strong> on Backdoor.</p>
        <p>Your role: <strong>${safeRoleLabel}</strong></p>
        <p>
          Complete your account setup using the link below:
        </p>
        <p>
          <a href="${safeInviteUrl}" style="color:#2563eb">${safeInviteUrl}</a>
        </p>
        <p>This invite link is tied to ${escapeHtml(toEmail)}.</p>
      </div>
    `,
    subject: `Invitation to join ${agencyName} on Backdoor`,
    text: [
      `You have been invited to join ${agencyName} on Backdoor.`,
      `Your role: ${roleLabel}`,
      "",
      "Complete your account setup using the link below:",
      inviteUrl,
      "",
      `This invite link is tied to ${toEmail}.`,
    ].join("\n"),
    to: toEmail,
  });
}
