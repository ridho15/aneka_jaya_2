-- Barang titipan pihak lain dipisahkan dari persediaan milik SLM.
ALTER TABLE "InventoryProduct" ADD COLUMN "ownership" TEXT NOT NULL DEFAULT 'OWN', ADD COLUMN "consignorName" TEXT;
