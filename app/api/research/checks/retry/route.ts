import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAgencyRole } from "@/lib/features/auth/server";
import {
  processPendingCaseChecks,
  retryCaseChecks,
  transientResearchErrorCodes,
  type ResearchErrorCode,
} from "@/lib/features/cases/research";

const retryChecksSchema = z.object({
  errorCodes: z.array(z.string()).optional(),
  transientOnly: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  const appUser = await requireAgencyRole(["owner", "manager", "recruiter", "finance"]);
  const payload = await request.json().catch(() => null);
  const parsedPayload = retryChecksSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return NextResponse.json(
      { error: parsedPayload.error.issues[0]?.message ?? "Invalid retry request" },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await appUser.supabase
      .from("case_checks")
      .select("id, result_json, status")
      .eq("agency_id", appUser.agency.agencyId)
      .eq("status", "failed");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const allowedCodes = (
      parsedPayload.data.transientOnly
        ? transientResearchErrorCodes
        : ((parsedPayload.data.errorCodes ?? []) as ResearchErrorCode[])
    );
    const checkIds = (((data as
      | {
          id: string;
          result_json: {
            errorCode?: ResearchErrorCode;
          } | null;
          status: string;
        }[]
      | null) ?? [])).filter((row) => {
      const code = row.result_json?.errorCode;

      return code ? allowedCodes.includes(code) : false;
    }).map((row) => row.id);

    if (checkIds.length === 0) {
      return NextResponse.json({
        success: true,
        summary: {
          completed: 0,
          evidenceCreated: 0,
          failed: 0,
          processed: 0,
          skipped: 0,
        },
      });
    }

    await retryCaseChecks({
      appUser,
      checkIds,
    });

    const summary = await processPendingCaseChecks({
      appUser,
      limit: 25,
      triggerSource: "manual",
    });

    return NextResponse.json({
      success: true,
      summary,
      retriedCheckCount: checkIds.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to bulk retry research checks",
      },
      { status: 500 },
    );
  }
}
