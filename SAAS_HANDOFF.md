# Sampada → Multi-Tenant SaaS — Continuation Handoff

> Pick-up doc for continuing the multi-tenant conversion on another machine
> (which has Prisma + a local Postgres). Hand this whole file to Claude Code on
> that device, point it at the branch, and it can continue from here.

- **Repo:** https://github.com/Nagrik-Seva-Kendra/sampada
- **Working branch:** `feat/multi-tenant-saas` (already pushed to origin)
- **Stack:** pnpm monorepo — `apps/api` (NestJS 11 + Prisma 6 + Postgres/Neon), `apps/web` (React 19 + Vite + TanStack + Zustand + ky), `packages/shared` (Zod schemas = the API contract)
- **Node ≥ 22, pnpm 11.9.0**

---

## 0. Why this handoff exists

All work so far was done in an environment that **could not run the API** — it blocks Prisma's engine-binary CDN (so `prisma generate`/`migrate`/`validate` fail with 403) and has **no Postgres**. So the code was written and *statically* verified (syntax + `shared`/`web` typecheck + isolated unit tests), but the parts needing a live DB and a generated Prisma client are **unverified**. The new laptop (Prisma + local DB) closes that gap.

**First job on the new machine is verification, not new features.** See §2.

---

## 1. Current state — what's done

### Phase 0 — Auth hardening ✅ (complete)
Commits `637d1f2`, `553d5f6`, `ca79acd`, `e5c021a`, `2e27794`.
- Removed the reversible AES-256-GCM password copy (`passwordEnc` column + all decrypt code + the admin "reveal password" endpoint/UI).
- Password hashing migrated to **argon2id** (`@node-rs/argon2`); legacy scrypt hashes still verify on login and are transparently re-hashed to argon2id (no forced resets).
- **JWT hardened:** short-lived access token (15m), refresh-token rotation (`/auth/refresh`), and `User.tokenVersion` for session revocation (bumped on password change + deactivation). Guards re-verify against the live `User` row. Frontend silently refreshes on 401.
- **Admin password-reset-link flow:** single-use token, 1h expiry, SHA-256 hashed at rest; best-effort email + always a copyable link; `/reset-password` web page.

### Phase 1 — Tenancy foundation ✅ (code-complete, NEEDS LOCAL VERIFICATION)
Commits `cd10db9` (1a), `e52b57b` (1b), `8b1b00a` (1d core + tests), `849af34` (1c + 1d integration).
- **1a schema:** `Organization`, `Membership` (per-org `role`/`status`/`employeeCode`, per-org `nextEmployeeCode` counter, `joinCode`), `User.isPlatformAdmin`, nullable `organizationId` + composite index on the 6 tenant models. Additive.
- **1b data migration:** creates org #1 for the existing customer, a `Membership` per staff user (earliest ADMIN→OWNER, other ADMINs→ADMIN, EMPLOYEE→EMPLOYEE, status + employeeCode preserved, PUBLIC skipped), backfills `organizationId`, seeds `nextEmployeeCode`, and RAISES if any tenant row is left unscoped. Idempotent; no-ops on a fresh DB.
- **1c tenant context:** `nestjs-cls` request store; JWT carries `organizationId`/`membershipId`/`orgRole` (resolved from the active membership); both guards re-verify the membership is `ACTIVE` and populate CLS.
- **1d enforcement:** `PrismaService` returns a `$extends`-scoped, **deny-by-default** client; the one escape hatch is `prisma.$unscoped` (grep-able). Public share-link routes "adopt" their deed's org via a `PublicDeedTenantInterceptor`; platform stats use `$unscoped`; guideline docs are now staff-auth + org-scoped. Final migration tightens `organizationId` NOT NULL + swaps Party dedup to `@@unique([organizationId, aadhaarNumber/panNumber])`.
- **1e tests:** `apps/api/src/prisma/tenant-scope.core.spec.ts` (9 cases, **passing**) + `apps/api/test/tenant-isolation.e2e.spec.ts` (needs a real DB; skipped unless `TEST_DATABASE_URL` set).

### Migrations on the branch, in apply order
```
20260722120000_drop_password_enc
20260722130000_add_user_token_version
20260722140000_add_password_reset_token
20260722150000_add_tenancy_foundation
20260722160000_backfill_tenancy_org1
20260722170000_enforce_tenancy_not_null
```

---

## 2. DO THIS FIRST on the new machine — the Phase 1e gate

> The brief's rule: **do not start Phase 2 until 1e passes.**

