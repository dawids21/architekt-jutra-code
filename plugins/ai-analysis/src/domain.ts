export interface AnalysisRow {
  dimension: "description" | "category" | "price";
  verdict: "OK" | "ISSUE";
  justification: string | null;
}

export interface AnalysisResult {
  rows: AnalysisRow[];
}
