import { NextResponse } from "next/server";

import type { AppUserContext } from "@/lib/features/auth/server";
import {
  backfillResearchChecksForAgency,
  processPendingCaseChecks,
} from "@/lib/features/cases/research";
import type { AgencyRole } from "@/lib/features/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";

type AgencyActorRow = {
  agencies: {
    name: string;
    slug: string;
  } | {
    name: string;
    slug: string;
  }[] | null;
  agency_id: string;
  role: AgencyRole;
  user_id: string;
};

function isAuthorized(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    throw new Error("CRON_SECRET is not configured");
  }

  const authorization = request.headers.get("authorization");

  return authorization === `Bearer ${expectedSecret}`;
}

function getAgencyJoin(
  value: AgencyActorRow["agencies"],
): { name: string; slug: string } | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] ?? null : value;
}

async function buildAutomationAppUser(args: {
  actor: AgencyActorRow;
}): Promise<AppUserContext> {
  const adminClient = createAdminClient();
  const agency = getAgencyJoin(args.actor.agencies);

  return {
    agency: {
      agencyId: args.actor.agency_id,
      agencyName: agency?.name ?? "Agency",
      agencySlug: agency?.slug ?? "agency",
      role: args.actor.role,
    },
    isSuperAdmin: false,
    platformRoles: [],
    profile: null,
    supabase: adminClient as never,
    user: {
      email: "automation@system.local",
      id: args.actor.user_id,
    },
  };
}

async function handleRequest(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const [{ data: activeCaseRows, error: activeCasesError }, { data: actorRows, error: actorsError }] =
      await Promise.all([
        adminClient
          .from("cases")
          .select("agency_id")
          .in("research_status", ["not_started", "queued", "failed", "in_progress"]),
        adminClient
          .from("agency_memberships")
          .select("agency_id, user_id, role, agencies(name, slug)")
          .in("role", ["owner", "manager", "recruiter", "finance"])
          .order("created_at", { ascending: true }),
      ]);

    if (activeCasesError || actorsError) {
      throw new Error(activeCasesError?.message ?? actorsError?.message);
    }

    const actorByAgencyId = new Map<string, AgencyActorRow>();

    for (const row of ((actorRows as AgencyActorRow[] | null) ?? [])) {
      if (!actorByAgencyId.has(row.agency_id)) {
        actorByAgencyId.set(row.agency_id, row);
      }
    }

    const agencyIds = Array.from(
      new Set(
        (((activeCaseRows as { agency_id: string }[] | null) ?? []).map(
          (row) => row.agency_id,
        )),
      ),
    );

    const summary = {
      agenciesProcessed: 0,
      checksCompleted: 0,
      evidenceCreated: 0,
      checksFailed: 0,
      checksProcessed: 0,
      checksSkipped: 0,
    };

    for (const agencyId of agencyIds) {
      const actor = actorByAgencyId.get(agencyId);

      if (!actor) {
        continue;
      }

      const appUser = await buildAutomationAppUser({ actor });

      await backfillResearchChecksForAgency({
        appUser,
        limit: 50,
      });

      const result = await processPendingCaseChecks({
        appUser,
        limit: 50,
      });

      summary.agenciesProcessed += 1;
      summary.checksCompleted += result.completed;
      summary.checksFailed += result.failed;
      summary.checksProcessed += result.processed;
      summary.checksSkipped += result.skipped;
      summary.evidenceCreated += result.evidenceCreated;
    }

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to run background research",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return handleRequest(request);
}

export async function POST(request: Request) {
  return handleRequest(request);
}
