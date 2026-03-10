# Backdoor Hire Detection Platform — Product Requirements Document

## Document control
- **Product name (working title):** Backdoor Hire Detection Platform
- **Prepared for:** Recruitment agency SaaS build
- **Prepared by:** ChatGPT
- **Date:** 7 March 2026
- **Target build environment:** Windsurf
- **Core stack:** Next.js on Vercel, Supabase, Apify, Resend

---

## 1. Executive summary

Build a SaaS platform that allows recruitment agencies to upload candidate introduction data by CSV or ATS export, monitor whether those candidates appear to have joined the client company later, assemble a structured proof pack, and help the agency recover missed placement fees.

The product must not behave like a simple scraper. It should operate as a **revenue protection and evidence workflow system** with four pillars:

1. **Import and normalize introduction data** from CSV and later ATS integrations.
2. **Run evidence checks** across public web, company websites, and controlled enrichment sources.
3. **Score likely backdoor hires** using a multi-signal proof model.
4. **Generate investigator workflows and outreach** so agencies can act on strong cases.

The first release should focus on **CSV upload + proof scoring + case review + outbound chase workflow**.

---

## 2. Problem statement

Recruitment agencies regularly introduce candidates to client companies but later suspect that some candidates were hired directly, through another department, through a subsidiary, or through another route without the original agency receiving its fee.

Today, many agencies handle this badly:
- spreadsheets with little audit trail
- manual LinkedIn searching
- inconsistent ownership rules
- weak proof packs
- poor follow-up workflows
- no central system for missed-fee recovery

The result is lost revenue, inconsistent enforcement, and no reusable intelligence on which clients, sectors, or recruiters produce the most risk.

---

## 3. Product vision

Create the operating system for **missed-fee detection, proof assembly, and revenue recovery** for recruitment agencies.

The product should help agencies answer three questions:
1. **Did this candidate probably join the introduced company?**
2. **How strong is the evidence?**
3. **What should we do next?**

---

## 4. Goals and non-goals

### Goals
- Let an agency upload a CSV and start checking candidates within minutes.
- Create a repeatable evidence model that combines internal and external signals.
- Reduce manual research time per suspected backdoor hire.
- Produce case packs suitable for recruiter review and fee-recovery outreach.
- Create a scalable architecture that can later support ATS integrations, subscriptions, and benchmarking.

### Non-goals for MVP
- Fully autonomous legal decision-making.
- Automatic invoicing without human review.
- Dependence on a single fragile external source.
- Full enterprise ATS ecosystem on day one.
- Complex CRM replacement.

---

## 5. Target users

### Primary user
**Recruitment consultant / account manager**
- uploads CSVs
- reviews flagged cases
- follows chase workflow
- sends outreach

### Secondary user
**Agency owner / operations manager**
- monitors recovery pipeline
- measures success rate
- manages client rules and templates
- controls team access

### Tertiary user
**Finance / compliance user**
- reviews documentation
- exports evidence packs
- tracks recovered revenue
- manages retention and audit controls

---

## 6. User problems to solve

### For recruiters
- “I think this person got hired but I cannot prove it quickly.”
- “I do not want to spend hours checking LinkedIn and company sites manually.”
- “I need a system that tells me which cases are strongest first.”

### For agency owners
- “We lose fees but cannot quantify it.”
- “Our consultants do not consistently document introductions or ownership periods.”
- “We need a repeatable system, not one person’s memory.”

### For finance / compliance
- “We need a structured audit trail before contacting the client.”
- “We need evidence stored safely and reviewed before escalation.”

---

## 7. Core product principles

1. **Evidence over guesswork**
2. **Human review before accusation**
3. **Multi-signal scoring, not one-source claims**
4. **Internal agency data is first-class evidence**
5. **Compliance-aware design from the start**
6. **CSV-first onboarding, integrations later**
7. **Every strong case should end in an action**

---

## 8. High-level MVP scope

