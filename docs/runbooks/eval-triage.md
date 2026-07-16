# KOI Eval Triage Runbook

This runbook is for responding to red/yellow signals from the `Full-Stack Tests` GitHub Actions workflow and the **KOI Eval Dashboard** issue.

## Where to look first

1. Open the GitHub Actions run linked in the dashboard comment.
2. Check the **job summary** sections:
   - Preflight
   - Suite A (contract) outcome
   - Suite B (Retrieval)
   - Suite D Delta (KOI Value-Add)
   - Hallucination baseline diff
3. Download artifacts (if needed):
   - `reports/evals/` (JSON + Markdown reports)
   - `docs/test-results/` (Suite D outputs)
   - `scratch/` (generated files)
   - `preflight_result.json`, `citation_verification.json`

## Triage decision tree (fast)

### 1) Preflight is red

**What it means:** KOI `/query` or `/graph` is unhealthy (or returned empty data).

**Do:**
- Treat as an outage/health regression first (not an eval regression).
- Check KOI server health/uptime and logs.
- Re-run workflow once after confirming service recovery.

**Do not:** refresh baselines.

### 2) Contract test (Suite A) is red

**What it means:** schema drift between MCP tool contracts and backend APIs (e.g., `query_code_graph` query types).

**Do:**
- Reproduce locally by running the contract test in `regen-koi-mcp` (see that repo’s `npm run test:contract`).
- Fix by syncing MCP enums/shapes to the backend contract.
- Re-run workflow; this should go green without baseline changes.

**Do not:** refresh Suite B baseline to “hide” a contract break.

### 3) Suite B is yellow/red

**What it means:** deterministic retrieval expectations changed (ranking drift, missing docs, indexing changes, regressions).

**Do:**
- Inspect `reports/evals/prod/*_suite_b.json` for:
  - `baseline_diff.regressions`
  - `baseline_diff.rank_regressions`
  - each failing test’s `observed_top`
- Decide which bucket this is:
  1. **Index freshness/coverage issue**: expected items missing entirely.
  2. **Ranking change but still acceptable**: expected items moved but still appear.
  3. **True regression**: expected items replaced with irrelevant items.

**If it’s acceptable change:** refresh baseline via PR:
- `koi-research/reports/baselines/prod/suite_b.json`
- Command: see `koi-research/docs/test-protocol-full-stack.md:573`

**If it’s a regression:** fix retrieval/indexing; do not refresh baseline until correct.

### 4) Suite D Delta (KOI Value-Add) is yellow/red

**What it means:** KOI-grounded runs stopped outperforming baseline runs (or got worse) on measurable signals:
- fewer verifiable citations
- worse verified citation rate / higher hallucination rate
- missing required KOI tool usage

**Do:**
- Open `reports/evals/prod/*_suite_d_delta.json` and inspect the pair(s) with bad status:
  - `pairs[].baseline.citations` vs `pairs[].koi.citations`
  - `pairs[].delta.*` (especially `verified_rate_delta`)
  - `pairs[].koi.koi_tool_calls` (ensure `search` and `query_code_graph` happened)
- If KOI run didn’t call tools, treat as a prompting/agent regression and adjust scenarios/checks.
- If KOI run called tools but citations regressed, treat as retrieval drift (often correlated with Suite B).

**Do not:** “fix” by weakening checks until you understand the failure mode.

### 5) Hallucination baseline diff is yellow/red

**What it means:** citations in the evaluated output became less reliable vs baseline.

**Do:**
- Open `reports/evals/prod/*_hallucination_diff.json` and the linked `citation_verification.json`.
- Identify failure type:
  - file path doesn’t exist
  - line number out of range
  - symbol not found
  - GitHub URL inaccessible
- Decide if it’s:
  - a model behavior change (hallucinating more)
  - a repo/paths change (citations now stale)
  - a verifier false positive (needs pattern tuning)

**If verifier false positive:** adjust `scripts/verify-citations.py` patterns (keep thresholds stable).

**If behavior changed but acceptable:** refresh baseline via PR:
- `koi-research/reports/baselines/prod/hallucination.json`
- Command: see `koi-research/docs/test-protocol-full-stack.md:591`

## Ownership + cadence

Recommended weekly rhythm:
- 15 minutes: review the latest run + dashboard signals
- Decide: fix regression / accept change + refresh baseline / add new coverage

Primary references:
- `koi-research/docs/eval-framework-design.md:1`
- `koi-research/docs/test-protocol-full-stack.md:1`

