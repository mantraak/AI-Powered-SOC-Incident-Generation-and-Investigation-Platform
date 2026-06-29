# SENTINEL AI · SOC Command — Frontend

> The original **AI-Powered SOC Incident Generation & Investigation Platform** frontend
> re-skinned with the **Stitch SENTINEL AI** design language.

All application logic, routes, API calls, authentication, state management and
component contracts are **unchanged** — only the visual layer was rebuilt.

## What changed

| Area | Before | After (Stitch SENTINEL) |
|------|--------|-------------------------|
| Palette | GitHub-dark cyan (`#0d1117` / cyan-500) | Stitch deep slate (`#11131b` / primary `#2563eb` / primary container `#b4c5ff`) |
| Iconography | Emoji (🎯 🧪 📋 …) | **Google Material Symbols Outlined** |
| Typography | system-ui | **Inter** for UI · **JetBrains Mono** for IPs, hashes, code |
| Corners | `rounded-md` (6px) | Cards & inputs `14px` · buttons / pills `6–10px` |
| Sidebar | Generic | Branded **SENTINEL AI · SOC Command** with workspace section header, active indicator (2px left border + 8 % tint) and user pod |
| Tables | Mixed | Uppercase tracked-wide header on `#0c0e16` row, no vertical grid lines |
| Badges | Solid | 15 % tint background with high-contrast same-hue text |
| Cards | Flat | Tonal layering · subtle hover border `#b4c5ff/30` |
| Empty states | Big emoji | Iconified `64×64` tile in a slate container |
| Modals | None / generic | Glass overlay (`backdrop-blur-sm`) with focused card and close button |

Every interactive element now carries a `data-testid` attribute to make
end-to-end testing painless.

## Pages re-skinned

- `pages/auth/AuthPages.tsx` — Login & Register
- `pages/admin/AdminDashboard.tsx`
- `pages/admin/ScenarioPages.tsx` — list, create, detail (4 tabs)
- `pages/admin/UsersPage.tsx`
- `pages/admin/LabsPage.tsx`
- `pages/admin/ToolsPage.tsx`
- `pages/admin/ModeratorPage.tsx`
- `pages/admin/AISettingsPage.tsx`
- `pages/player/PlayerDashboard.tsx`
- `pages/player/PlayerLabsPage.tsx`
- `pages/player/LabInvestigationPage.tsx` — 8 tabs (Briefing, Alerts, Events, IOCs, Artifacts, Questions, Containment, Score)
- `components/layout/AppLayout.tsx` — Sidebar + PageHeader
- `components/ui/index.tsx` — `Icon`, `Badge`, `StatusBadge`, `DifficultyBadge`, `SeverityBadge`, `Card`, `Button`, `Input`, `Spinner`, `EmptyState`, `SectionHeader`
- `components/mitre/MitreTechniqueSelector.tsx`
- `index.css` — design tokens & font imports
- `index.html` — page title
- `vite.config.ts` — proxy env-overridable

## Run locally

```bash
# 1. install
yarn

# 2. start the dev server (defaults to port 5173, proxies /api -> :8000)
yarn dev

# Optional: point the API proxy elsewhere (e.g. backend on :8001)
VITE_API_TARGET=http://localhost:8001 PORT=3000 yarn dev

# 3. production build
yarn build       # outputs to dist/
yarn preview     # serve the dist/ build
```

## API contract — unchanged

* `POST /api/v1/auth/login`     · form-encoded `username`, `password`
* `POST /api/v1/auth/register`  · JSON body
* `GET  /api/v1/users/`
* `GET  /api/v1/scenarios/`     · `POST`, `GET /:id`, `POST /:id/generate`, `POST /:id/publish`
* `GET  /api/v1/labs/all`       · `GET /labs/my`, `POST /labs/assign`, `POST /labs/:id/start`, `POST /labs/:id/answer`, `POST /labs/:id/submit`
* `GET  /api/v1/labs/:id/answers` · `/labs/:id/score`
* `GET  /api/v1/investigation/scenarios/:sid/{events,artifacts,alerts,indicators,questions,containment-actions}`
* `GET  /api/v1/mitre/tactics`  · `/mitre/techniques?q=&tactic=`
* `GET  /api/v1/tools/`
* `GET  /api/v1/ai-settings/`   · `PUT`, `POST /test`
* `POST /api/v1/moderator/analyze`

No backend code was modified.

## Design tokens (CSS variables)

```css
--bg:                   #11131b
--surface:              #1d1f27
--surface-low:          #191b23
--surface-lowest:       #0c0e16
--surface-high:         #282a32
--outline-variant:      #434655   /* default border  */
--outline:              #8d90a0   /* muted text       */
--on-surface:           #e1e2ed   /* primary text     */
--on-surface-variant:   #c3c6d7
--primary:              #b4c5ff   /* accent text      */
--primary-container:    #2563eb   /* primary actions  */
--error:                #ffb4ab
--error-container:      #93000a
```

Authored by Emergent · 2026
