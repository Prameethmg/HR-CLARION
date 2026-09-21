# Login Branding + Manager Dashboard Detail Views

## Context

Two enhancements requested on top of the existing app:

1. **Login page branding** — the login page should display company branding (logo, name, tagline, website, contact info, footer) instead of the current static shield/heading, with the branding **persisted in Enter Cloud** and editable by HR.
2. **Manager dashboard** — the four stat cards (Total / Pending / Approved / Rejected) become clickable and navigate to four new detail views (`/manager/requests/all|pending|approved|rejected`) with search, sort, CSV export, pagination, modals, toasts, and confirmations.

Decisions confirmed with the user:
- Branding stored in a new **backend `company_settings` table + edge functions** (same Enter Cloud pattern as every other feature).
- Logo stored as a **base64 data URL** in `company_settings` (no storage infrastructure).
- Manager detail views **map to the existing `requests` columns** (no schema change): employee name (already joined by `getManagerRequests`), `decided_by` → decided by, `decided_at` → decision date, `citations` → policy reference, `details`/`reason` as-is. `requests` has **no submission-date column**, so a "submitted" date shows `—`.
- **CSV export only** (no new packages).

---

## PART 1 — Login page branding

### Backend

**Migration** — new table (RLS enabled, no policies, deny-all):

```sql
create table company_settings (
  id boolean primary key default true check (id),
  company_name text,
  company_tagline text,
  company_email text,
  company_phone text,
  company_address text,
  company_website text,
  company_logo text,          -- base64 data URL (PNG/JPG/SVG)
  updated_at timestamptz not null default now()
);
alter table company_settings enable row level security;
```

**New edge functions** (service role, same pattern as all others, CORS handled):

1. `supabase/functions/getCompanySettings/index.ts` — no required input; returns the single `company_settings` row or `null` (login page applies its defaults when null). Read-only.
2. `supabase/functions/updateCompanySettings/index.ts` — input `{ user_id, company_name, company_tagline, company_email, company_phone, company_address, company_website, company_logo }`; **HR-only** (looks up `users.role`, 403 otherwise); upserts the singleton row (delete-if-absent guard so only one row exists), sets `updated_at = now()`; returns the saved row.

### Frontend — `src/pages/Login.tsx`

- On mount, call `getCompanySettings` (no session needed) and render with defaults when null: name `NIMBUS`, tagline `Your intelligent HR policy assistant`, website `https://nimbus.example`, empty contact fields, logo fallback = "N" initials tile.
- **Display layout:** logo 150×150 at top (or initials tile), company name (large), tagline, website link, a contact card (email / phone / address), and footer `© 2025 {company_name} - Team GASP`.
- **HR-only edit panel:** if `getSession()?.role === "HR"`, show an "Edit branding" toggle that reveals the form — file input for logo (accept `.png,.jpg,.jpeg,.svg`, read via `FileReader` → base64 data URL), text inputs for name/tagline/website/email/phone, textarea for address, Save button → `updateCompanySettings`; toast on success/failure (sonner is already wired via the app `Toaster`).
- Keep the existing login form, role-bar, and login logic exactly as-is (branding sits above/beside it; responsive via flex-wrap).
- No new packages.

---

## PART 2 — Manager dashboard detail views

### AppShell change — `src/components/AppShell.tsx`

- `StatItem` gains optional `to?: string`. Stat cards render as `Link` when `to` is present (styled like the existing card), otherwise stay as `<div>`. This makes the manager's stat cards clickable without changing any other role's shell usage.

### Reusable detail-view component — `src/pages/ManagerRequestsView.tsx` (new)

Props: `status: "all" | "pending" | "approved" | "rejected"` and `title: string`. Renders inside `AppShell` with the manager nav (`Approval Queue` active):

- **Data:** calls `getManagerRequests` with `manager_id = session.id` (existing function, unchanged); filters client-side by `status` (all = no filter). Live counts derived from the fetched rows.
- **Breadcrumb:** `Home > Manager > {title}` (plain text) + a "Back to Dashboard" button → `/manager`.
- **Columns:** Employee Name (with `Avatar`), Request Type, Submitted (shows `—` — no column exists), Status pill, Policy Reference (citations), Details/Reason, Action.
- **Search:** text filter over employee_name, request_type, details, reason, citations.
- **Sort:** dropdown by Decision date / Employee name / Status.
- **CSV export:** client-side Blob download of the currently filtered rows (no packages).
- **Pagination:** client-side, 10 rows/page, with page controls; empty state panel when no rows.
- **Pending view only:** Approve / Reject buttons → native confirm dialog → `decideRequest` → `toast` (success/error) → auto-refresh the list.
- **Approved view:** "View Details" button → shadcn `Dialog` quick-view modal (full row: employee, type, details, reason, citations, decided by/date).
- **Rejected view:** shows reason + `decided_by`/`decided_at`.
- Loading skeletons and inline error states (matching existing page patterns).

