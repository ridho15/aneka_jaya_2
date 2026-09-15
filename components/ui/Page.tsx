import type { ReactNode } from "react";

export function PageContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1440px] ${className}`}>{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className = "",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end ${className}`}>
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-600">{eyebrow}</p> : null}
        <h2 className="aj-page-title mt-1.5 text-3xl font-bold sm:text-[2rem]">{title}</h2>
        {description ? <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`aj-surface ${className}`}>{children}</section>;
}

export function Section({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      {title || description || actions ? (
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <div>
            <h3 className="font-bold text-slate-950">{title}</h3>
            {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </Card>
  );
}
