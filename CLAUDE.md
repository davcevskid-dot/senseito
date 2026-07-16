# Senseito

"Build any school you can imagine." An AI-powered platform where a creator describes a school
in one prompt and gets a full interactive course: lessons, an AI mentor, gamification, a
community, payments, certificates — all editable by chatting with the build assistant.

Live at senseito.app. Repo: `https://github.com/davcevskid-dot/senseito.git`.

## Stack & structure

- **React 18 + Vite**, single source file: `src/Senseito.jsx` (~10,800 lines). Keep it one file,
  organized by `// ═══` section banners. This is deliberate, not debt to pay down — don't split
  it into modules without being asked.
- `npm run dev` (port 5173), `npm run build` (vite build → `dist/`).
- **Deploy:** Vercel auto-deploys on push to `origin main`. No CI gate — a push is a release.
- **Backend:** Supabase project **Omnilearn**, ref `raaffebeteodotpwyfgi` (`SUPA_URL` in the
  source). Managed through the Supabase MCP tools (`apply_migration`, `deploy_edge_function`,
  `execute_sql`, etc.) — there's no local `supabase/` directory; migrations and edge functions
  are applied directly to the live project via MCP calls made during sessions, not tracked as
  files in this repo. `docs/PAYMENTS_SETUP.md` documents the payments platform secrets.

## Core architecture

**Two-phase generation** (avoids output truncation on big schools): `ARCHITECT_SYS` returns a
compact plan — lessons carry `blockTypes: [strings]` only — then `fillSchoolBlocks()` authors
each block's real `data` per-semester in parallel, with a token budget and a `fallbackBlock()`
safety net. **Iteration reuses the same path**: `planOnly(school)` strips block data →
`ITERATE_SYS` edits the compact plan → `fillSchoolBlocks(content, {oldSchool})` keeps unchanged
lessons' block data and only re-authors what changed. Don't revert to one-shot full-school
generation — it truncates on content-heavy schools.

**Blocks** are the atomic unit of everything a student interacts with: quizzes, flashcards,
roleplay, journals, showroom slides, events, tools, dashboards. Each is
`{type, data}` rendered via `BlockRenderer` off the `BLOCK_COMPONENTS` map, with `BLOCK_META` for
icons/labels and a shared schema guide (`BLOCK_SCHEMA_GUIDE`) so every AI author function speaks
the same contract. A block component's signature is
`({data, onOutput, T, disabled, state, onState, school, bus, canEdit, onEditData})`.

**Context Bus** — a per-learner typed state stream living in `rec.toolStates.__bus`:
`{ struggles: [...], metrics: {...}, mastery: {conceptId: 0..1}, weeds: [...] }`. Block outputs
feed it via `ingestOutput(ctx, output)`; the mentor and adaptive bricks read it via
`busContext(bus, school)` to reference what a student is actually struggling with. This rides
existing persistence (enrollment jsonb for students, `tool_states` for creators) — no separate
schema.

**Concept Graph** — `school.concepts = [{id, label, prereq: [ids]}]`, emitted by the architect.
Blocks tag `data.concepts`; the bus EWMAs mastery per concept. Powers the "knowledge map" chips,
the deterministic Overseer's prereq/coverage checks, spaced-repetition review bricks, and
per-student strong/weak reporting in Analytics.

**Learning experiences** — `school.experience` is one of four top-level modes (the classic
shells — cards/steps/arcade/LMS — all live *inside* the first one; `EXPERIENCES` map in source):
1. `lessons` (default) — curriculum as before. Optional `school.progressWidget =
   {style:"circle", placement:"hero"|"rail"|"nav"|"meta"}` renders a school-wide completion ring
   (`CompletionCircle`).
2. `mentorship` — the mentor IS the school: lessons are a syllabus the mentor unlocks in
   conversation via `PASSED:/OPEN:` control lines parsed in `MentorOffice` (linear auto-advance
   on pass is disabled for this experience). `school.mentorship = {layout: focus|sidebar|
   topcards|minibar|bigbar|icons, pace: mentor|strict|relaxed, paceNote}` (`MentorshipStrip`).
