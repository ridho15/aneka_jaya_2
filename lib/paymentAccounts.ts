export const PAYMENT_ACCOUNTS_STORAGE_KEY = "aneka-jaya-transfer-accounts";
export type PaymentAccount = { id: string; bank: string; name: string; number: string };

export const INDONESIAN_BANKS = [
  "BCA", "Bank Mandiri", "BRI", "BNI", "BTN", "Bank Syariah Indonesia (BSI)", "CIMB Niaga", "CIMB Niaga Syariah",
  "Permata Bank", "Danamon", "OCBC", "Maybank Indonesia", "Panin Bank", "UOB Indonesia", "DBS Indonesia",
  "Bank Mega", "Bank Jago", "Bank Neo Commerce", "Seabank Indonesia", "Allo Bank", "Bank Raya Indonesia",
  "BTPN", "BTPN Syariah", "Bank Muamalat", "Bank Aladin Syariah", "Bank Victoria", "Bank Sinarmas",
  "Bank Central Asia Syariah", "Bank Mega Syariah", "Bank Aceh Syariah", "BPD Jawa Barat dan Banten (BJB)",
  "Bank DKI", "Bank Jateng", "Bank Jatim", "Bank Sumut", "Bank Sumsel Babel", "Bank Nagari", "Bank Kaltimtara",
  "Bank Papua", "Bank Sulselbar", "Bank NTT", "Bank Maluku Malut", "Lainnya"
] as const;

export function formatPaymentAccount(account: PaymentAccount) {
  return `${account.bank} — ${account.number} a.n. ${account.name}`;
}

export function readPaymentAccounts(): PaymentAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = window.localStorage.getItem(PAYMENT_ACCOUNTS_STORAGE_KEY);
    const accounts: unknown = saved ? JSON.parse(saved) : [];
    return Array.isArray(accounts) ? accounts.filter((account): account is PaymentAccount => Boolean(account && typeof account === "object" && typeof (account as PaymentAccount).id === "string" && typeof (account as PaymentAccount).bank === "string" && typeof (account as PaymentAccount).name === "string" && typeof (account as PaymentAccount).number === "string")) : [];
  } catch { return []; }
}
