// ═══════ Supplier Adapter Pattern ═══════
// Eén interface voor alle dropshipping suppliers (CJ, later AliExpress/Spocket/...).
// De rest van de pipeline praat alleen met deze interface — een nieuwe supplier
// toevoegen = één adapter implementeren, niets anders aanpassen.

export interface SupplierVariant {
  variantId: string
  sku?: string
  name?: string
  costPrice: number
  image?: string
  inventory?: number
}

export interface SupplierProduct {
  supplier: string          // 'cj', 'mock', ...
  productId: string         // supplier product ID (CJ: pid)
  variantId?: string        // default variant ID (CJ: vid) — nodig voor orders
  title: string
  description?: string
  image: string
  costPrice: number         // inkoopprijs (wat wij aan de supplier betalen)
  suggestedPrice?: number   // voorgestelde verkoopprijs
  currency: string          // 'USD' bij CJ
  shippingDays?: { min: number; max: number }
  warehouse?: string        // country code van het warehouse (bv. 'DE')
  inventory?: number
  rating?: number           // 0-5 indien beschikbaar
  category?: string
  url?: string              // productpagina bij de supplier
  variants?: SupplierVariant[]
}

export interface ProductSearchOptions {
  /** Alleen producten uit deze warehouse-landen (default: EU landen) */
  warehouseCountries?: string[]
  page?: number
  pageSize?: number
  /** Stop zoeken zodra dit aantal unieke producten gevonden is */
  maxResults?: number
}

export interface OrderItem {
  productId: string
  variantId: string
  quantity: number
  title?: string
}

export interface ShippingAddress {
  name: string
  email?: string
  phone?: string
  street: string
  houseNumber?: string
  zip: string
  city: string
  province?: string
  countryCode: string       // ISO-2, bv. 'NL'
}

export interface SupplierOrderData {
  /** Ons eigen order nummer (idempotency key richting supplier) */
  orderNumber: string
  items: OrderItem[]
  shipping: ShippingAddress
  remark?: string
  /** Warehouse-land om vanuit te verzenden (bv. 'DE') */
  fromCountryCode?: string
  logisticName?: string
}

export interface PlacedOrder {
  ok: boolean
  supplierOrderId?: string
  status?: string
  /** true = order aangemaakt maar (nog) niet betaald/bevestigd (sandbox) */
  unconfirmed?: boolean
  error?: string
}

export interface TrackingEvent {
  time: string
  status: string
  location?: string
}

export interface TrackingInfo {
  ok: boolean
  orderStatus?: string
  trackingNumber?: string
  logisticName?: string
  events?: TrackingEvent[]
  error?: string
}

export interface InventoryInfo {
  ok: boolean
  productId: string
  total: number
  byWarehouse: Array<{ countryCode: string; quantity: number }>
  error?: string
}

export interface SupplierAdapter {
  readonly name: string
  /** true zolang er geen echte API key geconfigureerd is */
  readonly isMock: boolean

  searchProducts(niche: string, options?: ProductSearchOptions): Promise<SupplierProduct[]>
  getProduct(productId: string): Promise<SupplierProduct | null>
  placeOrder(orderData: SupplierOrderData): Promise<PlacedOrder>
  getTracking(supplierOrderId: string): Promise<TrackingInfo>
  getInventory(productId: string): Promise<InventoryInfo>
}

/** EU warehouse-landen die we standaard accepteren */
export const EU_WAREHOUSES = ['DE', 'NL', 'FR', 'IT', 'ES', 'PL', 'CZ'] as const
