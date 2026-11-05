-- Isi per koli & harga modal berbasis RMB pada master barang inventory
ALTER TABLE "InventoryProduct" ADD COLUMN "unitsPerKoli" DECIMAL(18,2),
ADD COLUMN "priceRmb" DECIMAL(18,4),
ADD COLUMN "extraCostIdr" DECIMAL(18,2) NOT NULL DEFAULT 0;
