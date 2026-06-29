export function LoadingState({ text = "Memuat data..." }: { text?: string }) { return <p className="rounded-lg bg-white p-6 text-sm text-slate-500 shadow-sm">{text}</p>; }
