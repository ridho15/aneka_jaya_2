-- Semua harga dicatat per lusin (atau per satuan barang), bukan per pcs: satuan default barang = Lusin
ALTER TABLE "InventoryProduct" ALTER COLUMN "unit" SET DEFAULT 'Lusin';
