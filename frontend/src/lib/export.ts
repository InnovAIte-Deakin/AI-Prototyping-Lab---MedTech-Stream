import type { ParsedRow } from "@/types/ui";

const q = (s: string) => '"' + s.replaceAll('"', '""') + '"';

export function rowsToCSV(rows: ParsedRow[]): string {
  const header = ['Test','Value','Unit','ReferenceRange','Flag','Confidence','Page'];
  const body = rows.map(r => [
    q(r.test_name || ''),
    q(String(r.value ?? '')),
    q(String(r.unit ?? '')),
    q(String(r.reference_range ?? '')),
    q(String(r.flag ?? '')),
    (r.confidence ?? 0).toFixed(2),
    String(r.page ?? '')
  ].join(','));
  return [header.join(','), ...body].join('\n');
}

export function download(filename: string, content: string, mime='text/plain'){
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