### Included in MVP
- agency sign-up and authentication
- organization / workspace model
- CSV upload and column mapping
- candidate introduction record creation
- company normalization and domain matching
- case-checking pipeline
- evidence storage
- proof scoring
- case review queue
- case details screen
- email template generation and sending via Resend
- dashboards for cases and outcomes
- audit trail
- admin controls

### Deferred to Phase 2
- full ATS integrations
- client portal
- billing and subscriptions beyond basic Stripe setup
- advanced benchmarking across agencies
- AI-assisted legal letter drafting
- white-label mode
- browser extension

---

## 9. Recommended technical architecture

### Frontend
- **Framework:** Next.js App Router
- **Hosting:** Vercel
- **UI:** Tailwind + component library
- **Auth UI:** Supabase Auth flows

### Backend
- **Primary database:** Supabase Postgres
- **Authentication:** Supabase Auth
- **Files:** Supabase Storage
- **Server logic:** Next.js server actions / route handlers and Supabase Edge Functions where needed
- **Background work:** Vercel Cron + queue tables + database workers / scheduled jobs

### External services
- **Apify:** crawling / actor execution for public-web and controlled enrichment jobs
- **Resend:** outbound email and event webhooks
- **Optional later:** domain intelligence, Companies House enrichment, ATS connectors

### Reasoning for stack
- Supabase provides Postgres, Auth, Storage, Realtime, and RLS in one platform.
- Vercel Functions and Cron Jobs support server-side API work and scheduled pipelines.
- Apify can run actor jobs and notify external services through its API and webhook system.
- Resend provides email sending plus webhook events for delivery and engagement status.

---

## 10. Product constraints and risk policy

### LinkedIn constraint
LinkedIn explicitly says it does not permit third-party software including crawlers, bots, and scraping/automation on LinkedIn pages. Because of that, LinkedIn-derived evidence must be treated as a **risk-managed layer** rather than the sole product dependency.

**Product policy:**
- do not make the platform unusable without LinkedIn-derived evidence
- classify LinkedIn-related checks as optional / controlled / review-assisted
- always retain alternative public-web evidence paths
- allow manual evidence upload by recruiters

### Evidence quality constraint
The system must never claim “proven hire” from one weak signal such as guessed email format or common-name match.

### Compliance constraint
Because recruitment data is personal data, the platform must support lawful-basis documentation, minimization, review controls, access controls, and retention policies.

---

## 11. Functional requirements

## 11.1 Authentication and organization management

### Requirements
- User can sign up and log in.
- User belongs to an organization.
- Organization can have multiple users with roles.
- Roles: owner, manager, recruiter, finance, read-only.
- Each organization sees only its own data.

### Acceptance criteria
- A recruiter cannot access another organization’s cases.
- An owner can invite teammates.
- A finance user can export case packs but cannot change scoring rules unless permitted.

---

## 11.2 CSV upload and import mapping

### Inputs expected
Required columns for MVP:
- candidate full name
- introduced role
- client company name

Strongly recommended columns:
- submission date
- candidate LinkedIn URL
- candidate location
- client website
- recruiter name
- client contact email
- ownership period / fee term reference
- notes

### Features
- drag-and-drop CSV upload
- preview first 25 rows
- map CSV columns to product fields
- save reusable import mappings
- validate rows and show import errors
- deduplicate within workspace

### Acceptance criteria
- user can upload CSV up to agreed size limit
- user can remap unknown headers
- invalid rows are quarantined, not silently dropped
- imported rows create `candidate_introductions`

---

## 11.3 Data normalization

### Candidate normalization
- split name into parts where possible
- create normalized full-name key
- create fuzzy-name variants
- preserve original raw value

### Company normalization
- normalize company name
- attempt to match legal/trading names
- infer root domain from client website or company search
- store possible parent/subsidiary relation later

### Role normalization
- store raw role title
- store normalized role title
- create seniority and function tags where possible

