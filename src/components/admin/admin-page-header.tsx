import type { ReactNode } from "react";

export function AdminPageHeader({
  title,
  description,
}: {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <header className="min-w-0">
      <h1 className="page-heading">{title}</h1>
      {description ? (
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      ) : null}
    </header>
  );
}
