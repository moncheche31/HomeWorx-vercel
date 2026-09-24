import type { ReactNode } from "react";

interface FullPageErrorProps {
  title: string;
  description: string;
  referenceId?: string;
  action?: ReactNode;
}

export function FullPageError({ title, description, referenceId, action }: FullPageErrorProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-safe">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{description}</p>
        {referenceId && (
          <p className="mt-4 text-xs text-muted-foreground">
            Reference ID: <code className="rounded bg-muted px-1.5 py-0.5">{referenceId}</code>
          </p>
        )}
        {action && <div className="mt-6 flex justify-center">{action}</div>}
      </div>
    </main>
  );
}
