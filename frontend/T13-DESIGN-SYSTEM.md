# T13 — Design System & UI Shell Redesign

## Overview

Task T13 replaces the existing ad-hoc frontend styling with a unified design system based on the "Luminous Clarity" design specification (`design.md`) and Figma mockups. All subsequent UI work now builds on consistent tokens, components, and layout patterns.

## What Changed

### 1. Design Tokens (`src/app/globals.css` — complete rewrite)

Replaced the old teal color scheme with the Figma deep blue + purple accent palette. All values are defined as CSS custom properties in a single source file.

| Token Category | Examples |
|---------------|----------|
| Primary | `--primary: #004ac6`, `--primary-container: #2563eb` |
| Secondary | `--secondary: #8a4cfc`, `--secondary-fixed: #eaddff` |
| Surfaces | `--surface: #faf8ff`, `--surface-container: #ededf9`, `--surface-container-low: #f3f3fe` |
| Text | `--on-surface: #191b23`, `--on-surface-muted: #5f6368` |
| Semantic | `--success: #0E9F6E`, `--warning: #C27803`, `--danger: #C7383A` |
| Spacing | `--space-1` (4px) through `--space-16` (64px) |
| Radius | `--radius-sm` (8px) through `--radius-full` (999px) |
| Shadows | `--shadow-sm` through `--shadow-xl` (ambient, tinted) |
| Typography | `--font-display` (Manrope), `--font-body` (Inter), `--font-mono` |
| Type Scale | `--text-display-lg` (56px) through `--text-label-sm` (12px) |

Full dark mode variants are defined under `[data-theme='dark']` with system preference fallback via `prefers-color-scheme`.

Legacy variable aliases (`--brand`, `--ink`, `--ui-bg`, etc.) are preserved for backward compatibility.

### 2. Typography

Switched from Tomato Grotesk to **Manrope** (headlines) + **Inter** (body) per the design specification. Loaded via Google Fonts.

### 3. Core UI Primitives (`src/components/ui/`)

| Component | File | Status | Variants |
|-----------|------|--------|----------|
| Button | `Button.tsx` | Updated | `primary` (gradient), `outline`, `ghost`, `accent`, `danger` + sizes `sm`, `md`, `lg` |
| Badge | `Badge.tsx` | **New** | `normal`, `optimal`, `high`, `low`, `attention`, `info` |
| Card | `Card.tsx` | **New** | Optional accent bar: `blue`, `purple`, `orange` |
| Input | `Input.tsx` | Updated | Ghost borders, surface-container-low background |
| TextArea | `TextArea.tsx` | Updated | Matches Input styling |
| Modal | `Modal.tsx` | **New** | Overlay + dialog panel, Escape key close, click-outside dismiss |
| Table | `Table.tsx` | Unchanged | Existing component preserved |

### 4. Navigation Bar (`src/components/Header.tsx` — redesigned)

Matches Figma design:
- **Left:** ReportX logo (blue icon + text)
- **Center:** Nav links with active route underline indicator
- **Right:** Blue pill CTA ("Review My Report") + user avatar + theme toggle

Role-aware behavior:
- **Unauthenticated:** Shows Login and Sign Up links
- **Authenticated patient:** Shows My Reports link + avatar with user initial + Logout
- **Authenticated clinician:** Same as patient (extensible for clinician-specific links)

### 5. Layout & Footer (`src/app/layout.tsx`)

- Consistent page wrapper with `max-width: 1100px`
- Footer matches Figma: "ReportX" + copyright on the left, Privacy/Terms/Contact links on the right

### 6. Home Page (`src/app/page.tsx`)

- Hero section with large Manrope heading: "Understand Your Lab Results."
- Accent-colored "Lab Results" text using `--primary`
- 3 feature cards with colored accent bars:
  - Smart Markers (blue)
  - Trend Analysis (purple)
  - Doctor-Ready (orange)

### 7. Parse Page Styles (`styles/parse.css`)

- Removed hard borders per design.md "No-Line" rule
- Migrated to design tokens (surfaces, radii, spacing)
- Upload zone uses tonal layering instead of bordered boxes

### 8. Header Styles (`styles/header.css`)

- Simplified to responsive overrides only
- Core nav styles moved to `globals.css`

## Design Principles Applied

