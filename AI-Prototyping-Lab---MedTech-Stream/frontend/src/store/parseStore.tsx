"use client";
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ParsedRow, ParseResult } from "@/types/ui";

type Metrics = {
  lastStatus?: number;
  lastParseMs?: number;
  parsedRowCount?: number;
  unparsedCount?: number;
};

type FileItem = {
  file: File;
  url: string;
};

type Store = {
  backendUrl: string;
  files: FileItem[];
  setFiles: (files: File[]) => void;
  currentFileUrl?: string | null;
  result?: ParseResult;
  setResult: (r?: ParseResult) => void;
  metrics: Metrics;
  setMetrics: (m: Metrics) => void;
};

const Ctx = createContext<Store | null>(null);

export function ParseProvider({ children }: { children: React.ReactNode }) {
  const [files, _setFiles] = useState<FileItem[]>([]);
  const [result, setResult] = useState<ParseResult | undefined>(undefined);
  const [metrics, setMetrics] = useState<Metrics>({});
  const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
  const currentFileUrl = files.length > 0 ? files[0].url : null;

  const setFiles = useCallback((fl: File[]) => {
    // revoke previous URLs
    files.forEach((f) => URL.revokeObjectURL(f.url));
    _setFiles(fl.map((f) => ({ file: f, url: URL.createObjectURL(f) })));
  }, [files]);

  const value = useMemo<Store>(
    () => ({ backendUrl, files, setFiles, currentFileUrl, result, setResult, metrics, setMetrics }),
    [backendUrl, files, setFiles, currentFileUrl, result, setResult, metrics, setMetrics]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useParseStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useParseStore must be used within ParseProvider");
  return v;
}
