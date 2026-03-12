import { NextResponse } from "next/server";

import { requireAgencyRole } from "@/lib/features/auth/server";
import { processPendingCaseChecks, retryCaseChecks } from "@/lib/features/cases/research";

type RouteContext = {
  params: Promise<{
    caseId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const appUser = await requireAgencyRole(["owner", "manager", "recruiter", "finance"]);
  const { caseId } = await context.params;

  try {
    await retryCaseChecks({
      appUser,
      caseId,
    });

    const summary = await processPendingCaseChecks({
      appUser,
      caseId,
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
        error: error instanceof Error ? error.message : "Unable to retry case research",
      },
      { status: 500 },
    );
  }
}
