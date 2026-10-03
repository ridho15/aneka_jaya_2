"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DeliveryOrderData } from "@/lib/deliveryOrders/types";
import { formatJakartaDate } from "@/lib/date/jakarta";
import {
  generateDeliveryOrderEscPos,
  generateDeliveryOrderThermalText,
  generateRawBtUrl,
  THERMAL_80MM_WIDTH
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

export function DeliveryOrderThermalPrint({ detail, autoPrint = false }: Props) {
  const [isBluetoothPrinting, setIsBluetoothPrinting] = useState(false);
  const [bluetoothStatus, setBluetoothStatus] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [supportsBluetooth, setSupportsBluetooth] = useState<boolean>(false);

  useEffect(() => {
    // Check Web Bluetooth API support
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
      alert("Browser Anda tidak mendukung Web Bluetooth. Silakan gunakan Google Chrome di Android atau Laptop/PC, atau gunakan tombol Cetak Standar.");
      return;
    }

    setIsBluetoothPrinting(true);
    setBluetoothStatus("Mencari printer Bluetooth...");

    try {
      // 1. Request Bluetooth Device with printer service filters
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: BLUETOOTH_PRINT_SERVICES
      });

      setBluetoothStatus(`Menghubungkan ke ${device.name || "Printer"}...`);

      if (!device.gatt) {
        throw new Error("GATT server tidak tersedia pada perangkat ini.");
      }

      const server = await device.gatt.connect();

      // 2. Locate writable printer characteristic
      let writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

      // Try discovering available services
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
          // Continue searching other services
        }
      }

      if (!writeCharacteristic) {
        // Fallback: search all available primary services
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
        throw new Error("Karakteristik cetak tidak ditemukan pada printer Bluetooth ini.");
      }

      setBluetoothStatus("Mengirim data cetak...");

      // 3. Generate ESC/POS binary data
      const escPosData = generateDeliveryOrderEscPos(detail);

      // 4. Send chunks (BLE safe buffer: 100 bytes per chunk)
      const CHUNK_SIZE = 100;
      for (let i = 0; i < escPosData.length; i += CHUNK_SIZE) {
        const chunk = escPosData.slice(i, i + CHUNK_SIZE);
        if (writeCharacteristic.properties.writeWithoutResponse) {
          await writeCharacteristic.writeValueWithoutResponse(chunk);
        } else {
          await writeCharacteristic.writeValue(chunk);
        }
        // Small delay to prevent printer buffer overrun
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      setBluetoothStatus("Selesai mencetak!");
      setTimeout(() => {
        setBluetoothStatus("");
        try {
          device.gatt?.disconnect();
        } catch {
          // Ignore disconnect error
        }
      }, 2000);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Gagal mencetak via Bluetooth.";
      if (!errorMsg.includes("User cancelled")) {
        alert(`Koneksi Bluetooth: ${errorMsg}\n\nTips: Pastikan printer thermal Bluetooth 80mm sudah dinyalakan dan dalam mode pairing.`);
      }
      setBluetoothStatus("");
    } finally {
      setIsBluetoothPrinting(false);
    }
  };

  const handleCopyText = async () => {
    try {
      const text = generateDeliveryOrderThermalText(detail);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Gagal menyalin teks struk.");
    }
  };

  const totalQty = detail.items.reduce((sum, item) => sum + item.quantity, 0);
  const tanggalKirim = detail.sale.deliveryAt ? formatJakartaDate(detail.sale.deliveryAt) : formatJakartaDate(detail.sale.saleDate);
  const driverName = detail.shippedByNameSnapshot || detail.assignedUserName || "-";

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4 print:bg-white print:p-0">
      {/* Print Styles for 80mm Roll (Effective print width ~72mm) */}
      <style jsx global>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body {
            background-color: #fff !important;
            color: #000 !important;
            margin: 0 !important;
            padding: 0 !important;
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

      {/* Control Bar (Hidden when printing) */}
      <div className="no-print max-w-xl mx-auto mb-6 bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <Link
              href={`/delivery-orders/${detail.id}`}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
            >
              ← Kembali ke Detail DO
            </Link>
            <h1 className="text-base font-bold text-slate-900 mt-1">
              Cetak DO Thermal 80mm
            </h1>
            <p className="text-xs text-slate-500">
              Format khusus printer thermal Bluetooth (Nama & Invoice berukuran paling besar).
            </p>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
            Kertas 80mm
          </span>
        </div>

        {/* Action Buttons */}
        <div className="mt-4 flex flex-wrap gap-2.5">
          {/* Universal Print Dialog */}
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm shadow-sm hover:bg-emerald-700 transition-colors"
          >
            🖨️ Cetak (Print Dialog)
          </button>

          {/* Direct Web Bluetooth Print */}
          <button
            type="button"
            onClick={handleBluetoothPrint}
            disabled={isBluetoothPrinting}
            className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm shadow-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
            title={supportsBluetooth ? "Cetak langsung via Web Bluetooth" : "Web Bluetooth memerlukan browser Chromium"}
          >
            {isBluetoothPrinting ? "⏳ Mencetak..." : "⚡ Cetak Bluetooth Langsung"}
          </button>
        </div>

        {/* Bluetooth Status Feedback */}
        {bluetoothStatus && (
          <div className="mt-3 p-2.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs font-medium text-indigo-900 flex items-center gap-2 animate-pulse">
            <span>📡</span> {bluetoothStatus}
          </div>
        )}

        {/* Secondary Actions */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyText}
              className="px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 font-medium transition-colors"
            >
              {copied ? "✓ Disalin!" : "📋 Salin Teks Struk"}
            </button>
            <a
              href={generateRawBtUrl(detail)}
              className="px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 font-medium transition-colors"
              title="Buka langsung di aplikasi RawBT Android"
            >
              📱 Buka di RawBT (Android)
            </a>
          </div>
          <span className="text-[11px] text-slate-400">
            Lebar cetak: ~72mm (48 Karakter)
          </span>
        </div>
      </div>

      {/* Realistic 80mm Thermal Receipt Preview */}
      <div className="thermal-slip-container max-w-[340px] mx-auto bg-white text-black p-4 rounded-xl shadow-lg border border-slate-200 font-mono text-[13px] leading-tight">
        {/* Header Toko */}
        <div className="text-center pb-2 border-b-2 border-black">
          <div className="font-extrabold text-base tracking-wider">ANEKA JAYA / SLM</div>
          <div className="text-xs font-semibold">SURAT JALAN PENGIRIMAN (DO)</div>
        </div>

        {/* 1. JUMBO NAMA CUSTOMER (PALING BESAR) */}
        <div className="my-3 py-2 px-1 text-center border-2 border-black bg-slate-50 print:bg-transparent">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600 print:text-black">
            TUJUAN / PELANGGAN:
          </div>
          <div className="text-2xl sm:text-3xl font-black uppercase tracking-wide leading-tight mt-0.5 break-words">
            {detail.sale.customerName || "PELANGGAN"}
          </div>
        </div>

        {/* 2. NO INVOICE & NO DO (SANGAT BESAR & MENONJOL) */}
        <div className="text-center border-b border-dashed border-black pb-2 mb-2">
          <div className="text-lg font-black text-black">
            INV: {detail.sale.transactionNumber || "—"}
          </div>
          <div className="text-xs font-bold text-slate-800 print:text-black">
            DO: {detail.doNumber}
          </div>
        </div>

        {/* Info Pengiriman */}
        <div className="space-y-1 text-xs pb-2 border-b border-dashed border-black">
          <div className="flex justify-between">
            <span className="text-slate-600 print:text-black">Tanggal:</span>
            <span className="font-bold">{tanggalKirim}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 print:text-black">Ekspedisi:</span>
            <span className="font-bold">{detail.sale.shippingMethod || "Kurir Toko"}</span>
          </div>
          {detail.trackingNumber && (
            <div className="flex justify-between">
              <span className="text-slate-600 print:text-black">No. Resi:</span>
              <span className="font-bold font-mono">{detail.trackingNumber}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-600 print:text-black">Petugas/Supir:</span>
            <span className="font-bold">{driverName}</span>
          </div>
          <div className="pt-1">
            <span className="text-slate-600 print:text-black block text-[11px]">Alamat Tujuan:</span>
            <div className="font-bold break-words text-slate-900 print:text-black">
              📍 {detail.sale.customerLocation || "-"}
            </div>
          </div>
        </div>

        {/* Tabel Barang (Strictly Masked: No Prices) */}
        <div className="py-2 border-b-2 border-black">
          <div className="flex justify-between font-bold text-xs uppercase pb-1 border-b border-black">
            <span>Daftar Barang (Item DO)</span>
            <span>Lokasi Rak</span>
          </div>
          <div className="divide-y divide-dashed divide-slate-300 print:divide-black pt-1">
            {detail.items.map((item, idx) => (
              <div key={item.id || idx} className="py-1.5 text-xs">
                <div className="font-bold text-slate-900 print:text-black">
                  {idx + 1}. {item.productNameSnapshot || item.productRef}
                </div>
                <div className="flex justify-between items-center text-slate-800 print:text-black mt-0.5 pl-3">
                  <span className="font-extrabold text-sm">
                    {item.quantity} {item.unitSnapshot || "PCS"}
                  </span>
                  <span className="font-semibold text-[11px] bg-slate-100 print:bg-transparent px-1.5 py-0.5 rounded">
                    Rak: {item.rackNameSnapshot || item.warehouseNameSnapshot || "-"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between font-bold text-xs pt-2 mt-1 border-t border-black">
            <span>TOTAL: {detail.items.length} Macam Barang</span>
            <span className="text-sm font-black">{totalQty} Unit</span>
          </div>
        </div>

        {/* Catatan Tambahan (jika ada) */}
        {detail.notes && (
          <div className="py-2 text-xs border-b border-dashed border-black">
            <span className="font-bold block text-[11px]">Catatan Pengiriman:</span>
            <div className="italic text-slate-800 print:text-black break-words">
              {detail.notes}
            </div>
          </div>
        )}

        {/* Kolom Tanda Tangan */}
        <div className="pt-4 pb-2">
          <div className="text-[11px] font-semibold text-center mb-2">
            Tanda Tangan Serah Terima:
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <div>
              <div className="font-medium text-slate-600 print:text-black mb-10">
                Pengirim / Sopir
              </div>
              <div className="border-t border-black pt-1 font-semibold">
                ( {driverName !== "-" ? driverName : " ................ " } )
              </div>
            </div>
            <div>
              <div className="font-medium text-slate-600 print:text-black mb-10">
                Penerima / Toko
              </div>
              <div className="border-t border-black pt-1 font-semibold">
                ( ................ )
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-[10px] text-slate-500 print:text-black pt-2 border-t border-slate-200 print:border-black">
          Harap periksa kelengkapan barang saat serah terima.
          <br />
          Dicetak dari Sistem SLM
        </div>
      </div>
    </div>
  );
}
