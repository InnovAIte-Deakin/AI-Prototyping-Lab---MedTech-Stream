"use client";
import { useParseStore } from '@/store/parseStore';

export function DocumentViewer(){
  const { currentFileUrl, files } = useParseStore();
  if (!currentFileUrl) {
    return <div className="h-full grid place-items-center text-sm muted">No document selected</div>;
  }
  const mime = files[0]?.file.type || '';
  return (
    <div className="h-full w-full" style={{ background: '#f8fafc' }}>
      {mime === 'application/pdf' ? (
        <embed src={currentFileUrl} type="application/pdf" width="100%" height="100%" />
      ) : (
        <div className="h-full w-full grid place-items-center">
          <img src={currentFileUrl} alt="preview" style={{ maxWidth: '100%', maxHeight: '100%' }} />
        </div>
      )}
    </div>
  );
}

