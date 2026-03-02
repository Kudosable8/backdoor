'use client';

type DashboardErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard error</h1>
      <p className="text-sm text-muted-foreground">
        Something went wrong while loading your dashboard.
      </p>
      <p className="text-xs text-muted-foreground">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="w-fit rounded-md border px-3 py-2 text-sm"
      >
        Try again
      </button>
    </section>
  );
}
