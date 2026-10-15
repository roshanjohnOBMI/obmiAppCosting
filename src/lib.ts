import raw from "./data.json";

export interface Row {
  id: number;
  group: string;
  set: string;
  tool: string;
  fn: string;
  unit: string;
  released: boolean;
  basis: string;
  manualLow: number;
  manualHigh: number;
  toolLow: number;
  toolHigh: number;
  savedLow: number;
  savedHigh: number;
  uses: number;
}

export const ROWS: Row[] = (raw as { rows: Row[] }).rows;
export const REFERENCE: string = (raw as { reference: string }).reference;
export const GENERATED: string = (raw as { generated: string }).generated;

export type Dim = "group" | "set" | "tool" | "unit" | "band";
export const DIMS: { key: Dim; label: string }[] = [
  { key: "group", label: "Application group" },
  { key: "set", label: "Application set" },
  { key: "tool", label: "Tool" },
  { key: "unit", label: "Unit of use" },
  { key: "band", label: "Size of saving" },
];

/** Order the application sets appear in everywhere. */
export const SET_ORDER = [
  "OBMI Revit Tools",
  "OBMI Navisworks Tools",
  "ACC vs TIDP/MIDP Checker",
  "ACC Model Health Check",
  "Meridian",
  "Add-in Control",
];

/** One colour per application set, from the OBMI palette. */
export const SET_COLOR: Record<string, string> = {
  "OBMI Revit Tools": "var(--c-gold)",
  "OBMI Navisworks Tools": "var(--c-slate)",
  "ACC vs TIDP/MIDP Checker": "var(--c-teal)",
  "ACC Model Health Check": "var(--c-green)",
  Meridian: "var(--c-copper)",
  "Add-in Control": "var(--c-cyan)",
};

export const BANDS = ["Under 10 h", "10 to 50 h", "50 to 200 h", "Over 200 h"];
const bandOf = (mid: number) => (mid <= 10 ? BANDS[0] : mid <= 50 ? BANDS[1] : mid <= 200 ? BANDS[2] : BANDS[3]);

export interface Calc extends Row {
  usesEff: number;
  perUseMid: number;
  monthLow: number;
  monthHigh: number;
  monthMid: number;
  band: string;
}

export function compute(rows: Row[], overrides: Record<number, number>, scale: number): Calc[] {
  return rows.map((r) => {
    const usesEff = (overrides[r.id] ?? r.uses) * scale;
    const perUseMid = (r.savedLow + r.savedHigh) / 2;
    const monthLow = r.savedLow * usesEff;
    const monthHigh = r.savedHigh * usesEff;
    const monthMid = perUseMid * usesEff;
    return { ...r, usesEff, perUseMid, monthLow, monthHigh, monthMid, band: bandOf(monthMid) };
  });
}

export const dimValue = (r: Calc, d: Dim): string => r[d];

export const fmt = (n: number, digits = 0) => n.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const hours = (n: number) => (Math.abs(n) >= 100 ? fmt(n) : fmt(n, 1));

export function sum(rows: Calc[], k: "monthLow" | "monthHigh" | "monthMid"): number {
  return rows.reduce((a, r) => a + r[k], 0);
}
