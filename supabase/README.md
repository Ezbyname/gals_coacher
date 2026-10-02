# Supabase

Cloud schema for Gals Coacher. Supabase is the canonical store **after sync**;
the device's SQLite database is the operational source of truth during
training (see `docs/ARCHITECTURE.md` §6–8).

- Migrations go in `supabase/migrations/` (`<timestamp>_<name>.sql`), applied with the Supabase CLI (`supabase db push`).
- Every table: `enable row level security` + family-scoped policies **in the same migration**.
- Use the same UUIDs as the device (client-generated) so uploads are idempotent upserts.

No tables yet — the first schema (families, children) arrives in Phase 1.
