import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { loadEnvFiles } from "./load-env.mjs";

loadEnvFiles();

const prisma = new PrismaClient();
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");

async function readJsonSales() {
  try {
    const raw = await readFile(path.join(dataDir, "sales-records.json"), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getProductName(item) {
  if (item.manualProduct) {
    if (typeof item.manualProduct === "string") {
      try {
        const parsed = JSON.parse(item.manualProduct);
        if (parsed?.name) return parsed.name;
      } catch {}
    } else if (item.manualProduct.name) {
      return item.manualProduct.name;
    }
  }
  return item.productNameSnapshot || item.name || item.productRef || "Item Penjualan";
}

function generateDoNumber(sale, index) {
  if (sale.transactionNumber) {
    return `DO-${sale.transactionNumber}`;
  }
  const d = sale.saleDate ? new Date(sale.saleDate) : new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const seq = String(index).padStart(4, "0");
  return `DO-${yyyy}${mm}${dd}-${seq}`;
}

async function reconcileDeliveryOrders() {
  console.log("=== Memulai Rekonsiliasi & Pemulihan Surat Jalan (DO) ===\n");

  const jsonSales = await readJsonSales();
  const jsonSalesMap = new Map(jsonSales.map((s) => [s.id, s]));

  // Ambil semua transaksi approved dari Prisma
  const sales = await prisma.salesRecord.findMany({
    where: {
      approvalStatus: "approved"
    },
    include: {
      items: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  console.log(`Ditemukan ${sales.length} transaksi approved di database.`);
  console.log(`Ditemukan ${jsonSales.length} transaksi di data/sales-records.json.\n`);

  let createdCount = 0;
  let restoredItemsCount = 0;
  let alreadySyncedCount = 0;
  let noItemsFoundCount = 0;

  let doSeq = 1;

  for (const sale of sales) {
    // Cari apakah DO sudah ada
    let existingDo = await prisma.deliveryOrder.findUnique({
      where: { salesRecordId: sale.id },
      include: { items: true }
    });

    // Ambil item transaksi: dari prisma.salesRecordItem atau fallback ke JSON store
    let sourceItems = sale.items && sale.items.length > 0 ? sale.items : [];
    if (sourceItems.length === 0 && jsonSalesMap.has(sale.id)) {
      const jSale = jsonSalesMap.get(sale.id);
      if (jSale.items && Array.isArray(jSale.items) && jSale.items.length > 0) {
        sourceItems = jSale.items;
      }
    }

    if (sourceItems.length === 0) {
      noItemsFoundCount++;
      continue;
    }

    if (!existingDo) {
      const doNumber = generateDoNumber(sale, doSeq++);

      await prisma.$transaction(async (tx) => {
        const createdDo = await tx.deliveryOrder.create({
          data: {
            id: crypto.randomUUID(),
            doNumber,
            salesRecordId: sale.id,
            packingStatus: "belum",
            shippingStatus: "belum",
            createdAt: sale.createdAt || new Date(),
            updatedAt: new Date()
          }
        });

        for (const item of sourceItems) {
          let salesItemId = item.id;
          if (salesItemId) {
            const check = await tx.salesRecordItem.findUnique({ where: { id: salesItemId } });
            if (!check) {
              const createdItem = await tx.salesRecordItem.create({
                data: {
                  id: salesItemId,
                  salesRecordId: sale.id,
                  productRef: item.productRef || "ITEM",
                  quantity: Number(item.quantity || 1),
                  unitPrice: Number(item.unitPrice || 0),
                  discount: Number(item.discount || 0),
                  manualProduct: typeof item.manualProduct === "object" ? JSON.stringify(item.manualProduct) : (item.manualProduct || null),
                  warehouseNameSnapshot: item.warehouseNameSnapshot || null,
                  rackNameSnapshot: item.rackNameSnapshot || null,
                  unitSnapshot: item.unitSnapshot || item.unit || "Pcs"
                }
              });
              salesItemId = createdItem.id;
            }
          } else {
            const createdItem = await tx.salesRecordItem.create({
              data: {
                id: crypto.randomUUID(),
                salesRecordId: sale.id,
                productRef: item.productRef || "ITEM",
                quantity: Number(item.quantity || 1),
                unitPrice: Number(item.unitPrice || 0),
                discount: Number(item.discount || 0),
                manualProduct: typeof item.manualProduct === "object" ? JSON.stringify(item.manualProduct) : (item.manualProduct || null),
                warehouseNameSnapshot: item.warehouseNameSnapshot || null,
                rackNameSnapshot: item.rackNameSnapshot || null,
                unitSnapshot: item.unitSnapshot || item.unit || "Pcs"
              }
            });
            salesItemId = createdItem.id;
          }

          // Cek apakah item sudah terdaftar di DO lain (unique constraint)
          const existingDoItem = await tx.deliveryOrderItem.findUnique({
            where: { salesRecordItemId: salesItemId }
          });

          if (!existingDoItem) {
            await tx.deliveryOrderItem.create({
              data: {
                id: crypto.randomUUID(),
                deliveryOrderId: createdDo.id,
                salesRecordItemId: salesItemId,
                productRef: item.productRef || "ITEM",
                productNameSnapshot: getProductName(item),
                quantity: Number(item.quantity || 1),
                unitSnapshot: item.unitSnapshot || item.unit || "Pcs",
                warehouseNameSnapshot: item.warehouseNameSnapshot || null,
                rackNameSnapshot: item.rackNameSnapshot || null,
                isShipped: false,
                shippedQuantity: 0
              }
            });
          }
        }
      });

      createdCount++;
    } else {
      // DO sudah ada, periksa apakah item kosong
      if (existingDo.items.length === 0) {
        await prisma.$transaction(async (tx) => {
          for (const item of sourceItems) {
            let salesItemId = item.id;
            if (salesItemId) {
              const check = await tx.salesRecordItem.findUnique({ where: { id: salesItemId } });
              if (!check) {
                const createdItem = await tx.salesRecordItem.create({
                  data: {
                    id: salesItemId,
                    salesRecordId: sale.id,
                    productRef: item.productRef || "ITEM",
                    quantity: Number(item.quantity || 1),
                    unitPrice: Number(item.unitPrice || 0),
                    discount: Number(item.discount || 0),
                    manualProduct: typeof item.manualProduct === "object" ? JSON.stringify(item.manualProduct) : (item.manualProduct || null),
                    warehouseNameSnapshot: item.warehouseNameSnapshot || null,
                    rackNameSnapshot: item.rackNameSnapshot || null,
                    unitSnapshot: item.unitSnapshot || item.unit || "Pcs"
                  }
                });
                salesItemId = createdItem.id;
              }
            } else {
              const createdItem = await tx.salesRecordItem.create({
                data: {
                  id: crypto.randomUUID(),
                  salesRecordId: sale.id,
                  productRef: item.productRef || "ITEM",
                  quantity: Number(item.quantity || 1),
                  unitPrice: Number(item.unitPrice || 0),
                  discount: Number(item.discount || 0),
                  manualProduct: typeof item.manualProduct === "object" ? JSON.stringify(item.manualProduct) : (item.manualProduct || null),
                  warehouseNameSnapshot: item.warehouseNameSnapshot || null,
                  rackNameSnapshot: item.rackNameSnapshot || null,
                  unitSnapshot: item.unitSnapshot || item.unit || "Pcs"
                }
              });
              salesItemId = createdItem.id;
            }

            const existingDoItem = await tx.deliveryOrderItem.findUnique({
              where: { salesRecordItemId: salesItemId }
            });

            if (!existingDoItem) {
              await tx.deliveryOrderItem.create({
                data: {
                  id: crypto.randomUUID(),
                  deliveryOrderId: existingDo.id,
                  salesRecordItemId: salesItemId,
                  productRef: item.productRef || "ITEM",
                  productNameSnapshot: getProductName(item),
                  quantity: Number(item.quantity || 1),
                  unitSnapshot: item.unitSnapshot || item.unit || "Pcs",
                  warehouseNameSnapshot: item.warehouseNameSnapshot || null,
                  rackNameSnapshot: item.rackNameSnapshot || null,
                  isShipped: false,
                  shippedQuantity: 0
                }
              });
            }
          }
        });

        restoredItemsCount++;
      } else {
        alreadySyncedCount++;
      }
    }
  }

  console.log("\n=== Ringkasan Hasil Rekonsiliasi ===");
  console.table({
    "Total Transaksi Diperiksa": sales.length,
    "DO Baru Dibuat": createdCount,
    "DO Item Dipulihkan": restoredItemsCount,
    "Sudah Sinkron (Sesuai)": alreadySyncedCount,
    "Transaksi Tanpa Item": noItemsFoundCount
  });
}

reconcileDeliveryOrders()
  .catch((err) => {
    console.error("Gagal melakukan rekonsiliasi DO:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
