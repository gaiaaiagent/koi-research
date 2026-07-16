# KOI Weekly Eval Digest — 2026-07-01 → 2026-07-08

**Overall: 🔴 RED**  ·  generated 2026-07-08T04:47Z  ·  source: `eval-reports` branch

> Alerts this week — 🔴 1 (2026-07-05) · ⚠️ 0 (—)

**Read:** **retrieval quality regressed** to 71.4% (Suite B — real, vs 100% baseline); Suite D / hallucination reds are **harness/SDK errors** (baseline agent failed), not KOI-quality signals.

## Retrieval (Suite B)
- 1 runs · avg pass-rate **71.4%** · worst-status 🔴 red
- best 2026-07-05 (71.4%) · worst 2026-07-05 (71.4%)

## KOI value-add (Suite D delta)
- 1 runs · worst-status 🔴 red · ⚙️ harness-error runs: 2026-07-05 (baseline/SDK failed → Δ uncomputable, **not** a KOI-quality signal)

## Hallucination (citation verification)
- 1 runs · worst-status ✅ green · ⚙️ insufficient-data: 2026-07-05 (0 citations — upstream Suite D produced none)

---
_Draft digest — `scratch/eval-digest/aggregate_weekly_evals.py`._