### Acceptance criteria
- raw values remain stored for audit
- normalized values are searchable and scoreable

---

## 11.4 Evidence collection engine

### Evidence source groups
1. **Internal agency evidence**
   - import row
   - notes
   - recruiter-owned attachments
   - prior outreach data

2. **Public company web**
   - team pages
   - staff bios
   - press releases
   - blogs
   - PDFs
   - event / webinar pages
   - office / contact pages

3. **Public professional footprint**
   - recruiter-supplied LinkedIn URL
   - manual reviewer evidence upload
   - other public bios / portfolio pages / GitHub / speaker pages

4. **Email and domain intelligence**
   - employer domain detection
   - contact page extraction
   - common email pattern inference
   - mailbox plausibility scoring

### Collection pipeline
- create `check_job`
- run one or more Apify actors or internal crawlers
- write results to evidence tables
- store snapshots and metadata
- calculate score
- create or update case

### Acceptance criteria
- each evidence item has source URL, source type, captured time, snippet, confidence contribution
- evidence items are immutable once stored except for moderation flags
- crawl failures are logged

---

## 11.5 Proof scoring engine

### Objective
Translate many weak and strong signals into a case-level confidence score with transparent reasoning.

### Proposed score bands
- **0–34:** weak
- **35–64:** possible
- **65–84:** strong review
- **85–100:** high-confidence case

### Example scoring signals

#### Tier A — strongest
- explicit public company page naming candidate as employee
- internal agency proof of introduction + date + client acknowledgement
- recruiter-uploaded documentary evidence linked to same employer
- exact candidate + employer + date match from trusted source

#### Tier B — strong corroboration
- candidate profile shows employer and aligned dates
- strong role similarity between introduced role and detected role
- company-group mapping shows hire at subsidiary / sister brand
- multiple independent public sources align

#### Tier C — supporting
- inferred email pattern fits candidate name and company domain
- company website reveals standard address format
- candidate public footprint suggests move but not explicit employment statement

#### Tier D — weak
- common name only
- guessed email only
- single noisy source

### Additional scoring features
- negative scoring for conflicting evidence
- duplicate suppression
- reviewer override with audit log
- explanation engine showing why score was assigned

### Acceptance criteria
- every case score is explainable by visible rules
- reviewer can see evidence contribution per source
- system does not auto-send chase emails without human confirmation in MVP

---

## 11.6 Case management

### Case statuses
- new
- checking
- weak evidence
- review needed
- confirmed by recruiter
- outreach sent
- client disputed
- recovered
- invalid / false positive
- archived

### Features
- case list with filters
- bulk actions
- assignee
- notes timeline
- evidence tab
- score history
- outcome tracking

### Acceptance criteria
- reviewer can confirm or dismiss a suspected case
- every status change is auditable

---

## 11.7 Proof pack generation

### Output should include
- candidate details
- introduced role and company
- submission date
- evidence timeline
- source snapshots
- confidence summary
- comments / notes
- next recommended action

### Formats
- in-app case view
- downloadable PDF in later phase
- structured JSON / markdown export in MVP if PDF is deferred

### Acceptance criteria
- owner or finance user can export a proof pack
- evidence sources and timestamps are included

---

## 11.8 Email and outreach workflow

### Use cases
- internal alert to recruiter
- first chase email to client
- escalation email
- follow-up reminder
- recovery campaign sequence

### Features
- email template library
- merge fields
- send via Resend
- save sent-message log
- track delivery events via Resend webhooks
- optionally use reply-to mailbox later

### Acceptance criteria
- user can preview email before sending
- sent email is tied to case and organization
- delivery / bounce status is stored when webhook arrives

---

## 11.9 Dashboard and reporting

### Core metrics
- total uploaded introductions
- total cases checked
- strong-case count
- cases confirmed by user
- outreach sent
- recovery rate
- recovered revenue
- average time to suspected hire
- top risk clients
- top-performing recruiters by recovered value

