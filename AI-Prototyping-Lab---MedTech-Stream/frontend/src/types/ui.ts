export type ParsedRow = {
  id?: string;
  test_name: string;
  value: number | string;
  unit?: string | null;
  reference_range?: string | null;
  flag?: 'low' | 'high' | 'normal' | 'abnormal' | null;
  confidence: number;
  // Optional traceability
  page?: number;
  bbox?: [number, number, number, number];
};

export type ParseResult = {
  rows: ParsedRow[];
  unparsed: string[];
  extractedText?: string;
  meta?: { pages?: number; ocrRatio?: number; tookMs?: number };
};

