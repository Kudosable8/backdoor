import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const signUpSchema = z
  .object({
    email: z.email(),
    inviteCode: z.string().trim().min(1, "Invite code is required"),
    password: z.string().min(1, "Password is required"),
    repeatPassword: z.string().min(1, "Repeat password is required"),
  })
  .refine((data) => data.password === data.repeatPassword, {
    path: ["repeatPassword"],
    message: "Passwords do not match",
  });

export async function POST(request: Request) {
  const requiredInviteCode = process.env.SIGN_UP_INVITE_CODE;

  if (!requiredInviteCode) {
    return NextResponse.json(
      { error: "Invite code is not configured" },
      { status: 500 },
    );
  }

  const payload = await request.json().catch(() => null);
  const parsedPayload = signUpSchema.safeParse(payload);

  if (!parsedPayload.success) {
    const issue = parsedPayload.error.issues[0];

    return NextResponse.json(
      { error: issue?.message ?? "Invalid sign-up request" },
      { status: 400 },
    );
  }

  if (parsedPayload.data.inviteCode !== requiredInviteCode) {
    return NextResponse.json(
      { error: "A valid invite code is required" },
      { status: 403 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsedPayload.data.email,
    password: parsedPayload.data.password,
    options: {
      emailRedirectTo: `${new URL(request.url).origin}/dashboard`,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
