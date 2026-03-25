"use client";
import { useParseStore } from '@/store/parseStore';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { rowsToCSV, download } from '@/lib/export';

export function ParsedTable(){
  const { result } = useParseStore();
  const rows = result?.rows || [];
  if (rows.length === 0){
    return <div className="stack p-3">
      <div className="muted">No results reviewed yet.</div>
    </div>;
  }
  return (
    <div className="stack" style={{ padding: '.5rem' }}>
      <div className="p-2" style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
        <strong>Reviewed {rows.length} results</strong>
        <Button size="sm" variant="outline" onClick={() => download('parsed.csv', rowsToCSV(rows), 'text/csv')}>Export CSV</Button>
        <Button size="sm" variant="outline" onClick={() => download('parsed.json', JSON.stringify(rows, null, 2), 'application/json')}>Export JSON</Button>
      </div>
      <div className="table-container">
        <Table>
          <THead>
            <TR>
              <TH>Test</TH>
              <TH>Value</TH>
              <TH>Unit</TH>
              <TH>Reference</TH>
              <TH style={{ whiteSpace: 'nowrap' }}>Comparison</TH>
              <TH>Flag</TH>
              <TH style={{ whiteSpace: 'nowrap' }}>Confidence score</TH>
              <TH style={{ whiteSpace: 'nowrap' }}>Page</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r, i) => (
              <TR key={i}>
                <TD>{r.test_name}</TD>
                <TD>{String(r.value)}</TD>
                <TD>{r.unit ?? ''}</TD>
                <TD>{r.reference_range ?? ''}</TD>
                <TD>{(r as any).comparator ?? ''}</TD>
                <TD>{r.flag ? <span className={`badge-flag ${r.flag}`}>{String(r.flag).toUpperCase()}</span> : ''}</TD>
                <TD style={{ textAlign: 'right' }}>{(r.confidence ?? 0).toFixed(2)}</TD>
                <TD>{(r as any).page ?? ''}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
