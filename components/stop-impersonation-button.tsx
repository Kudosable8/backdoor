"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function StopImpersonationButton() {
  const [isStopping, setIsStopping] = useState(false);

  const handleStop = async () => {
    if (isStopping) {
      return;
    }

    setIsStopping(true);

    try {
      const response = await fetch("/api/admin/impersonation/stop", {
        method: "POST",
      });
      const result = (await response.json().catch(() => null)) as
        | { actionLink?: string; error?: string }
        | null;

      if (!response.ok || !result?.actionLink) {
        throw new Error(result?.error ?? "Unable to end impersonation");
      }

      window.location.assign(result.actionLink);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to end impersonation",
      );
      setIsStopping(false);
    }
  };

  return (
    <Button size="sm" variant="outline" disabled={isStopping} onClick={handleStop}>
      {isStopping ? "Returning..." : "Return to super admin"}
    </Button>
  );
}
