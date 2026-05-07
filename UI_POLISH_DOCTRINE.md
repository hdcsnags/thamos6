# ThamOS Desktop UI Polish Doctrine

> **Author:** Kimi Code CLI  
> **Date:** 2026-05-06  
> **Sources audited:** UbuntuOS reference screenshots, 3x Gemini dragon images, GitHub Copilot Pro brief (k6.txt), current ThamOS codebase  
> **Status:** Ready for implementation

---

## Honest Verdict: What UbuntuOS Does Better

| Area | UbuntuOS | ThamOS (Current) | Gap |
|---|---|---|---|
| **Window transparency** | Real glassmorphism — wallpaper visible through windows | Fully opaque (#11141a) — `backdropFilter: blur()` is wasted | 🔴 Critical |
| **Wallpaper quality** | High-res aurora image, full bleed, no artifacts | CSS gradients only — clean but flat | 🔴 Critical |
| **Window controls** | Right-aligned _ □ X, clean spacing | Left-aligned macOS traffic lights | 🟡 High |
| **Desktop icons** | Vertical dock with labels, left side | Fixed top-left grid, no labels | 🟡 High |
| **Browser new tab** | Big search + favicon tiles | Minimal home page | 🟢 Medium |
| **Terminal** | Near-black void, subtle transparency | Same | ✅ Parity |
| **Taskbar** | Bottom dock, icon-focused, system tray | Functional but visually flat | 🟡 High |
| **Lock screen** | Beautiful blurred wallpaper + centered card | None | 🔴 Missing |

---

## What Copilot Got Right

1. **Window opacity is the #1 ROI change** — Correct. One `rgba()` swap transforms the whole OS.
2. **Resize handles are too small** — Correct. 1px hit zones are frustrating.
3. **Taskbar needs visual grouping** — Correct. The undifferentiated row looks unfinished.
4. **Title bar accent tint** — Correct. Subtle but separates "styled" from "crafted."

## What Copilot Got Wrong

1. **"REMOVE the old dragon/Wyrm entry"** — **Hard no.** The user gave us 3 stunning dragon images. We ADD image support, we don't replace. Options are power.
2. **"Keep left-aligned traffic lights"** — **Disagree.** UbuntuOS (our reference) uses right-aligned controls. Linux WMs use right. Windows uses right. Only macOS uses left. Our users are SOC analysts on Windows/Linux. Right-aligned is the correct default.
3. **"Do NOT touch Terminal theme files"** — **Overly restrictive.** The terminal background should be `palette.void` (darkest), not `palette.elevated`. This is a 1-line fix.
4. **No mention of lock screen** — **Omission.** The UbuntuOS lock screen screenshot is gorgeous and we have nothing. Documented for next sprint.

---

## The Merged Doctrine: 7 Implement, 2 Defer

### 🔴 Implement Now

| # | Change | File | Effort |
|---|---|---|---|
| 1 | **Window glassmorphism** — `rgba(17,20,26,0.82)` backgrounds, working `backdropFilter` | `DesktopWindow.tsx` | 5 min |
| 2 | **Real image wallpapers** — Add dragon images to `public/wallpapers/`, register in picker | `wallpapers.ts` + assets | 15 min |
| 3 | **Right-aligned window controls** — Move _ □ X to right, add icon labels (not colors) | `DesktopWindow.tsx` | 30 min |
| 4 | **Resize handle hit targets** — 2px edges, 6px corners | `DesktopWindow.tsx` | 5 min |
| 5 | **Taskbar zone separation** — Workspace pill, taller bar (48px), visual grouping | `Taskbar.tsx` + `DesktopLayout.tsx` | 20 min |
| 6 | **Title bar accent tint** — Inset box-shadow using window's accent color | `DesktopWindow.tsx` | 5 min |
| 7 | **Terminal void background** — `#050508` instead of `#11141a` | `DesktopTerminal.tsx` | 2 min |

### 🟡 Defer to Next Sprint

| # | Change | Why Deferred |
|---|---|---|
| 8 | **Lock screen** — Blurred wallpaper + centered auth card | Large feature, needs design + auth flow |
| 9 | **Desktop icon dock** — Vertical left dock with labels | Major layout change, affects all desktop icon logic |

---

## Design Principles

1. **Glass over solid.** Every window chrome element gets transparency. The wallpaper is the star.
2. **Linux defaults, macOS options.** Right-aligned controls by default. Offer a setting later for left-aligned (macOS mode).
3. **Darkness hierarchy.** Terminal > Window content > Window chrome > Desktop. Terminal is always the deepest black.
4. **The dragon is canon.** All 3 dragon images ship as wallpapers. The cyber-dragon IS the ThamOS identity.
5. **Reference-driven, not copy-paste.** We steal the *feel* of UbuntuOS (glass, right controls, image wallpapers), not the specific colors or layout.

---

## Asset Plan

```
public/wallpapers/
├── dragon-circuit.png      (Gemini: lvi3lmlvi3lmlvi3 — coiled cyber dragon)
├── dragon-warrior.png      (Gemini: 15t5y615t5y615t5 — warrior at portal)
├── dragon-aggressive.jpg   (Gemini: 5f6d86ce... — aggressive facing-left dragon)
```

All three register in `wallpapers.ts` as `backgroundImage: 'url(/wallpapers/...)'` entries.

---

## Exit Criteria

- `npm run build` passes with zero errors
- Windows are visibly transparent over the dragon wallpaper
- Window controls are on the right
- Taskbar is 48px tall with grouped workspace switcher
- All 3 dragon images appear in the wallpaper picker and apply correctly
