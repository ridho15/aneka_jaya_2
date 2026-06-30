"use client";

import { useEffect, useMemo } from "react";

type LocalAttachmentPreviewProps = {
  file?: File;
};

export function LocalAttachmentPreview({ file }: LocalAttachmentPreviewProps) {
  const url = useMemo(() => file ? URL.createObjectURL(file) : undefined, [file]);

  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  if (!file || !url) return null;
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-sm font-bold text-slate-800">Preview lampiran baru</p>
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={file.name} className="max-h-80 w-full rounded-lg border border-slate-200 object-contain" />
      ) : isPdf ? (
        <iframe src={url} title={file.name} className="h-80 w-full rounded-lg border border-slate-200 bg-white" />
      ) : (
        <p className="text-sm text-slate-500">Preview tidak tersedia untuk tipe file ini.</p>
      )}
    </div>
  );
}