### Acceptance criteria
- owner dashboard shows current funnel and trend line
- recruiter dashboard shows assigned cases and actions due

---

## 11.10 Admin and compliance controls

### Features
- retention settings
- soft delete and archive
- evidence access logging
- workspace-level settings
- lawful-basis note storage
- terms template storage
- domain allowlists / blocklists for crawling

### Acceptance criteria
- only privileged users can change retention policies
- all evidence access is logged

---

## 12. Detailed user flows

## 12.1 First-time onboarding
1. User signs up.
2. Creates organization.
3. Invites team.
4. Adds sender domain for Resend.
5. Uploads first CSV.
6. Maps columns.
7. Starts first batch check.
8. Watches cases populate.
9. Reviews strongest cases first.

## 12.2 CSV import flow
1. User uploads CSV.
2. System validates encoding and columns.
3. User maps fields.
4. System previews import.
5. User confirms.
6. Import batch created.
7. Rows normalized.
8. Candidate introduction records inserted.
9. Check jobs queued.

## 12.3 Evidence checking flow
1. Scheduler picks queued jobs.
2. Company domain resolved.
3. Public-web crawl initiated.
4. Optional LinkedIn-related enrichment initiated if enabled.
5. Email-pattern inference runs.
6. Evidence stored.
7. Score recalculated.
8. Case status updated.
9. User notified if score crosses threshold.

## 12.4 Case review flow
1. Recruiter opens case.
2. Reviews timeline and evidence.
3. Marks as false positive, review later, or confirm.
4. If confirmed, chooses outreach template.
5. Sends or saves draft.
6. Delivery events and follow-up tasks tracked.

---

## 13. Data model

## 13.1 Core tables

### `organizations`
- id
- name
- slug
- plan
- created_at

### `profiles`
- id
- organization_id
- email
- full_name
- role
- created_at

### `imports`
- id
- organization_id
- uploaded_by
- file_path
- original_filename
- status
- row_count
- valid_row_count
- invalid_row_count
- mapping_json
- created_at

### `candidate_introductions`
- id
- organization_id
- import_id
- candidate_full_name
- candidate_first_name
- candidate_last_name
- candidate_name_normalized
- candidate_linkedin_url
- candidate_location
- introduced_role_raw
- introduced_role_normalized
- client_company_raw
- client_company_normalized
- client_website
- client_domain
- submission_date
- recruiter_name
- fee_term_reference
- ownership_window_days
- notes
- created_at

### `companies`
- id
- organization_id nullable
- name_raw
- name_normalized
- root_domain
- legal_name
- parent_company_name
- website
- created_at

### `check_jobs`
- id
- organization_id
- candidate_introduction_id
- source_group
- job_type
- status
- priority
- started_at
- completed_at
- error_text
- external_run_id
- created_at

### `evidence_items`
- id
- organization_id
- candidate_introduction_id
- case_id
- source_type
- source_url
- source_domain
- snippet_text
- raw_payload_json
- snapshot_path
- captured_at
- confidence_weight
- evidence_tier
- created_at

### `cases`
- id
- organization_id
- candidate_introduction_id
- current_score
- score_band
- status
- assignee_user_id
- confirmed_at
- closed_at
- recovered_value
- created_at
- updated_at

### `case_score_events`
- id
- case_id
- rule_key
- delta
- explanation
- created_at

### `case_notes`
- id
- case_id
- author_user_id
- note_text
- created_at

### `email_templates`
- id
- organization_id
- name
- type
- subject_template
- body_template
- created_at

### `case_emails`
- id
- organization_id
- case_id
- resend_email_id
- to_email
- subject
- body_html
- status
- sent_at
- created_at

### `webhook_events`
- id
- organization_id nullable
- provider
- event_type
- payload_json
- received_at

### `audit_logs`
- id
- organization_id
- actor_user_id nullable
- entity_type
- entity_id
- action
- metadata_json
- created_at

---

## 13.2 Storage buckets