From `design.md` — "Editorial Clinical Excellence":

1. **No-Line Rule** — 1px solid borders are prohibited for sectioning. Boundaries defined through background color shifts.
2. **Tonal Layering** — Surface hierarchy (surface → container → container-highest) creates natural depth without borders.
3. **Ambient Shadows** — Large blur values (24-40px), low opacity (4-8%), tinted with `--on-surface` color.
4. **Ghost Borders** — Input fields use `--outline-variant` at reduced opacity. Never 100% opaque borders.
5. **Gradient CTAs** — Primary buttons use `linear-gradient(135deg, #004ac6, #2563eb)` for a "lit-from-within" feel.
6. **Soft Tech Corners** — All interactive elements use `--radius-lg` (16px) or `--radius-full` (pill).
7. **No Pure Black** — Text uses `--on-surface: #191b23` for premium ink-like legibility.

## Tests

41 new tests across 6 test files, all written TDD-style (failing tests first, then implementation):

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `Button.test.tsx` | 11 | Variants, sizes, click, disabled, keyboard, className merge |
| `Badge.test.tsx` | 9 | All 6 variants, default, className merge |
| `Card.test.tsx` | 5 | Children, base class, accent variants, className, custom element |
| `Input.test.tsx` | 5 | Class, placeholder, onChange, className, disabled |
| `TextArea.test.tsx` | 4 | Class, placeholder, onChange, className |
| `Modal.test.tsx` | 7 | Open/close, title, overlay click, Escape key, dialog role, className |

### Test Results

| Metric | Before T13 | After T13 |
|--------|-----------|-----------|
| Passing | 59 | 69 |
| Failing | 5 (pre-existing) | 5 (same pre-existing) |
| New tests | — | +41 |
| Regressions | — | 0 |

Pre-existing failures (not caused by T13):
- `DoctorSummary.test.tsx` — import/transform error
- `ThreadsFlow.test.tsx` — import/transform error
- `ReportsFlow.test.tsx` (3 tests) — mock setup issues

## Files Changed

### Modified
- `src/app/globals.css` — Complete rewrite with design token system
- `src/app/layout.tsx` — Updated footer, removed old CSS class
- `src/app/page.tsx` — Redesigned home page with hero + feature cards
- `src/components/Header.tsx` — Redesigned role-aware navigation
- `src/components/ui/Button.tsx` — Added ghost variant, cleaner class joining
- `src/components/ui/Input.tsx` — Minor cleanup
- `src/components/ui/TextArea.tsx` — Minor cleanup
- `src/components/ui/__tests__/Button.test.tsx` — Expanded from 1 to 11 tests
- `styles/header.css` — Simplified to responsive overrides
- `styles/parse.css` — Migrated key styles to design tokens

### Created
- `src/components/ui/Badge.tsx`
- `src/components/ui/Card.tsx`
- `src/components/ui/Modal.tsx`
- `src/components/ui/__tests__/Badge.test.tsx`
- `src/components/ui/__tests__/Card.test.tsx`
- `src/components/ui/__tests__/Input.test.tsx`
- `src/components/ui/__tests__/TextArea.test.tsx`
- `src/components/ui/__tests__/Modal.test.tsx`

### Legacy Backups
- `src/components/Header_legacy.tsx`
- `src/components/ui/Button_legacy.tsx`
- `src/components/ui/Input_legacy.tsx`
- `src/components/ui/TextArea_legacy.tsx`
- `src/components/ui/Table_legacy.tsx`

## How to Use

### Using design tokens
```css
.my-component {
  background: var(--surface-container-lowest);
  color: var(--on-surface);
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  font-family: var(--font-body);
}
```

### Using components
```tsx
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

<Button variant="primary" size="lg">Submit</Button>
<Button variant="outline">Cancel</Button>
<Button variant="ghost">More</Button>
<Button variant="danger">Delete</Button>

<Badge variant="optimal">OPTIMAL</Badge>
<Badge variant="high">HIGH</Badge>
<Badge variant="low">LOW</Badge>

<Card accent="purple">
  <h3>Clinical Insight</h3>
  <p>Your results are within normal range.</p>
</Card>

<Modal open={isOpen} onClose={() => setIsOpen(false)} title="Share Report">
  <p>Modal content here</p>
</Modal>
```
