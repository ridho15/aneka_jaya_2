"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DeliveryOrderData } from "@/lib/deliveryOrders/types";
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
  const [viewOrientation, setViewOrientation] = useState<"roll" | "horizontal">("roll");
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

      if (!device.gatt) {
        throw new Error("GATT Server tidak tersedia pada perangkat Bluetooth.");
      }

      setBannerAlert({
        type: "info",
        message: `Menghubungkan ke ${device.name || "Printer Thermal"}...`
      });

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
          // Continue trying other candidate services
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
        message: "Format teks struk thermal (Nomor Invoice & Nama Customer) berhasil disalin."
      });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setBannerAlert({
        type: "error",
        message: "Gagal menyalin teks struk ke clipboard."
      });
    }
  };

  // Pure raw values without labels
  const invoiceNumber = detail.sale.transactionNumber || detail.doNumber;
  const customerName = (detail.sale.customerName || "CUSTOMER").toUpperCase();

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
            padding: 4mm 1mm !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
          }
          .print-jumbo-invoice {
            font-size: 52pt !important;
            line-height: 0.9 !important;
          }
          .print-jumbo-customer {
            font-size: 42pt !important;
            line-height: 0.9 !important;
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
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white font-semibold text-xs shadow-sm hover:bg-emerald-700 transition-colors cursor-pointer"
          >
            <PrinterIcon />
            <span>Cetak Dialog</span>
          </button>

          {/* Direct Web Bluetooth ESC/POS */}
          <button
            type="button"
            onClick={handleBluetoothPrint}
            disabled={isBluetoothPrinting}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold text-xs shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
            title={supportsBluetooth ? "Cetak langsung via Web Bluetooth" : "Memerlukan browser berbasis Chromium"}
          >
            <BluetoothIcon className={isBluetoothPrinting ? "animate-spin" : ""} />
            <span>{isBluetoothPrinting ? "Koneksi..." : "Bluetooth"}</span>
          </button>

          {/* Copy Receipt Text */}
          <button
            type="button"
            onClick={handleCopyText}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium text-xs shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
            title="Salin teks struk (No Invoice & Nama Customer)"
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

        {/* View Orientation Switch (Roll Mode vs Horizontal Mode) */}
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
          <span className="text-slate-500 font-medium">Orientasi:</span>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            <button
              type="button"
              onClick={() => setViewOrientation("roll")}
              className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                viewOrientation === "roll"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Roll Vertikal
            </button>
            <button
              type="button"
              onClick={() => setViewOrientation("horizontal")}
              className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                viewOrientation === "horizontal"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Mendatar (Landscape)
            </button>
          </div>
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
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors cursor-pointer"
              title="Tutup pesan"
            >
              <XIcon />
            </button>
          </div>
        )}

        {/* Technical Sub-info */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>Format: No. Invoice &amp; Customer</span>
          <span>Protokol: ESC/POS Landscape</span>
        </div>
      </div>

      {/* Realistic 80mm Physical Thermal Paper Slip */}
      <div className={`${viewOrientation === "roll" ? "max-w-[340px]" : "max-w-[480px]"} mx-auto select-none print:select-auto transition-all duration-200`}>
        {/* Top Paper Tear Sawtooth Edge (Visual only, hidden on print) */}
        <div
          aria-hidden="true"
          className="no-print h-2.5 w-full bg-[linear-gradient(135deg,transparent_4px,#ffffff_0),linear-gradient(-135deg,transparent_4px,#ffffff_0)] bg-[size:10px_10px] bg-repeat-x"
        />

        {/* Thermal Slip Body (Pure 1-Bit Monochrome, Zero Dithering, Max Bold) */}
        <div
          className="thermal-slip-container w-full bg-white text-black px-4 py-8 shadow-md print:shadow-none print:p-0"
          style={{
            fontFamily: "'Arial Black', 'Impact', 'Trebuchet MS', 'Arial', sans-serif"
          }}
        >
          {viewOrientation === "roll" ? (
            /* Mode Roll (Sesuai Gambar Sketsa Pengguna: 2 Kolom Vertikal Memanjang) */
            <div className="flex flex-row justify-around items-stretch min-h-[460px] sm:min-h-[540px]">
              {/* Kolom 1: Nomor Invoice (Rotated vertically along paper roll) */}
              <div className="flex-1 flex items-center justify-center border-r-2 border-dashed border-black/30 pr-1">
                <span
                  className="print-jumbo-invoice font-black text-6xl sm:text-7xl md:text-8xl text-black tracking-wider break-all select-all whitespace-nowrap leading-none"
                  style={{
                    writingMode: "vertical-rl",
                    transform: "rotate(180deg)"
                  }}
                >
                  {invoiceNumber}
                </span>
              </div>

              {/* Kolom 2: Nama Customer (Rotated vertically along paper roll) */}
              <div className="flex-1 flex items-center justify-center pl-1">
                <span
                  className="print-jumbo-customer font-black text-5xl sm:text-6xl md:text-7xl text-black uppercase tracking-wider break-words select-all whitespace-nowrap leading-none"
                  style={{
                    writingMode: "vertical-rl",
                    transform: "rotate(180deg)"
                  }}
                >
                  {customerName}
                </span>
              </div>
            </div>
          ) : (
            /* Mode Horizontal (Landscape Card: Baris Atas No Invoice, Baris Bawah Nama Customer) */
            <div className="flex flex-col justify-center items-center gap-6 py-6 sm:py-10 min-h-[260px]">
              {/* Baris 1: Nomor Invoice */}
              <div className="w-full text-center">
                <span className="font-black text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-black tracking-tight break-all leading-tight select-all">
                  {invoiceNumber}
                </span>
              </div>

              {/* Garis Pemisah */}
              <div className="w-full border-b-2 border-dashed border-black/40" />

              {/* Baris 2: Nama Customer */}
              <div className="w-full text-center">
                <span className="font-black text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-black uppercase tracking-tight break-words leading-tight select-all">
                  {customerName}
                </span>
              </div>
            </div>
          )}
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