### Routes — `src/router.tsx`

Add four routes (all rendering `ManagerRequestsView` with a status prop + `errorElement: <RouteError />`):
`/manager/requests/all`, `/manager/requests/pending`, `/manager/requests/approved`, `/manager/requests/rejected`. Each view self-guards (no session → `/login`; role ≠ MANAGER → `rolePath`).

### Dashboard — `src/pages/ManagerApprovalQueue.tsx`

- The `stats` array passed to `AppShell` gets `to` values: Total → `/manager/requests/all`, Pending → `.../pending`, Approved → `.../approved`, Rejected → `.../rejected`. All existing queue behavior (approve/reject/delete, sort, bell via shell) unchanged.

---

## Files

| File | Change |
|---|---|
| `src/index.css` / `src/lib/theme.ts` | none (reuse tokens) |
| migration (new) | `company_settings` table + RLS |
| `supabase/functions/getCompanySettings/index.ts` | new |
| `supabase/functions/updateCompanySettings/index.ts` | new |
| `src/pages/Login.tsx` | branding display + HR edit panel + footer |
| `src/components/AppShell.tsx` | `StatItem.to` → clickable stat cards |
| `src/pages/ManagerRequestsView.tsx` | new reusable detail view |
| `src/router.tsx` | 4 new routes + errorElement |
| `src/pages/ManagerApprovalQueue.tsx` | stat card `to` links |

Reused: `getManagerRequests`, `decideRequest`, `AppShell`, `Avatar`, shadcn `Dialog`, `sonner` toast (already in `App.tsx`), `CARD_CLASS`/tokens, per-page role-guard pattern, `RouteError`.

## Implementation checklist

- [ ] Migration creates `company_settings` (singleton PK, all 7 branding fields, `updated_at`) with RLS enabled and 0 policies
- [ ] `getCompanySettings` deployed — returns the single row or `null`, no auth required
- [ ] `updateCompanySettings` deployed — HR-only 403 guard, upserts singleton row, sets `updated_at`
- [ ] `Login.tsx` fetches settings on mount and renders logo (150×150 / initials fallback), name, tagline, website, contact card, footer `© 2025 {name} - Team GASP` with defaults (NIMBUS / default tagline)
- [ ] HR-session only: "Edit branding" form (logo file → base64 via FileReader; name/tagline/website/email/phone/address) saves via `updateCompanySettings` with success/error toast
- [ ] `AppShell` renders stat cards as `Link` when `StatItem.to` is present
- [ ] `ManagerRequestsView` created: filters by status, search, sort, CSV export, 10/page pagination, empty/loading/error states, Avatar, status pills
- [ ] Pending view: Approve/Reject with confirm → `decideRequest` → toast → auto-refresh
- [ ] Approved view: "View Details" Dialog modal
- [ ] Rejected view: reason + decided_by/decided_at
- [ ] Router: 4 new routes + `errorElement`, each self-guarded
- [ ] `ManagerApprovalQueue` stat cards link to the 4 routes

## Verification checklist

- [ ] `pnpm check` and `pnpm run build` pass
- [ ] `getCompanySettings` via curl returns `null` before any save; `updateCompanySettings` as HR returns the row; as HR001 role `HR` (or a non-HR id) returns 403; saving then re-reading persists all fields incl. a base64 logo
- [ ] `pg_tables` shows `company_settings` RLS on; `pg_policies` count 0 for it
- [ ] Login page renders defaults without any session (logged-out), and HR session shows the edit panel
- [ ] Screenshot `/login` with saved branding; screenshot `/manager/requests/pending` and `/manager/requests/all` (preview permitting)
- [ ] Stat cards on `/manager` navigate to the correct 4 routes; breadcrumb + Back to Dashboard present
- [ ] Approve/Reject on pending triggers confirm → toast → row moves to approved/rejected without full reload
- [ ] CSV export downloads non-empty rows; pagination shows correct slices; search narrows rows; sort reorders
- [ ] No other page, route, backend function, table, or the AI system prompt changed
