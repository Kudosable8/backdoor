'use server';

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type UpdateProfileResult = {
  error?: string;
  success?: boolean;
};

export async function updateProfileFullName(
  _prevState: UpdateProfileResult,
  formData: FormData,
): Promise<UpdateProfileResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "You must be signed in to update your profile." };
  }

  const fullName = String(formData.get("fullName") ?? "").trim();

  // TODO: Add stronger validation rules and user-facing field errors.
  if (!fullName) {
    return { error: "Full name is required." };
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);

  // TODO: Centralize error logging/monitoring for server actions.
  if (updateError) {
    return { error: "Could not update profile right now." };
  }

  revalidatePath("/dashboard");
  return { success: true };
}