3. `community` — NO lessons; rooms in `school.community.rooms` render via `CommunityHub` with
   `school.communityStyle` (classic | discord left-rail | Skool-style non-sticky topbar); posts
   are partitioned by `community_posts.room`. The architect must get explicit CONFIRMATION
   before building this experience (STEP 0 in `ARCHITECT_SYS`).
4. `classroom` — `ClassroomSection`: broadcast frame (`school.classroom.streamUrl` —
   YouTube/Vimeo/Twitch embed directly; Zoom links get a "join the room" card), session calendar
   (`classroom.events`), class discussion board underneath (room="classroom").
Each experience has its OWN generation loading skeleton in `BuildProgress` (keyed by
`experience`); studio iteration shows the separate minimal `IterationLoader` instead.

**Mentor availability** — `school.mentorHours` (office-hour windows evaluated in the STUDENT's
local time) and `school.mentorLimits.msgsPerDay` (per-student daily message cap, counted from
chat timestamps) are enforced in `MentorOffice` for students only; creators are never locked out.

**Sections are dynamic**, not a fixed 3-tab spine: `school.data.sections` (kinds: `lessons`,
`mentor`, `tools`, `dashboard`, `community`, `students`, `calendar`, `classroom`, `counselor`, …).
`getSections()` derives legacy schools for back-compat. Never reintroduce a hardcoded
Lessons/Mentor/Tools structure — a yoga school might be dashboard+mentor only; a philosophy
school might be lessons+tools+community. Tabs render **SVG icons** per kind (`SECTION_ICO` +
`Ico`), never emojis; the default school mark is an SVG `Monogram` (an emoji only shows if the
creator explicitly typed one — `school.emojiChosen`); lessons without covers get numbered tiles.

**Lesson access & routing** — per lesson: `open` (unlocked for everyone), `unlocks` (the **id**
of the lesson opened on pass — A→B routing, honored in `handlePass`, shown as a chip to the
creator), `discussion` (a per-lesson class board after the activities, `community_posts.room =
"lesson-<n>"`), plus `theoryVideo`/`theoryTranscript` (media above the theory reading; both are
fed into `mentorSys` so the lesson mentor knows the video's content — no transcript → the mentor
is told to ask rather than assume). Every lesson row has an ⓘ (`LessonInfoModal`): concept, pass
logic, the exact student steps. ITERATE/CHAT handle **bulk** lock/unlock/routing commands;
"unlock/lock all lessons" is intercepted deterministically in `chatSend` and never refused.

**Creator flow** — the post-build reveal offers 3 cards: *Preview as a student* (`studentView`
state forces `readOnly` inside `SchoolPage`, floating exit pill), *Try the first lesson*
(magical overlay then opens lesson 1 as a student), *Customize* (first-timers auto-open the
guide). **Publish is gated behind Set up**: `school.setupDone` is set by the wizard's publish
step or its "Skip everything & publish" header button; the toolbar/checklist route to the wizard
until then. The studio toolbar is collapsible (`sx_toolbar` in localStorage); the Creator Guide
steps are generated per experience (`GUIDE_STEPS_FOR`). Manual builds ("Build it yourself") pick
an experience from a 4-card popup, scaffold for it, skip the reveal, and open the guide.

**Introduction ("lesson zero")** — `school.intro` (`{on, title, headline, sub, welcome,
journey[], how[], expectations[], pledge, cta}`), authored by `genIntro()`/`INTRO_SYS` in
parallel with EVERY generated build. `IntroPage` renders it themed (school cover as hero,
typed mentor welcome via `TypeLine`, clickable journey map, pledge stored in
`toolStates.__introPledge`). Students see it ONCE (`toolStates.__introSeen`) before the school;
creators land on it from "Try the first lesson" and the toolbar ▶ Intro button (which also
generates one on demand for schools without it). Renameable inline, removable, regenerable —
"regenerate the introduction" is a deterministic `chatSend` shortcut; `intro` is a CHAT_SYS
design key ({title} rename, {on:false} remove) and preserved by ITERATE_SYS.

**Counselor's Office** — section kind `counselor` (`CounselorSection`): students file private
reports/complaints/suggestions → `school_reports` table (RLS: student inserts/reads own; school
owner reads/replies/resolves). Creators see an in-studio notification banner with the open count
(fetched in `SchoolPage`) whose View button adds/opens the section.