```bash
git fetch origin && git checkout feat/multi-tenant-saas
pnpm install

# 1) Confirm all the new code actually compiles against a generated client.
#    This is the single most valuable check — it surfaces any type error the
#    sandbox could not catch (it never had @prisma/client generated).
pnpm --filter @sampada/api exec prisma generate
pnpm --filter @sampada/api typecheck        # expect CLEAN now
pnpm --filter @sampada/web  typecheck        # already clean in sandbox
pnpm --filter @sampada/shared build

# 2) Apply the migrations to a THROWAWAY/staging DB copy (never prod first).
#    Ideally against a copy of the real customer data so 1b's backfill is real.
pnpm --filter @sampada/api exec prisma migrate deploy

# 3) Boot and smoke-test: log in, open a deed, open the public share link.
#    Validates the PrismaService constructor-return wiring + guard CLS population.
pnpm dev

# 4) The mandatory isolation suite (create a fresh empty test DB for this):
TEST_DATABASE_URL=postgresql://USER:PASS@localhost:5432/sampada_test \
  pnpm --filter @sampada/api exec vitest run test/tenant-isolation.e2e.spec.ts
```

**If `prisma generate` or `typecheck` fails**, the most likely spots are the two files I could not run: `apps/api/src/prisma/prisma.service.ts` (the `$extends` constructor-return + `$unscoped`) and the two guards' CLS population. Fix types there first.

**Known runtime risk to watch:** the `PrismaService` returns the extended client from its constructor (`return scoped as unknown as PrismaService`). If Nest DI or `onModuleInit` misbehaves with that, switch to the alternative: keep `PrismaService extends PrismaClient` as the base and expose a `scoped` getter, updating the ~6 tenant-scoped services to use it — but that's more call-site churn. Try the constructor-return first.

---

## 3. Must-fix before/along Phase 2 (flagged in commit messages)

1. **Web guideline page must move behind staff auth.** The API guideline `list`/`file` routes are now `@UseGuards(JwtStaffGuard)`. The web `GuidelinePage` + its nav link are still public → they'll 401. Guard the `/guideline` route in `apps/web/src/router.tsx` (mirror the other `Guarded*` wrappers) and make the PDF download send the auth header (it currently may use a plain link).
2. **Member creation must write a `Membership`.** `UsersService.createStaff` / `createEmployee` / `createUser` / `signupEmployee` currently create a `User` with NO `Membership`, so a user created *after* the migration has no org context and can't get scoped access. This is Phase 2b work — bring it forward: create the membership in the current org (from CLS context), allocating `employeeCode` inside a transaction that increments `Organization.nextEmployeeCode` (NOT `count()+1`). Existing users are fine (1b gave them memberships).
3. **Remove `User.role` / `status` / `employeeCode`** only AFTER all code reads from `Membership` instead (a later sub-phase). They're intentionally still on `User` right now so nothing breaks mid-refactor.

---

## 4. Design decisions already locked (do NOT re-ask)

- **Upgrades:** add-only; keep current major versions (Nest 11, Prisma 6, React 19, Zod 3). Do not migrate to Zod 4.
- **Git:** work on `feat/multi-tenant-saas`; commit per sub-phase; push to origin.
- **Delivery:** one sub-phase at a time; verify + commit at each step.
- **Role model:** full move — `role`/`status`/`employeeCode` live on `Membership`; `OrgRole` = OWNER | ADMIN | EMPLOYEE; `User.isPlatformAdmin` is platform staff, not a customer role.
- **Guideline docs:** tenant-scoped per org; **authenticated + org-scoped** (public listing dropped).
- **Parties:** per-org; Aadhaar/PAN uniqueness is per-org (`@@unique([organizationId, number])`).
- **Tenant-scoped models (deny-by-default):** `DeedTemplate`, `DeedTemplateRevision`, `Party`, `DeedParty`, `DeedNaxa`, `GuidelineDocument`. Everything else (`User`, `Membership`, `Organization`, `PasswordResetToken`) is unscoped/global.
- **Escape hatch:** `prisma.$unscoped` only, for platform-admin + jobs + intentionally-public reads keyed by id. Keep it grep-able.

### Still OPEN (needs a decision before/during Phase 2 onboarding UI)
- **Org addressing model:** subdomain-per-slug (`{slug}.app`) vs path-per-slug (`app/{slug}`) vs single-app-login (org resolved from membership). Recommendation: ship single-app-login first, layer subdomains later for Phase 4 branding.

---

## 5. Remaining roadmap

### Phase 2 — Permissions & member management (next)
- **2a Permission layer:** a single declarative permission matrix in `packages/shared`; a NestJS guard + `@RequirePermission('members.invite')` decorator that resolves the membership from tenant context. No raw `role ===` checks in controllers. Enforce the invariant: an org always has ≥1 `ACTIVE` `OWNER` (block last-owner removal/demotion/self-demotion) at the service layer.
- **2b Member lifecycle:** self-serve **org signup** (the step-3 transaction — create Org TRIALING + Owner User + Membership OWNER + slug + joinCode + trial + clone starter templates); **direct-create** (temp password shown once, forced reset, works with no email); **email invite** (single-use token, 7-day, hashed, revocable); **join-by-org-code** (enter `joinCode` → pending queue → approve, scoped to the org); **removal = deactivation** (status INACTIVE, bump `tokenVersion`, retire employee code, keep attribution); **ownership transfer** (owner nominates an admin, both confirm by email).
- **2c Web UI:** org switcher, members list (role/status/last-active), pending-requests queue, invite + direct-create dialogs, member detail with role change + deactivate, ownership transfer. Use existing components + the locked "Terracotta" theme (do NOT restyle).

