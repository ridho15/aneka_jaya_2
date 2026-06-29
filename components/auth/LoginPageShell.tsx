import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";

export function LoginPageShell() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7f7f4] text-neutral-950">
      <section className="mx-auto grid min-h-screen w-full max-w-6xl gap-0 px-5 py-6 sm:px-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(380px,0.75fr)] lg:items-center lg:gap-12 lg:px-10">
        <div className="order-2 hidden pb-8 pt-8 lg:order-1 lg:block">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-sm bg-emerald-600 text-lg font-black tracking-tight text-white">AJ</span>
            <div>
              <p className="text-sm font-bold text-neutral-950">Aneka Jaya Internal App</p>
              <p className="mt-0.5 text-xs font-medium text-neutral-500">Sistem operasional internal</p>
            </div>
          </div>

          <div className="mt-12 max-w-xl">
            <p className="text-sm font-semibold text-emerald-700">Aneka Jaya</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight text-neutral-950 sm:text-5xl">Akses kerja yang rapi untuk tim internal.</h1>
            <p className="mt-5 max-w-lg text-base leading-8 text-neutral-600">
              Masuk dengan akun yang sudah dibuat Super Admin untuk melanjutkan pekerjaan penjualan, tempo, approval, stok, dan laporan sesuai permission Anda.
            </p>
          </div>

          <div className="mt-12 grid max-w-xl grid-cols-3 gap-3 text-sm">
            <div className="border-l border-neutral-300 pl-4">
              <p className="font-bold text-neutral-950">Akun internal</p>
              <p className="mt-1 leading-6 text-neutral-500">Email atau username</p>
            </div>
            <div className="border-l border-neutral-300 pl-4">
              <p className="font-bold text-neutral-950">Permission</p>
              <p className="mt-1 leading-6 text-neutral-500">Mengikuti role user</p>
            </div>
            <div className="border-l border-neutral-300 pl-4">
              <p className="font-bold text-neutral-950">Operasional</p>
              <p className="mt-1 leading-6 text-neutral-500">Data kerja harian</p>
            </div>
          </div>
        </div>

        <div className="order-1 flex min-h-[calc(100vh-3rem)] items-center lg:order-2 lg:min-h-0">
          <div className="w-full rounded-sm border border-neutral-200 bg-white p-5 shadow-[0_24px_70px_rgba(23,23,23,0.08)] sm:p-7">
            <div className="flex items-center gap-3 lg:hidden">
              <span className="grid h-11 w-11 place-items-center rounded-sm bg-emerald-600 text-base font-black tracking-tight text-white">AJ</span>
              <div>
                <p className="text-sm font-bold text-neutral-950">Aneka Jaya Internal App</p>
                <p className="mt-0.5 text-xs font-medium text-neutral-500">Sistem operasional internal</p>
              </div>
            </div>

            <div className="mt-7 lg:mt-0">
              <p className="hidden text-sm font-bold text-neutral-950 lg:block">Aneka Jaya Internal App</p>
              <h2 className="mt-2 text-2xl font-bold leading-tight text-neutral-950">Masuk ke sistem</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-500">Gunakan email dan password akun Anika ERP Anda.</p>
            </div>

            <LoginForm className="mt-6" />

            <div className="mt-5 border-t border-neutral-200 pt-4">
              <p className="text-sm leading-6 text-neutral-500">Hubungi Super Admin jika tidak bisa masuk.</p>
              <Link href="/no-access" className="mt-2 inline-flex text-xs font-semibold text-neutral-500 underline-offset-4 hover:text-emerald-700 hover:underline">
                Lihat status akses
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
