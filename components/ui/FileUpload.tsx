"use client";
import { useState } from "react";
import { Input } from "./Input";

export function FileUpload({ onFileChange }: { onFileChange: (file?: File) => void }) {
  const [label, setLabel] = useState("Belum ada file dipilih");
  return <div><Input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; setLabel(file ? `${file.name} (${Math.ceil(file.size / 1024)} KB)` : "Belum ada file dipilih"); onFileChange(file); }} /> <p className="mt-1 text-xs text-slate-500">PDF, JPG, PNG, atau WEBP. Maks. 5 MB. {label}</p></div>;
}
