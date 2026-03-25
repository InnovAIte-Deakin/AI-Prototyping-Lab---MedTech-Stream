export type Health = { ok: boolean; backendUrl: string; apiDocs?: boolean; message?: string };

export async function checkHealth(backendUrl: string): Promise<Health> {
  const base = backendUrl.replace(/\/$/, "");
  try {
    const h = await fetch(`${base}/api/v1/health`, { cache: 'no-store' });
    return { ok: h.ok, backendUrl: base };
  } catch (e) {
    return { ok: false, backendUrl: base, message: String(e) };
  }
}

