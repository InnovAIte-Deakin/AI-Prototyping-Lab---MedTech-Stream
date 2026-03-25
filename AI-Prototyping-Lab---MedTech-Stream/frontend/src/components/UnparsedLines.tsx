"use client";
import { useParseStore } from '@/store/parseStore';
import { Button } from '@/components/ui/Button';

export function UnparsedLines(){
  const { result } = useParseStore();
  const list = (result?.unparsed || []);
  if (!list.length) return null;
  function copyAll(){
    if (Array.isArray(list)){
      const text = list.map((l:any) => typeof l === 'string' ? l : l.text).join('\n');
      navigator.clipboard.writeText(text);
    }
  }
  // Group by page if objects with {page,text}
  const groups: Record<string, string[]> = {};
  for (const item of list as any[]){
    if (typeof item === 'string'){ groups['?'] = groups['?'] || []; groups['?'].push(item); }
    else { const p = String(item.page ?? '?'); groups[p] = groups[p] || []; groups[p].push(item.text); }
  }
  return (
    <div className="stack">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <h3>Unparsed lines ({list.length})</h3>
        <Button size="sm" variant="outline" onClick={copyAll}>Copy</Button>
      </div>
      {Object.entries(groups).map(([page, items]) => (
        <div key={page} className="stack">
          <div className="muted" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>Page {page}</div>
          <ul className="unparsed-list">
            {items.map((t, i) => <li key={page + '-' + i} className="muted" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>{t}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}
