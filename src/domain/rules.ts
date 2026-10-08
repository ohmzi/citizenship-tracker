export type Path = "spouse3" | "standard5";

export interface PathRule {
  years: number;
  requiredDays: number;
  requiredMonths: number;
  label: string;
}

/** USCIS Policy Manual Vol. 12 — Part G (spouses, INA 319(a)) and Part D (INA 316(a)). */
export const PATH_RULES: Record<Path, PathRule> = {
  spouse3: { years: 3, requiredDays: 548, requiredMonths: 18, label: "3-year · spouse of a US citizen" },
  standard5: { years: 5, requiredDays: 913, requiredMonths: 30, label: "5-year · standard" },
};

export const EARLY_FILING_DAYS = 90;
/** An absence of MORE than this many days abroad raises a rebuttable presumption of a break. */
export const PRESUMED_BREAK_DAYS = 180;
/** An absence of this many days abroad or more breaks continuous residence. */
export const BREAK_DAYS = 365;

/** INA 101(a)(38) plus the CNMI: time here is never an absence. */
export const US_JURISDICTIONS: ReadonlySet<string> = new Set(["US", "PR", "GU", "VI", "MP"]);
export const isUsJurisdiction = (code: string): boolean => US_JURISDICTIONS.has(code);