### Private buckets
- `imports`
- `evidence-snapshots`
- `proof-packs`
- `attachments`

### Rules
- all buckets private by default
- signed URLs for limited-time access
- organization-scoped access patterns

---

## 14. Suggested RLS model

- every row includes `organization_id`
- authenticated users can access only rows for their organization
- role-based policies govern inserts/updates/deletes
- finance and owner roles can export
- service role is used only on trusted server side / function side

---

## 15. API and service design

## 15.1 App routes / actions
- `POST /api/imports/upload`
- `POST /api/imports/:id/confirm`
- `GET /api/cases`
- `GET /api/cases/:id`
- `POST /api/cases/:id/review`
- `POST /api/cases/:id/send-email`
- `POST /api/webhooks/resend`
- `POST /api/webhooks/apify`
- `POST /api/jobs/run-checks`

## 15.2 Background jobs
- import parsing job
- normalization job
- company domain resolution job
- crawl trigger job
- evidence parsing job
- score recalculation job
- reminder / follow-up job

---

## 16. Apify integration design

## 16.1 Apify use cases
- crawl company website and discover team/staff/contact pages
- extract public employee mentions
- capture public pages or snippets tied to candidate names
- optionally run controlled LinkedIn-related actors where enabled
- return structured evidence to webhook endpoint

## 16.2 Apify integration flow
1. App creates `check_job`.
2. Server calls Apify Run Actor API with candidate/company/domain payload.
3. Actor run ID stored in `check_jobs.external_run_id`.
4. Apify webhook notifies app on success/failure.
5. App fetches actor dataset output.
6. Evidence parser maps findings into `evidence_items`.
7. Score engine recalculates case.

## 16.3 Recommended actor categories
- company-site page discovery actor
- company-site content extraction actor
- candidate/company evidence matcher actor
- optional LinkedIn-derived actor behind feature flag

## 16.4 LinkedIn-related design recommendation
Treat LinkedIn as:
- **feature flag controlled**
- **organization opt-in**
- **lower dependency than public company web**
- **easy to disable without breaking the platform**

---

## 17. Resend integration design

## 17.1 MVP use cases
- send internal alerts
- send chase emails
- send follow-ups
- receive webhook events for delivered, bounced, opened where available

## 17.2 Flow
1. User selects template.
2. App renders subject/body.
3. Server sends via Resend.
4. Response ID stored in `case_emails`.
5. Resend webhook updates status.

## 17.3 Domain setup
- verify sending domain per environment
- configure SPF/DKIM/DMARC correctly
- maintain separate domains or subdomains for transactional mail if required

---

## 18. Vercel deployment design

## 18.1 Environments
- local
- preview
- production

## 18.2 Environment variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APIFY_TOKEN`
- `RESEND_API_KEY`
- `APP_BASE_URL`
- `CRON_SECRET`
- any feature flags for LinkedIn checks

## 18.3 Cron usage
Use Vercel Cron to:
- process queued check jobs
- retry failed jobs
- schedule follow-ups
- generate daily digest summaries

---

## 19. Proposed Windsurf project structure

```text
/apps/web
  /app
    /(auth)
    /(dashboard)
    /api
      /imports
      /cases
      /webhooks
      /jobs
  /components
  /lib
    /supabase
    /apify
    /resend
    /scoring
    /normalization
    /auth
  /types
  /emails
  /styles

/packages
  /db
    schema.sql
    policies.sql
    types.ts
  /shared
    scoring-rules.ts
    constants.ts
    validators.ts
  /workers
    import-worker.ts
    scoring-worker.ts
    evidence-parser.ts
```

---

## 20. AI-assisted features for later phases

These are not required for MVP, but the system should be designed so they can be added later:
- AI extraction of candidate/company mentions from crawled pages
- AI summarization of proof packs
- AI suggestions for strongest next action
- AI deduplication and entity resolution
- AI generation of client-specific chase emails

