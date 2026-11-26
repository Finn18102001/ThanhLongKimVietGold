<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Thăng Long Kim Việt — monorepo (Website + POS admin)

## Quality First (mọi task)

**Quality First, Token Second.** One agent. See `.cursor/rules/tlkv-quality-first.mdc`.

1. Understand Requirements → 2. Context Discovery → 3. Root Cause & Impact → 4. Best Solution → 5. Self-Verification → 6. Quality Over Tokens.

## Website (Express + vanilla JS)

- Playbook: `ENGINEERING-PLAYBOOK.md`
- Feature map: `docs/FEATURE_MAP.md`
- Local: `npm start` → `http://127.0.0.1:5190`

## POS admin (Next.js `src/`)

Development contract (mandatory): `docs/SYSTEM_DEVELOPMENT_RULES.md`

Hard-test / build port: `docs/pos-big-update/POS-DEV-BUILD.md` (account `tuananh18101@gmail.com` / `1234567`, port 3000).

- New work is a **separate module** with its **own router**. Do not edit unrelated modules.
- Inventory never updates without a ledger transaction.
- Backend decides stock, price, status, revenue. Frontend only sends commands.
- Money is integer VND. Business time is server time.
- UI: match the provided admin mock. Taste-skill lives in `.cursor/skills/` and `.agents/skills/`.
- Supabase table CRUD: read **§32.1 Data API GRANT** in `docs/SYSTEM_DEVELOPMENT_RULES.md` before any `CREATE`/`ALTER` table (migrations, MCP, SQL Editor, `db reset`). Explicit `GRANT` in the same migration; see `.cursor/rules/tlkv-supabase-data-api-grants.mdc`.
- Server Actions (mua/bán/hóa đơn): never throw business errors — return `ActionResult` from `src/shared/lib/action-result.ts` so UI shows the real cause instead of React #441 (§30.1).
- Shared Supabase with Website: any change to `products` / `brands` / `gold_price_rows` / `news*` → impact-check Website before coding.
