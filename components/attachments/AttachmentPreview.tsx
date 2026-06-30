type AttachmentPreviewProps = {
  url: string;
  label?: string;
  className?: string;
};

function normalizedUrl(value: string) {
  return value.trim();
}

function isImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(url);
}

function isPdfUrl(url: string) {
  return /\.pdf(\?.*)?$/i.test(url);
}

export function AttachmentPreview({ url, label = "Lampiran", className = "" }: AttachmentPreviewProps) {
  const cleanUrl = normalizedUrl(url);
  if (!cleanUrl) return null;
  const preview = isImageUrl(cleanUrl) ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={cleanUrl} alt={label} className="max-h-96 w-full rounded-lg border border-slate-200 object-contain" />
  ) : isPdfUrl(cleanUrl) ? (
    <iframe src={cleanUrl} title={label} className="h-96 w-full rounded-lg border border-slate-200 bg-white" />
  ) : null;

  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50 p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-slate-800">{label}</p>
        <a href={cleanUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-emerald-700 underline underline-offset-2">
          Buka file
        </a>
      </div>
      {preview || <p className="text-sm text-slate-500">Preview tidak tersedia untuk tipe file ini. Gunakan tombol buka file.</p>}
    </div>
  );
}
