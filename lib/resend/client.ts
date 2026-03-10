type SendEmailArgs = {
  html: string;
  replyTo?: string | null;
  subject: string;
  text: string;
  to: string;
};

type ResendSendResponse = {
  id: string;
};

export async function sendEmailWithResend({
  html,
  replyTo,
  subject,
  text,
  to,
}: SendEmailArgs): Promise<ResendSendResponse> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  if (!from) {
    throw new Error("RESEND_FROM_EMAIL is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      html,
      reply_to: replyTo ?? undefined,
      subject,
      text,
      to: [to],
    }),
  });
  const result = (await response.json().catch(() => null)) as
    | { error?: { message?: string }; id?: string; message?: string }
    | null;

  if (!response.ok || !result?.id) {
    throw new Error(
      result?.error?.message ?? result?.message ?? "Unable to send email with Resend",
    );
  }

  return { id: result.id };
}
