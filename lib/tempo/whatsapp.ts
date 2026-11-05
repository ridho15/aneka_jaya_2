/** Nomor HP lokal (08xx / 8xx / +62) ke format wa.me (62xx); null bila tidak masuk akal. */
export function waNumber(phone?: string | null) {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  return /^62\d{8,13}$/.test(digits) ? digits : null;
}
