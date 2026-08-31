export function EmptyState({
  icon = "🍽",
  title,
  message,
  action,
}: {
  icon?: string;
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-2xl ring-1 ring-brand-100">
        {icon}
      </div>
      <div>
        <div className="text-base font-semibold text-slate-900">{title}</div>
        {message && <div className="mt-1 text-sm text-slate-500">{message}</div>}
      </div>
      {action}
    </div>
  );
}
