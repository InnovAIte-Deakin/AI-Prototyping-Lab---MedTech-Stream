"use client";
import { useParseStore } from '@/store/parseStore';
import { Button } from '@/components/ui/Button';

export function UnparsedLines(){
  const { result } = useParseStore();
  const list = result?.unparsed || [];
  if (!list.length) return null;
  function copyAll(){
    navigator.clipboard.writeText(list.join('\n'));
  }
  return (
    <div className="stack">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <h3>Unparsed lines ({list.length})</h3>
        <Button size="sm" variant="outline" onClick={copyAll}>Copy</Button>
      </div>
      <ul className="unparsed-list">
        {list.map((l, i) => <li key={i} className="muted">{l}</li>)}
      </ul>
    </div>
  );
}