Guardrails:
- AI cannot mark a case legally valid on its own
- AI output must be reviewable and reversible

---

## 21. Compliance and governance requirements

### Required design choices
- private-by-default storage
- audit logs for evidence access
- role-based access control
- lawful-basis notes stored at organization level
- retention controls
- review before outbound accusation
- suppression / delete capability
- export traceability

### Operational guidance
- document a legitimate interests assessment before rollout
- make source usage configurable by organization
- avoid storing unnecessary personal data
- store only the minimum evidence required for the case

---

## 22. Success metrics

### Product KPIs
- time from CSV upload to first reviewed case
- percentage of imported rows successfully normalized
- evidence-per-case rate
- false-positive rate
- reviewer confirmation rate
- outreach sent rate
- recovery rate
- recovered revenue per agency
- retention at 30/90 days

### System KPIs
- import processing success rate
- average check job runtime
- Apify job failure rate
- webhook processing success rate
- scoring latency

---

## 23. Pricing hypothesis

### Starter
- CSV upload only
- limited monthly checks
- limited users

### Growth
- more checks
- saved templates
- automated follow-ups
- more history

### Pro
- team workflows
- priority checking
- API / ATS integrations
- benchmarking
- advanced exports

Optional usage-based billing could be tied to:
- candidates checked
- evidence jobs run
- emails sent
- storage consumed

---

## 24. MVP release plan

## Phase 0 — Foundation
- create repo and environments
- configure Supabase project
- configure Vercel deployment
- configure Resend domain
- create DB schema and RLS
- implement auth and org model

## Phase 1 — CSV to case pipeline
- upload CSV
- mapping UI
- import parser
- normalization
- create candidate introductions
- case shell generation

## Phase 2 — Evidence engine
- queue jobs
- integrate Apify actor run flow
- webhook ingestion
- evidence storage
- public company-site checks
- initial score engine

## Phase 3 — Reviewer workflow
- case list
- case detail
- score explanation
- reviewer actions
- notes and status updates

## Phase 4 — Outreach
- email templates
- Resend integration
- send workflow
- webhook status updates
- reminders

## Phase 5 — Hardening
- retries
- audit logs
- dashboards
- exports
- retention settings
- permission review

---

## 25. Implementation backlog for Windsurf

## Epic A — Authentication and workspace
- set up Supabase Auth
- create profiles and organizations tables
- implement invite flow
- implement role checks

## Epic B — Import pipeline
- build upload UI
- parse CSV server-side
- persist raw file to Storage
- build mapping UI
- insert rows into imports and candidate_introductions
- build error reporting

## Epic C — Normalization and matching
- normalize names
- normalize companies
- resolve domains
- normalize roles
- create duplicate checks

## Epic D — Evidence pipeline
- create job queue tables
- create cron worker
- create Apify client wrapper
- create webhook receiver
- parse datasets into evidence
- store snapshots

## Epic E — Scoring engine
- define rules file
- create score event table
- build explanation model
- apply thresholds
- add reviewer overrides

## Epic F — Case UI
- build case list
- filters and search
- evidence timeline
- score panel
- status workflow
- notes panel

## Epic G — Outreach
- create template editor
- build send-email server action
- connect Resend
- store send logs
- process webhooks

## Epic H — Admin and reporting
- dashboards
- exports
- retention settings
- audit log screens

---

## 26. Example scoring rules v1

```ts
score += 40 if company_staff_page_names_candidate_exactly
score += 25 if candidate_profile_explicitly_lists_company
score += 20 if role_similarity_above_threshold
score += 15 if date_alignment_within_ownership_window
score += 10 if multiple_independent_sources_confirm
score += 8  if company_email_pattern_matches_candidate_name
score -= 20 if evidence_conflicts_with_current_employer
score -= 15 if common_name_without_secondary_identifier
```

**Score outcome:**
- `<35` weak
- `35-64` possible
- `65-84` strong review
- `85+` high-confidence case

---

## 27. UX requirements

