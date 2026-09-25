export type PlanningLine = {
  sourceLineKey: string; parentSourceLineKey: string | null; itemId: string; quantity: string;
  unit: string | null; notes: string | null; sortOrder: number;
  scrapAllowance: string | null; consumptionRouteStepId: string | null;
  applicability: Array<{ tag: string; quantity: string }>;
}
export type PlanningVersion = {
  id: string; revision: string; status: string; bomId: string; name: string;
  project: { id: string; name: string }; output: string; lines: PlanningLine[];
}
export type PlanningItem = {
  id: string; code: string; title: string; unit: string; categoryId: string | null;
  specification: string | null; manufacturerPartNumber: string | null;
  supplyMode: string | null; onHand: string; reserved: string;
  price: { id: string; amount: string; currency: string; effectiveAt: string; source: string } | null;
}
export type PlanningSnapshot = {
  timestamp: string; versions: PlanningVersion[]; items: PlanningItem[];
  categories: Array<{ id: string; name: string; parentId: string | null; discipline: "MECHANICAL" | "ELECTRONICS" }>;
}
export type PlanningScenario = {
  name: string; selections: Array<{ versionId: string; quantity: string }>;
  categoryIds: string[] | null; edits: Record<string, PlanningLine[]>;
  published?: Record<string, { fingerprint: string; revision: string }>;
}
export type PlanningMaterial = {
  item: PlanningItem; category: string; required: string; afterAssembly: string;
  stockUsed: string; toBuy: string; cost: string | null; purchaseCost: string | null;
  contributions: Array<{ project: string; bom: string; revision: string; path: string; quantity: string }>;
}
export type PlanningResult = {
  timestamp: string; materials: PlanningMaterial[]; warnings: string[];
  totals: Array<{ currency: string; material: string; purchase: string }>;
  missingPrices: number;
}
