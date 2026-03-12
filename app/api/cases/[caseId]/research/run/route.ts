import { NextResponse } from "next/server";

import { requireAgencyRole } from "@/lib/features/auth/server";
import {
  ensureCaseResearchChecks,
  processPendingCaseChecks,
} from "@/lib/features/cases/research";

type RouteContext = {
  params: Promise<{
    caseId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const appUser = await requireAgencyRole(["owner", "manager", "recruiter", "finance"]);
  const { caseId } = await context.params;

  try {
    await ensureCaseResearchChecks({
      agencyId: appUser.agency.agencyId,
      caseId,
      supabase: appUser.supabase,
    });

    const summary = await processPendingCaseChecks({
      appUser,
      caseId,
      limit: 10,
    });

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to run case research",
      },
      { status: 500 },
    );
  }
}