### Dashboard UX
- recruiter sees actions due first
- manager sees value at risk and recovery funnel
- cases sortable by score, age, client, recruiter

### Import UX
- must be simple enough for non-technical agency staff
- clear validation and row-level errors
- saved import templates for recurring exports

### Case UX
- score explanation must be visible
- evidence grouped by strength and source
- obvious distinction between “supportive” and “strong” proof

---

## 28. Security requirements

- service keys only on trusted server side
- no direct client exposure of secrets
- signed webhook verification where possible
- rate limiting on public endpoints
- content-type and file-size validation for imports
- antivirus / scanning later for uploaded attachments if needed
- log all privileged actions

---

## 29. Open product decisions

These need to be finalized during setup:
1. Will CSV import remain the only onboarding method in MVP?
2. Which Apify actors will be used initially?
3. Will LinkedIn-related enrichment be enabled in MVP or feature-flagged off initially?
4. Will proof packs export as markdown first or PDF in MVP?
5. Which roles can send external chase emails?
6. What retention window should be default?
7. Will revenue recovered be manually entered or linked to finance data?

---

## 30. Recommended first build decisions

To move quickly in Windsurf, start with these choices:
- **Use Next.js + Supabase + Vercel as the base app immediately.**
- **Make CSV import the only input in v1.**
- **Focus first on public company website evidence before deeper enrichment.**
- **Add LinkedIn-derived checks behind a feature flag.**
- **Store all evidence and scoring events from day one.**
- **Ship case review before advanced automation.**
- **Use Resend only for outbound transactional / chase emails first.**

---

## 31. Build-ready setup checklist

### Infrastructure
- [ ] Create Supabase project
- [ ] Create Vercel project with local / preview / prod envs
- [ ] Add environment variables
- [ ] Create Resend account and verify domain
- [ ] Create Apify account and token

### Database
- [ ] Create core tables
- [ ] Add indexes
- [ ] Add RLS policies
- [ ] Create storage buckets

### Application
- [ ] Scaffold auth
- [ ] Scaffold dashboard shell
- [ ] Build CSV upload page
- [ ] Build import parser
- [ ] Build cases list and case detail page
- [ ] Build email template CRUD

### Background processing
- [ ] Build job queue model
- [ ] Build cron-triggered worker
- [ ] Build Apify run wrapper
- [ ] Build Apify webhook endpoint
- [ ] Build Resend webhook endpoint

### Governance
- [ ] Add audit logs
- [ ] Add role checks
- [ ] Add retention settings UI placeholder
- [ ] Write lawful-basis/admin notes page

---

## 32. Recommended v1 repo tasks

1. Create app shell and auth.
2. Build database schema and policies.
3. Implement CSV upload and import mapping.
4. Create candidate introductions table and list UI.
5. Add check-job queue.
6. Integrate one Apify actor for company-site discovery.
7. Add evidence storage and score computation.
8. Build case review screens.
9. Add Resend outbound flow.
10. Add dashboard and hardening.

---

## 33. Sources used for technical and risk assumptions

- Apify API supports running actors, monitoring runs, retrieving output datasets, and configuring webhooks.
- Supabase supports Auth, Postgres, Storage, Row Level Security, database functions, and Edge Functions.
- Vercel supports server-side functions and cron-triggered invocations.
- Resend supports sending email, Next.js integration guidance, and webhooks for event handling.
- LinkedIn states that third-party crawlers, bots, plug-ins, and other software that scrape or automate activity on LinkedIn are not permitted.

---

## 34. Final recommendation

This product is viable as a **CSV-first missed-fee detection and proof workflow platform**.

The best MVP is not “scrape LinkedIn and prove a hire.”
It is:
- upload agency introductions
- gather internal and public evidence
- score likely cases transparently
- let humans review
- generate action-ready outreach

That gives agencies something they can operationalize immediately while keeping the architecture flexible for stronger integrations and broader revenue-protection workflows later.
