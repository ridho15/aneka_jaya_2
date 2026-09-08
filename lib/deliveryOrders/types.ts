export type DeliveryOrderStatus = "belum_selesai" | "selesai_setengah" | "selesai";
export type PackingStatus = "belum" | "sudah";
export type ShippingStatus = "belum" | "sudah";

export type DeliveryOrderItemData = {
  id: string;
  deliveryOrderId: string;
  salesRecordItemId: string;
  productRef: string;
  productNameSnapshot: string;
  warehouseNameSnapshot?: string;
  rackNameSnapshot?: string;
  unitSnapshot?: string;
  quantity: number;
  isShipped: boolean;
  shippedQuantity: number;
  shippedAt?: string;
};

export type DeliveryOrderData = {
  id: string;
  doNumber: string;
  salesRecordId: string;
  status: DeliveryOrderStatus;
  packingStatus: PackingStatus;
  shippingStatus: ShippingStatus;
  assignedUserId?: string;
  assignedUserName?: string;
  assignedAt?: string;
  assignedOfficers?: Array<{
    id: string;
    userId: string;
    userName: string;
    assignedAt: string;
  }>;
  packedByUserId?: string;
  packedByNameSnapshot?: string;
  packedAt?: string;
  shippedByUserId?: string;
  shippedByNameSnapshot?: string;
  shippedAt?: string;
  receiptPhotoUrl?: string;
  trackingNumber?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  sale: {
    id: string;
    transactionNumber?: string;
    saleDate: string;
    customerName: string;
    customerLocation?: string;
    shippingMethod?: string;
    deliveryAt?: string;
  };
  items: DeliveryOrderItemData[];
};

export type DeliveryOrderQueueItem = {
  id: string;
  doNumber: string;
  salesRecordId: string;
  transactionNumber?: string;
  saleDate: string;
  customerName: string;
  customerLocation?: string;
  shippingMethod?: string;
  deliveryAt?: string;
  status: DeliveryOrderStatus;
  packingStatus: PackingStatus;
  shippingStatus: ShippingStatus;
  assignedUserId?: string;
  assignedUserName?: string;
  assignedOfficers?: Array<{
    id: string;
    userId: string;
    userName: string;
    assignedAt: string;
  }>;
  totalItemsCount: number;
  shippedItemsCount: number;
  receiptPhotoUrl?: string;
  createdAt: string;
};
