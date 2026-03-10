import { NextResponse } from "next/server";

import { logAuditEvent } from "@/lib/features/audit/server";
import { requireAgencyRole } from "@/lib/features/auth/server";
import { buildCaseExportMarkdown } from "@/lib/features/cases/export";
import { getCaseDetailData } from "@/lib/features/cases/server";

export async function GET(_request: Request, context: { params: Promise<{ caseId: string }> }) {
  const appUser = await requireAgencyRole(["owner", "manager", "finance"]);
  const { caseId } = await context.params;
  const caseData = await getCaseDetailData({ appUser, caseId });
  const markdown = buildCaseExportMarkdown({
    caseItem: caseData.caseItem,
    evidenceItems: caseData.evidenceItems,
    outreachDrafts: caseData.outreachMessages,
    scoreEvents: caseData.scoreEvents,
  });

  await logAuditEvent({
    action: "exported",
    appUser,
    entityId: caseId,
    entityType: "case_export",
    metadata: {
      evidenceCount: caseData.evidenceItems.length,
      outreachDraftCount: caseData.outreachMessages.length,
      scoreEventCount: caseData.scoreEvents.length,
    },
  });

  return new NextResponse(markdown, {
    headers: {
      "Content-Disposition": `attachment; filename="case-${caseId}.md"`,
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
