import { NextResponse } from "next/server";

import { requireAgencyRole } from "@/lib/features/auth/server";
import {
  backfillResearchChecksForAgency,
  processPendingCaseChecks,
} from "@/lib/features/cases/research";

export async function POST() {
  const appUser = await requireAgencyRole(["owner", "manager", "recruiter", "finance"]);

  try {
    await backfillResearchChecksForAgency({
      appUser,
      limit: 25,
    });

    const summary = await processPendingCaseChecks({
      appUser,
      limit: 25,
    });

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to run queued research checks",
      },
      { status: 500 },
    );
  }
}
