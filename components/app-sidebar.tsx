"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  BriefcaseBusiness,
  Building2,
  LayoutDashboard,
  Shield,
  Users,
} from "lucide-react";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { TeamSwitcher } from "@/components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { agencyRoleLabels, type AgencyRole } from "@/lib/features/auth/types";

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  agency?: {
    name: string;
    role: AgencyRole;
    slug: string;
  } | null;
  isSuperAdmin?: boolean;
  user?: {
    name?: string;
    email?: string;
  };
};

export function AppSidebar({
  agency = null,
  isSuperAdmin = false,
  user,
  ...props
}: AppSidebarProps) {
  const pathname = usePathname();
  const sidebarUser = {
    avatar: "/avatars/default-user.png",
    name: user?.name ?? "User",
    email: user?.email ?? "No email available",
  };
  const workspaceItems = [
    {
      title: "Workspace",
      url: "/dashboard",
      icon: LayoutDashboard,
      isActive:
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/imports") ||
        pathname.startsWith("/cases"),
      items: [
        {
          title: "Overview",
          url: "/dashboard",
        },
        ...(agency && agency.role !== "read_only" && agency.role !== "finance"
          ? [
              {
                title: "Imports",
                url: "/imports",
              },
            ]
          : []),
        ...(agency
          ? [
              {
                title: "Cases",
                url: "/cases",
              },
              ...(agency.role === "owner" ||
              agency.role === "manager" ||
              agency.role === "finance"
                ? [
                    {
                      title: "Research",
                      url: "/research",
                    },
                    {
                      title: "Audit",
                      url: "/audit",
                    },
                  ]
                : []),
            ]
          : []),
      ],
    },
  ];
  const teamItems =
    agency && (agency.role === "owner" || agency.role === "manager")
      ? [
          {
            title: "People",
            url: "/team",
            icon: Users,
            isActive: pathname.startsWith("/team"),
            items: [
              {
                title: "Team management",
                url: "/team",
              },
            ],
          },
        ]
      : [];
  const adminItems = [
    {
      title: "System",
      url: "#",
      icon: Shield,
      isActive: pathname.startsWith("/admin"),
      items: [
        {
          title: "Users",
          url: "/admin/users",
        },
      ],
    },
  ];
  const teams = [
    agency
      ? {
          name: agency.name,
          logo: Building2,
          plan: agencyRoleLabels[agency.role],
        }
      : {
          name: isSuperAdmin ? "Platform Admin" : "No Agency Assigned",
          logo: BriefcaseBusiness,
          plan: isSuperAdmin ? "Super Admin" : "Pending Invite",
        },
  ];

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain label="Workspace" items={workspaceItems} />
        {teamItems.length > 0 ? <NavMain label="Team" items={teamItems} /> : null}
        {isSuperAdmin ? <NavMain label="Admin" items={adminItems} /> : null}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={sidebarUser} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