### Phase 3 — Billing (Razorpay Subscriptions, NOT Stripe)
- `Subscription` model; **entitlements read from own DB, never Razorpay at request time.** Idempotent webhook handlers (store processed event id, ignore stale/out-of-order); verify webhook signatures; reject unsigned. Seat enforcement (pending invites + pending join-requests consume seats); per-seat pricing w/ minimum floor. **GST:** SAC 998314, 18%, collect + store GSTIN + billing address, numbered GST invoices as downloadable PDF, nullable `irn` field (no e-invoicing yet). UI states: trialing, trial-expired, past-due (grace → read-only + export), cancelled, reactivation. Owner-only billing page.

### Phase 4 — Organization features
Org profile (name/slug/logo/address/district/sub-registrar office/reg number/language/timezone); **branding on generated deed PDFs** (logo/letterhead/seal — high value, make it look official); per-org private template library that **clones** platform starter templates (sale/gift/lease/mortgage/POA) on creation; append-only **audit log** per org (logins, member changes, deed/template CRUD, billing, exports, impersonation) with a filterable Owner/Admin view; **self-serve export** (deeds/templates/members as PDF/CSV/JSON) for DPDP portability. Optional (ASK FIRST): maker-checker `DRAFT→PENDING_REVIEW→APPROVED` with a Reviewer role. **Verify Neon + R2 are in an India region — flag immediately if not.**

### Phase 5 — Platform back-office
Internal console gated on `User.isPlatformAdmin`, separate route namespace: org list (subscription/seats/last-activity), extend trials, comp accounts, force-cancel, user impersonation (ALWAYS audit-logged + visibly banner-flagged, never silent), basic metrics (orgs, active seats, MRR, trial conversion). Not an ERP.

### Phase 6 — Design system consolidation
Extract tokens from the existing "Terracotta" theme into semantic names (surface/border/text-primary/danger…), keep palette values exactly; per-script line-height for Devanagari vs Latin; consolidate ~15 core components; explicit SaaS states (org switcher, empty states, seat-limit, trial-expired, payment-failed, no-permission); Storybook last. **Do NOT redesign** — formalize what exists.

---

## 6. Global rules (carry these forward — restate to Claude Code each session)
1. Zod schemas in `packages/shared` are the single source of truth. Define types once.
2. No raw permission checks in controllers — only via the Phase 2 guard + decorator.
3. Tenant scoping is enforced at the data layer (the Prisma extension), not by convention.
4. Never hard-delete tenant data — soft-delete / status-flag; keep author attribution.
5. Every migration reversible + safe on live data; write the down path; never drop a column in the same migration that stops writing to it.
6. Ask before assuming when a requirement is ambiguous or conflicts with existing code.
7. Security-boundary tests are mandatory (tenant isolation + permission matrix).
8. Do NOT touch the theme — read `apps/web/src/styles/theme.css` and use its tokens.

At the end of each phase: summary of changes, migration commands to run, manual steps, and anything deliberately left out.

---

## 7. Environment notes / gotchas
- `apps/api/.env` needs: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET` (must DIFFER from `JWT_SECRET`), optional `JWT_ACCESS_TTL`/`JWT_REFRESH_TTL`, `APP_URL` (for reset links), `SMTP_USER`/`SMTP_PASS` (optional; reset/invite email is best-effort), R2 vars.
- New dependencies added this branch: `@node-rs/argon2` (api), `nestjs-cls` (api).
- `prisma migrate deploy` applies the migrations in timestamp order — Phase 0 then 1a→1d. Run 1b's backfill against real customer data (a staging copy) so org #1 is populated correctly.
- Tenant-scope extension internals: reads inject `organizationId` into `where`; writes stamp it into `data`; `findUnique`→scoped `findFirst`; `update`/`delete` are pre-verified in-org; any tenant op with no org context throws. Logic lives in `apps/api/src/prisma/tenant-scope.core.ts` (unit-tested, no Prisma import) and is bound to Prisma in `tenant-scope.extension.ts`.

## 8. Git / auth notes
- Pushes used a **classic** GitHub PAT named `sampada-push-temp` (scope `repo`) from the `anujshrm325` account (org admin). Fine-grained tokens kept failing because the org repo needs the token's Contents=Read+Write AND repo selection AND org approval — the classic token sidesteps all that. **Delete `sampada-push-temp`** (GitHub → Settings → Developer settings → Tokens (classic)) when done, or regenerate as needed on the new machine.
- On the new machine, use your own git credentials / gh CLI — no need for a PAT if the repo is cloned with your logged-in git.
