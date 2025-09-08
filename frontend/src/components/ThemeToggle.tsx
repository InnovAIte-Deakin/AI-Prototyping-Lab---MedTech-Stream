"use client";
import { useEffect, useState } from 'react';

type Mode = 'light' | 'dark' | 'system';

function applyTheme(mode: Mode) {
  const root = document.documentElement;
  if (mode === 'system') {
    root.removeAttribute('data-theme');
    return;
  }
  root.setAttribute('data-theme', mode);
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('system');

  useEffect(() => {
    const saved = (localStorage.getItem('theme') as Mode) || 'system';
    setMode(saved);
    applyTheme(saved);
  }, []);

  function cycle() {
    const next: Mode = mode === 'system' ? 'dark' : mode === 'dark' ? 'light' : 'system';
    setMode(next);
    localStorage.setItem('theme', next);
    applyTheme(next);
  }

  const label = mode === 'system' ? 'System' : mode === 'dark' ? 'Dark' : 'Light';

  return (
    <button aria-label="Toggle theme" title={`Theme: ${label}`} className="btn btn-outline btn-sm" onClick={cycle}>
      Theme: {label}
    </button>
  );
}

