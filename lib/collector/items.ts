export interface CollectorInstance {
  listingId: number;
  mainClass: string;
  schemaType: string;
  replicas: number;
}

export const COLLECTORS: CollectorInstance[] = [
  { listingId: 1, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator", schemaType: "mbp-10", replicas: 2 }, // BTC
  { listingId: 2, mainClass: "group.gnometrading.collectors.HyperliquidCollectorOrchestrator", schemaType: "mbp-10", replicas: 2 }, // ETH
]