**Contact the coach** — `school.contact = {enabled, label}` (toggle in `MentorOffice`'s
availability card) renders a floating DM button for students (`openDM(rec.owner)`;
`PublicSchool` passes `owner: r.user_id`).

**Editing model** — the whole app is "Lovable for schools": the left sidebar (`ProjectChat`) is
a persistent build assistant. Every message can either just talk, apply a **design** patch
(theme/palette/cover/hero/layout — direct, no re-authoring, see `applyDesign`), or apply a
**content** edit (routed through the iterate pipeline above). `CHAT_SYS` classifies which. Design
edits are ~free; content edits cost a real AI call and get an Undo snapshot. Newer design keys:
`heroCard` (hero as an inset card even with a cover), `hoverFx` (lift+glow on `[data-hv]`),
`navSticky:false` and `navStyle:"header"` (a classic website top menu that is deliberately
NOT sticky). `CHAT_SYS` carries never-refuse + reply-honesty rules — don't weaken them.

**Overseer** — a non-blocking "linter" for schools. Deterministic checks (prereq order, uncovered
concepts, contrast) are free graph queries (`lintSchool`); a debounced semantic pass
(`semanticOutline` → cheap-model call) catches redundancy/tone issues. Always advisory with a
one-click fix, never a hard block.

## Major subsystems (all in `school.data`, all client-authored — no new tables needed)

- **Training Ground** (`school.data.training`) — creator feeds source material (book/PDF/notes),
  gets a Knowledge-DNA summary + chapter map, sets always-honor directives + a memory list. Both
  the mentor (`mentorSys`) and build chat (`CHAT_SYS`) get `trainingPreamble(school)` injected.
  Inside it lives the **AI Lab** (`training.lab`): writing samples → `VOICE_DNA_SYS` extracts a
  Voice DNA (editable); banned words (`avoid`), sentence/style rules (`styleNotes`), reply
  length; a **temperature** lever (0–1, warned above 0.9) that rides the proxy's new optional
  `temperature` field into every mentor call (`labTemp(school)`); and an ElevenLabs voice-clone
  stub (`elevenVoiceId`/`elevenKey`, stored for future TTS — marked "coming soon"). All of it
  flows through `labPreamble()` → `trainingPreamble()`, so the mentor AND build chat speak as
  the creator's replica.
- **Introduction editing** — every intro list (journey/how/expectations) is inline-editable
  with add/remove; `intro.sections[]` holds creator-added text blocks and images (media URL or
  AI-generated via `genImageToMedia`); an on-page "tell Senseito AI what to change" box calls
  `editIntro()`/`INTRO_EDIT_SYS` for surgical rewrites.
- **Pages shell** — `school.shell = "pages"` (in `SHELLS`, settable via chat `shell` design
  key): each lesson renders as a full page (hero with cover/number, inline `LessonView`,
  numbered page index + prev/next pager); creator edits title/concept in place and adds
  activity blocks from a picker right on the page.
- **Community** (`school.data.community`) — `widgets` (folders/files/embeds/buttons, nestable,
  featured images, AI-generated workbook PDFs) render in an "Add" menu between the discussion
  board's top and bottom zones; `blocks` are decoration bricks (Title/Text/Image/Video/Iframe/
  Button) in top/bottom zones.
- **Showroom** (`school.data.showroom` or per-block) — an AI slide-deck editor, full-screen
  "Studio" room (like Game Lab), Canva-ish. Renders as a student-facing slider, not a presenter
  view.
- **Certificate** (`school.data.certificate`) — creator designs a diploma (photo/text/accent);
  students who hit 100% completion get an SVG-rendered, downloadable certificate; a public
  `certificates` table lets it show on their profile.
- **Pricing / payments** (`school.data.pricing`) — see Payments below.
- **Achievements** — extended trigger types beyond "N lessons passed": XP threshold, a specific
  lesson, winning a specific game, N downloads. `badgeEarned(badge, ctx)` evaluates against a
  `ctx` built from the enrollment's `tool_states.__gamesWon` / `__downloads`.

## Payments (Stripe Connect per-user, multi-plan, PayPal manual, coupons/keys)

Full detail in `docs/PAYMENTS_SETUP.md`. Summary:

- **Stripe** — Standard Connect via OAuth, **once per creator account** (⚙ Account settings →
  Payments, or the Pricing panel): OAuth `state` is `u:<userId>` → `profiles.stripe_account_id`;
  it then covers every school they own. Legacy per-school connects (`payment_config`) still
  resolve first in `stripe-checkout`. Money and liability never touch the platform.
  Edge functions: `stripe-connect`, `stripe-checkout` (one-time or subscription; `6month` bills
  as a subscription with `interval_count=6`; passes `planId` via the `schoolId__userId__planId`
  ref), `stripe-webhook` (HMAC-verified; writes `entitlements.plan_id`; grants on
  `checkout.session.completed`/`invoice.paid`, revokes on cancel/failed).
- **Plans & gates** — `pricing.plans[]` = multiple payment options per school (label, price,
  once/month/6month/year, per-plan trial 0/1/7/14/30 days, note, `gates`). `gates: null` =
  everything; else `{mentor:false?, sections:[allowed ids]?, lessonsLimit:N?, msgsPerDay:N?}` —
  enforced client-side (`gatesFor()` in `PublicSchool` → `gates` prop on `SchoolPage`).
  `pricing.free = {enabled, gates}` is the free version with an "Unlock everything" upsell.
- **PayPal** — deliberately a **direct creator link** and explicitly **manual**
  (`PAYPAL_PLATFORM_ENABLED = false` — don't flip without discussing): student pays → taps
  "I've paid — notify the creator" → row in `paypal_claims` → creator sees pending claims at the
  top of the Pricing panel → **Confirm & send key** mints a single-use coupon `issued_to` that
  student with `duration_days` sized to the plan (31/186/366). The key appears in the student's
  profile (**School Keys**, `StudentProfileModal`); monthly access lapses via
  `entitlements.expires_at` and is renewed with a fresh key. No email provider is wired —
  claims are in-app only.
- **Coupons** — `redeem_coupon()` SECURITY DEFINER RPC (v2: honors `issued_to`, writes
  `expires_at` from `duration_days`). Creator controls: max uses, code expiry (days), access
  duration (days). Still the easy path for test users.
- **Entitlements** — `entitlements` (`status` + `plan_id` + `expires_at`) gate access in
  `PublicSchool` via `entActive()`/`gatesFor()`; the paywall polls after checkout so access
  unlocks itself.

⚠️ **Known issue, not yet fixed:** the deployed `stripe-checkout`/`stripe-connect`/
`stripe-webhook` edge functions have the user's **live Stripe secret key hardcoded as a fallback**
in the deployed source (`Deno.env.get("STRIPE_SECRET_KEY") || "sk_live_..."`). It is not in this
git repo, but it IS readable by anyone with Supabase dashboard/API access to the project. **The
key should be rolled in the Stripe dashboard and the fallback removed**, relying solely on the
`STRIPE_SECRET_KEY` env secret. Flag this if working in this area and it hasn't been resolved yet.

## Security/robustness patterns already in place — follow them

- The Claude proxy (`claude-proxy` edge function) is `verify_jwt=false` (anon students need AI)
  but has per-IP rate limits + a global daily circuit breaker (`bump_rate` RPC) and prompt
  caching. Public webhook functions (`stripe-webhook`, `paypal-webhook`) are `verify_jwt=false`
  by necessity (the provider calls them) but verify authenticity themselves (HMAC signature /
  PayPal verify-webhook-signature) before writing anything.
- RLS is the access-control layer everywhere — e.g. `school_roster()` and `redeem_coupon()` are
  `SECURITY DEFINER` functions specifically to grant narrow, safe access (roster names without
  leaking emails; coupon redemption without exposing the coupons table) rather than loosening RLS.
- `apiJSON()` unwraps a `{name:"return_json", input:{...}}` tool-use wrapper leak — this bit the
  project once (wiped a school's lessons). If you see other AI-authored fields coming back
  garbled/wrapped, suspect the same class of bug.
- Two-phase generation (see above) is load-bearing for reliability, not a premature optimization.

## Where deeper history lives

This file is deliberately a current-state map, not a changelog. Detailed session-by-session
history (what was built when, why specific bugs happened, exact commit references) lives in this
machine's Claude memory system under the `project_senseito` and `project_senseito_supabase`
memory files — ask Claude to consult memory if you need that archaeology. It is NOT visible in
this repo and does not travel with `git clone`.
