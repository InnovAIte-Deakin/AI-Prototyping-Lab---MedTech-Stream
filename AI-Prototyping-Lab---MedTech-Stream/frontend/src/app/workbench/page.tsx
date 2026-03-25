"use client";
import { ParseProvider } from '@/store/parseStore';
import { FileQueue } from '@/components/FileQueue';
import { DocumentViewer } from '@/components/DocumentViewer';
import { ParsedTable } from '@/components/ParsedTable';
import { UnparsedLines } from '@/components/UnparsedLines';
import { HealthGate } from '@/components/HealthGate';
import { LogsPane } from '@/components/LogsPane';

export default function WorkbenchPage(){
  return (
    <HealthGate>
      <ParseProvider>
        <div className="grid" style={{ gridTemplateColumns: '320px 1fr 480px', gridTemplateRows: '1fr auto', height: 'calc(100vh - 3rem)', gap: '0.75rem' }}>
          <aside className="card" style={{ overflow: 'auto' }}>
            <h2 style={{ marginTop: 0 }}>Files</h2>
            <FileQueue />
          </aside>

          <main className="card" style={{ overflow: 'hidden' }}>
            <DocumentViewer />
          </main>

          <section className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <ParsedTable />
            </div>
            <div className="border" style={{ borderTop: '1px solid var(--border)', padding: '.5rem' }}>
              <LogsPane />
            </div>
          </section>

          <section className="card" style={{ gridColumn: '2 / span 2', overflow: 'auto' }}>
            <UnparsedLines />
          </section>
        </div>
      </ParseProvider>
    </HealthGate>
  );
}

