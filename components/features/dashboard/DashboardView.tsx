import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DashboardViewProps = {
  email: string;
  fullName: string;
  userId: string;
};

export function DashboardView({ email, fullName, userId }: DashboardViewProps) {
  return (
    <section className="flex flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Your authenticated workspace starter is ready.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Profile summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="font-medium">Full name:</span> {fullName}
          </p>
          <p>
            <span className="font-medium">Email:</span> {email}
          </p>
          <p>
            <span className="font-medium">User ID:</span> {userId}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Widget placeholder</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Add your first metrics or activity card here.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Roadmap TODOs</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Build profile update action</li>
              <li>Add dashboard data widgets</li>
              <li>Add loading and error states</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
