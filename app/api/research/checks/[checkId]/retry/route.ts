import { NextResponse } from "next/server";

import { requireAgencyRole } from "@/lib/features/auth/server";
import { processPendingCaseChecks, retryCaseChecks } from "@/lib/features/cases/research";

type RouteContext = {
  params: Promise<{
    checkId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const appUser = await requireAgencyRole(["owner", "manager", "recruiter", "finance"]);
  const { checkId } = await context.params;

  try {
    const { data: checkRow, error: checkError } = await appUser.supabase
      .from("case_checks")
      .select("case_id")
      .eq("agency_id", appUser.agency.agencyId)
      .eq("id", checkId)
      .maybeSingle();

    if (checkError || !checkRow) {
      return NextResponse.json(
        { error: checkError?.message ?? "Research check not found" },
        { status: 404 },
      );
    }

    await retryCaseChecks({
      appUser,
      checkId,
    });

    const summary = await processPendingCaseChecks({
      appUser,
      caseId: (checkRow as { case_id: string }).case_id,
      limit: 10,
      triggerSource: "case_manual",
    });

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to retry research check",
      },
      { status: 500 },
    );
  }
}
