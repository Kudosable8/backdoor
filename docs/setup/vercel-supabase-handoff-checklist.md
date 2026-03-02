# Vercel + Supabase Handoff Checklist

Use this checklist when connecting this repo to Vercel with separate Supabase DEV/PROD projects.

## 1) Vercel Project
- [ ] Create/select Vercel project: `kudosable-app`
- [ ] Connect GitHub repository
- [ ] Confirm production branch is `main`

## 2) Environment Mapping Rules
- [ ] **Production (main)** uses **Supabase PROD**
- [ ] **Preview (dev + PRs)** uses **Supabase DEV**
- [ ] **Local development** uses **Supabase DEV** via `.env.local`

## 3) Required Environment Variables
Set these in Vercel for each environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

### Production values (PROD Supabase)
- [ ] `NEXT_PUBLIC_SUPABASE_URL=<PROD_PROJECT_URL>`
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PROD_PUBLISHABLE_OR_ANON_KEY>`

### Preview values (DEV Supabase)
- [ ] `NEXT_PUBLIC_SUPABASE_URL=<DEV_PROJECT_URL>`
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<DEV_PUBLISHABLE_OR_ANON_KEY>`

## 4) Supabase Project Details to Record
- [ ] DEV project ref: `<DEV_PROJECT_REF>`
- [ ] PROD project ref: `<PROD_PROJECT_REF>`
- [ ] Project URLs and keys stored securely (never commit secrets)

## 5) Deployment Verification
- [ ] Create/update PR from `dev` and verify Preview deployment works
- [ ] Confirm auth and DB calls in Preview hit DEV Supabase
- [ ] Merge to `main` and verify Production deployment works
- [ ] Confirm Production traffic hits PROD Supabase

## 6) Safety Checks
- [ ] Row Level Security is enabled for protected tables
- [ ] No service role key is exposed in client-side env vars
- [ ] Migration plan prepared before PROD schema changes
