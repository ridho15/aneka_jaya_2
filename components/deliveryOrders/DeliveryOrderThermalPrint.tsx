"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DeliveryOrderData } from "@/lib/deliveryOrders/types";
import { formatJakartaDate } from "@/lib/date/jakarta";
import {
  generateDeliveryOrderEscPos,
  generateDeliveryOrderThermalText,
  generateRawBtUrl
} from "@/lib/print/thermalEscpos";

interface Props {
  detail: DeliveryOrderData;
  autoPrint?: boolean;
}

// Web Bluetooth Type Definitions
interface BluetoothRemoteGATTCharacteristic {
  properties: {
    write?: boolean;
    writeWithoutResponse?: boolean;
  };
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
}

interface BluetoothRemoteGATTServer {
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string): Promise<{
    getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>;
  }>;
  getPrimaryServices(): Promise<Array<{
    getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>;
  }>>;
}

interface BluetoothDevice {
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
}

interface BluetoothNavigator {
  bluetooth?: {
    requestDevice(options: {
      acceptAllDevices?: boolean;
      optionalServices?: string[];
      filters?: Array<{ services?: string[] }>;
    }): Promise<BluetoothDevice>;
  };
}

// Common Bluetooth Printer Service UUIDs
const BLUETOOTH_PRINT_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb", // Standard ESC/POS Service
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // Common Chinese Thermal POS
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // ISSC Transparent / BLE POS
  "0000ff00-0000-1000-8000-00805f9b34fb", // Vendor specific POS
  "0000fee7-0000-1000-8000-00805f9b34fb"  // Tencent / Portable POS
];

// Clean Monochrome SVG Icons (Strictly Sized & Non-Distorting)
function PrinterIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`w-3.5 h-3.5 shrink-0 ${className}`.trim()} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
    </svg>
  );
}

function BluetoothIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`w-3.5 h-3.5 shrink-0 ${className}`.trim()} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 6.5l11 11L12 23V1l5.5 5.5-11 11" />
    </svg>
  );
}

function CopyIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`w-3.5 h-3.5 shrink-0 ${className}`.trim()} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`w-3.5 h-3.5 shrink-0 ${className}`.trim()} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ExternalLinkIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`w-3.5 h-3.5 shrink-0 ${className}`.trim()} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

function ArrowLeftIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`w-3.5 h-3.5 shrink-0 ${className}`.trim()} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

function AlertCircleIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 shrink-0 ${className}`.trim()} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`w-3.5 h-3.5 shrink-0 ${className}`.trim()} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export function DeliveryOrderThermalPrint({ detail, autoPrint = false }: Props) {
  const [isBluetoothPrinting, setIsBluetoothPrinting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [supportsBluetooth, setSupportsBluetooth] = useState<boolean>(false);
  const [bannerAlert, setBannerAlert] = useState<{
    type: "info" | "error" | "success";
    message: string;
  } | null>(null);

  useEffect(() => {
    const nav = typeof navigator !== "undefined" ? (navigator as unknown as BluetoothNavigator) : null;
    setSupportsBluetooth(Boolean(nav?.bluetooth));

    if (autoPrint) {
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoPrint]);

  // Direct Web Bluetooth ESC/POS Print
  const handleBluetoothPrint = async () => {
    const nav = typeof navigator !== "undefined" ? (navigator as unknown as BluetoothNavigator) : null;
    if (!nav?.bluetooth) {
      setBannerAlert({
        type: "error",
        message: "Browser tidak mendukung Web Bluetooth. Gunakan browser Chromium (Chrome/Edge di Android/PC) atau gunakan Cetak Standar."
      });
      return;
    }

    setIsBluetoothPrinting(true);
    setBannerAlert({
      type: "info",
      message: "Sedang mencari printer thermal Bluetooth..."
    });

    try {
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: BLUETOOTH_PRINT_SERVICES
      });

      setBannerAlert({
        type: "info",
        message: `Menghubungkan ke ${device.name || "Printer Bluetooth"}...`
      });

      if (!device.gatt) {
        throw new Error("GATT server tidak tersedia pada perangkat Bluetooth ini.");
      }

      const server = await device.gatt.connect();
      let writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

      for (const serviceUuid of BLUETOOTH_PRINT_SERVICES) {
        try {
          const service = await server.getPrimaryService(serviceUuid);
          const characteristics = await service.getCharacteristics();
          for (const char of characteristics) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              writeCharacteristic = char;
              break;
            }
          }
          if (writeCharacteristic) break;
        } catch {
          // Continue scanning services
        }
      }

      if (!writeCharacteristic) {
        const services = await server.getPrimaryServices();
        for (const service of services) {
          const characteristics = await service.getCharacteristics();
          for (const char of characteristics) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              writeCharacteristic = char;
              break;
            }
          }
          if (writeCharacteristic) break;
        }
      }

      if (!writeCharacteristic) {
        throw new Error("Karakteristik cetak ESC/POS tidak ditemukan pada printer ini.");
      }

      setBannerAlert({
        type: "info",
        message: "Mengirim data cetak ke printer..."
      });

      const escPosData = generateDeliveryOrderEscPos(detail);
      const CHUNK_SIZE = 100;
      for (let i = 0; i < escPosData.length; i += CHUNK_SIZE) {
        const chunk = escPosData.slice(i, i + CHUNK_SIZE);
        if (writeCharacteristic.properties.writeWithoutResponse) {
          await writeCharacteristic.writeValueWithoutResponse(chunk);
        } else {
          await writeCharacteristic.writeValue(chunk);
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      setBannerAlert({
        type: "success",
        message: `Berhasil mencetak DO #${detail.doNumber} via Bluetooth.`
      });

      setTimeout(() => {
        try {
          device.gatt?.disconnect();
        } catch {
          // Ignore disconnect error
        }
      }, 1500);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Gagal mencetak via Bluetooth.";
      if (!errorMsg.includes("User cancelled")) {
        setBannerAlert({
          type: "error",
          message: `Koneksi Bluetooth: ${errorMsg}. Pastikan printer 80mm sudah menyala dan dalam status siap pairing.`
        });
      } else {
        setBannerAlert(null);
      }
    } finally {
      setIsBluetoothPrinting(false);
    }
  };

  const handleCopyText = async () => {
    try {
      const text = generateDeliveryOrderThermalText(detail);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setBannerAlert({
        type: "success",
        message: "Format teks struk thermal 48 kolom berhasil disalin ke clipboard."
      });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setBannerAlert({
        type: "error",
        message: "Gagal menyalin teks struk ke clipboard."
      });
    }
  };

  const totalQty = detail.items.reduce((sum, item) => sum + item.quantity, 0);
  const tanggalKirim = detail.sale.deliveryAt ? formatJakartaDate(detail.sale.deliveryAt) : formatJakartaDate(detail.sale.saleDate);
  const driverName = detail.shippedByNameSnapshot || detail.assignedUserName || "-";

  return (
    <div className="min-h-screen bg-slate-100/80 py-6 px-4 print:bg-white print:p-0">
      {/* Print Styles for 80mm Roll (Effective printable width ~72mm) */}
      <style jsx global>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 0mm !important;
          }
          html, body {
            background-color: #fff !important;
            color: #000 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
          .thermal-slip-container {
            width: 72mm !important;
            max-width: 72mm !important;
            margin: 0 auto !important;
            padding: 2mm 1mm !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
          }
        }
      `}</style>

      {/* Enterprise Control Toolbar (Hidden when printing) */}
      <div className="no-print max-w-[360px] mx-auto mb-4 bg-white rounded-xl shadow-sm border border-slate-200 p-3.5">
        {/* Top Header Row */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <Link
            href={`/delivery-orders/${detail.id}`}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 transition-colors"
          >
            <ArrowLeftIcon />
            <span>Detail DO</span>
          </Link>
          <div className="flex items-center gap-1.5">
            <h1 className="text-xs font-bold text-slate-900">
              Cetak DO Thermal
            </h1>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
              80mm
            </span>
          </div>
        </div>

        {/* Action Buttons Toolbar (Compact & Balanced 2x2 Grid) */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {/* Universal Print Dialog (Primary Action) */}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white font-semibold text-xs shadow-sm hover:bg-emerald-700 transition-colors"
          >
            <PrinterIcon />
            <span>Cetak Dialog</span>
          </button>

          {/* Direct Web Bluetooth ESC/POS */}
          <button
            type="button"
            onClick={handleBluetoothPrint}
            disabled={isBluetoothPrinting}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold text-xs shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
            title={supportsBluetooth ? "Cetak langsung via Web Bluetooth" : "Memerlukan browser berbasis Chromium"}
          >
            <BluetoothIcon className={isBluetoothPrinting ? "animate-spin" : ""} />
            <span>{isBluetoothPrinting ? "Koneksi..." : "Bluetooth"}</span>
          </button>

          {/* Copy Receipt Text */}
          <button
            type="button"
            onClick={handleCopyText}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium text-xs shadow-sm hover:bg-slate-50 transition-colors"
            title="Salin teks struk 48 kolom untuk dicetak via aplikasi lain"
          >
            {copied ? <CheckIcon className="text-emerald-600" /> : <CopyIcon />}
            <span>{copied ? "Tersalin" : "Salin Teks"}</span>
          </button>

          {/* Android RawBT Intent */}
          <a
            href={generateRawBtUrl(detail)}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium text-xs shadow-sm hover:bg-slate-50 transition-colors"
            title="Kirim ke aplikasi RawBT Driver di Android"
          >
            <ExternalLinkIcon />
            <span>Buka RawBT</span>
          </a>
        </div>

        {/* Non-Blocking Status & Alert Feedback */}
        {bannerAlert && (
          <div
            className={`mt-3.5 p-3 rounded-lg text-xs font-medium flex items-start justify-between gap-2 transition-all ${
              bannerAlert.type === "error"
                ? "bg-red-50 border border-red-200 text-red-800"
                : bannerAlert.type === "success"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-slate-100 border border-slate-200 text-slate-800"
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertCircleIcon className="shrink-0 mt-0.5" />
              <span>{bannerAlert.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setBannerAlert(null)}
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors"
              title="Tutup pesan"
            >
              <XIcon />
            </button>
          </div>
        )}

        {/* Technical Sub-info */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>Lebar efektif: ~72mm (48 kolom karakter)</span>
          <span>Protokol: ESC/POS Raster &amp; Text</span>
        </div>
      </div>

      {/* Realistic 80mm Physical Thermal Paper Slip */}
      <div className="max-w-[340px] mx-auto select-none print:select-auto">
        {/* Top Paper Tear Sawtooth Edge (Visual only, hidden on print) */}
        <div
          aria-hidden="true"
          className="no-print h-2.5 w-full bg-[linear-gradient(135deg,transparent_4px,#ffffff_0),linear-gradient(-135deg,transparent_4px,#ffffff_0)] bg-[size:10px_10px] bg-repeat-x"
        />

        {/* Thermal Slip Body (Pure 1-Bit Monochrome, Zero Dithering) */}
        <div
          className="thermal-slip-container w-full bg-white text-black px-4 py-3 shadow-md print:shadow-none print:p-0"
          style={{
            fontFamily: "'Courier New', Courier, 'Lucida Console', Monaco, monospace",
            fontSize: "12px",
            lineHeight: "1.25"
          }}
        >
          {/* Header Toko */}
          <div className="text-center pb-2 border-b-2 border-black">
            <div className="font-extrabold text-sm tracking-wider">ANEKA JAYA / SLM</div>
            <div className="text-[11px] font-bold">SURAT JALAN PENGIRIMAN (DO)</div>
          </div>

          {/* 1. JUMBO NAMA PELANGGAN (PALING BESAR, 100% MONOKROM) */}
          <div className="my-3 py-2 px-1 text-center border-2 border-black">
            <div className="text-[9px] font-bold uppercase tracking-widest text-black">
              TUJUAN / PELANGGAN:
            </div>
            <div className="text-2xl font-black uppercase tracking-wide leading-tight mt-0.5 break-words">
              {detail.sale.customerName || "PELANGGAN"}
            </div>
          </div>

          {/* 2. NO INVOICE & NO DO (MENONJOL) */}
          <div className="text-center border-b border-dashed border-black pb-2 mb-2">
            <div className="text-base font-black">
              INV: {detail.sale.transactionNumber || "—"}
            </div>
            <div className="text-[11px] font-bold mt-0.5">
              DO: {detail.doNumber}
            </div>
          </div>

          {/* Info Pengiriman (Bebas Emoji) */}
          <div className="space-y-1 text-[11px] pb-2 border-b border-dashed border-black">
            <div className="flex justify-between">
              <span className="font-medium">Tanggal Kirim:</span>
              <span className="font-bold">{tanggalKirim}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Ekspedisi:</span>
              <span className="font-bold">{detail.sale.shippingMethod || "Kurir Toko"}</span>
            </div>
            {detail.trackingNumber && (
              <div className="flex justify-between">
                <span className="font-medium">No. Resi:</span>
                <span className="font-bold">{detail.trackingNumber}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="font-medium">Petugas/Kurir:</span>
              <span className="font-bold">{driverName}</span>
            </div>
            <div className="pt-1">
              <span className="font-bold block text-[10px] uppercase">Alamat Tujuan:</span>
              <div className="font-bold break-words mt-0.5">
                {detail.sale.customerLocation || "-"}
              </div>
            </div>
          </div>

          {/* Tabel Barang (Strictly Masked: No Prices, Pure Black & White) */}
          <div className="py-2 border-b-2 border-black">
            <div className="flex justify-between font-bold text-[11px] uppercase pb-1 border-b border-black">
              <span>Daftar Barang</span>
              <span>Lokasi Rak</span>
            </div>
            <div className="divide-y divide-dashed divide-black/40 pt-1">
              {detail.items.map((item, idx) => (
                <div key={item.id || idx} className="py-1.5 text-[11px]">
                  <div className="font-bold">
                    {idx + 1}. {item.productNameSnapshot || item.productRef}
                  </div>
                  <div className="flex justify-between items-center mt-0.5 pl-3">
                    <span className="font-extrabold text-xs">
                      {item.quantity} {item.unitSnapshot || "PCS"}
                    </span>
                    <span className="font-bold text-[10px] border border-black px-1.5 py-0.5">
                      Rak: {item.rackNameSnapshot || item.warehouseNameSnapshot || "-"}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between font-bold text-[11px] pt-2 mt-1 border-t border-black">
              <span>TOTAL: {detail.items.length} Macam Barang</span>
              <span className="text-xs font-black">{totalQty} Unit</span>
            </div>
          </div>

          {/* Catatan Tambahan (jika ada) */}
          {detail.notes && (
            <div className="py-2 text-[11px] border-b border-dashed border-black">
              <span className="font-bold block text-[10px] uppercase">Catatan:</span>
              <div className="italic break-words mt-0.5">
                {detail.notes}
              </div>
            </div>
          )}

          {/* Kolom Tanda Tangan */}
          <div className="pt-3 pb-2">
            <div className="text-[10px] font-bold text-center mb-1.5">
              Tanda Tangan Serah Terima:
            </div>
            <div className="grid grid-cols-2 gap-2 text-center text-[11px]">
              <div>
                <div className="font-semibold mb-8">
                  Pengirim / Sopir
                </div>
                <div className="border-t border-black pt-1 font-bold">
                  ( {driverName !== "-" ? driverName : " ................ " } )
                </div>
              </div>
              <div>
                <div className="font-semibold mb-8">
                  Penerima / Toko
                </div>
                <div className="border-t border-black pt-1 font-bold">
                  ( ................ )
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-[9px] font-medium pt-2 border-t border-black/40">
            Harap periksa kelengkapan barang saat serah terima.
            <br />
            Dicetak dari Sistem SLM
          </div>
        </div>

        {/* Bottom Paper Tear Sawtooth Edge (Visual only, hidden on print) */}
        <div
          aria-hidden="true"
          className="no-print h-2.5 w-full bg-[linear-gradient(45deg,transparent_4px,#ffffff_0),linear-gradient(-45deg,transparent_4px,#ffffff_0)] bg-[size:10px_10px] bg-repeat-x"
        />
      </div>
    </div>
  );
}
