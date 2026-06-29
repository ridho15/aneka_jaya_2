"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { INDONESIAN_BANKS, PAYMENT_ACCOUNTS_STORAGE_KEY, readPaymentAccounts, type PaymentAccount } from "@/lib/paymentAccounts";

export function PaymentListSettings() {
  const [accounts, setAccounts] = useState<PaymentAccount[]>(() => readPaymentAccounts());
  const [bank, setBank] = useState("");
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const save = (next: PaymentAccount[]) => { setAccounts(next); localStorage.setItem(PAYMENT_ACCOUNTS_STORAGE_KEY, JSON.stringify(next)); };
  const add = () => { if (!bank || !name.trim() || !number.trim()) return; save([...accounts, { id: crypto.randomUUID(), bank, name: name.trim(), number: number.trim() }]); setBank(""); setName(""); setNumber(""); };
  return <section className="aj-surface mt-6 max-w-3xl p-5 sm:p-6"><div className="mb-5"><p className="text-xs font-bold uppercase tracking-[0.13em] text-slate-500">Pembayaran</p><h3 className="mt-1 text-lg font-bold tracking-tight">Daftar rekening transfer</h3><p className="mt-1 text-sm text-slate-600">Pilihan ini muncul saat metode pembayaran TF dipakai pada penjualan.</p></div><div className="grid gap-3 sm:grid-cols-3"><Select value={bank} onChange={(event) => setBank(event.target.value)}><option value="">Pilih bank</option>{INDONESIAN_BANKS.map((item) => <option key={item} value={item}>{item}</option>)}</Select><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama pemilik rekening" /><Input value={number} inputMode="numeric" onChange={(event) => setNumber(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} placeholder="Nomor rekening" /></div><div className="mt-3 flex justify-end"><Button type="button" onClick={add}>Tambah rekening</Button></div><div className="mt-5 divide-y divide-slate-100 border-y border-slate-100">{accounts.map((account) => <div key={account.id} className="flex items-center justify-between gap-4 py-3 text-sm"><div><p className="font-semibold text-slate-800">{account.bank}</p><p className="mt-0.5 text-slate-600">{account.name} · {account.number}</p></div><button type="button" onClick={() => save(accounts.filter((item) => item.id !== account.id))} className="text-xs font-semibold text-red-600 hover:text-red-700">Hapus</button></div>)}{accounts.length === 0 && <p className="py-4 text-sm text-slate-500">Belum ada rekening transfer. Tambahkan bank, nama, dan nomor rekening di atas.</p>}</div><p className="mt-4 text-xs text-slate-500">Daftar ini tersimpan pada browser perangkat ini.</p></section>;
}
