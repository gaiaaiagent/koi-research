#!/usr/bin/env python3
"""
aggregate_weekly_evals.py

The weekly KOI eval rollup. Invoked by .github/workflows/weekly-eval-digest.yml
(Sunday 08:00 UTC) — this is the sole weekly rollup. A second, bash-based
implementation lived in full-stack-tests.yml as the `weekly-summary` job; it had
never once succeeded (invalid `>=` inside `[[ ]]`, plus a date-window boundary
bug that dropped the current day's report) and was removed in favour of this one.

Roll up the last N days of KOI full-stack eval reports into a single weekly
digest (markdown + JSON). Reads the JSON reports that full-stack-tests.yml
persists to the `eval-reports` branch:

  prod/YYYY-MM-DD-HHMM_suite_b.json          (retrieval eval + baseline diff)
  prod/YYYY-MM-DD-HHMM_suite_d.json          (Agent SDK scenarios)
  prod/YYYY-MM-DD-HHMM_suite_d_delta.json    (KOI value-add A/B)
  prod/YYYY-MM-DD-HHMM_hallucination_diff.json (citation verification)

Schema verified against a real report (prod/2026-02-08-0640_suite_b.json):
  summary.{total,passed,failed,pass_rate,avg_hit_rank_worst}
  baseline_diff.{status,baseline_pass_rate,current_pass_rate,pass_rate_drop,regressions[]}
suite_d_delta / hallucination fields accessed defensively (.get) since their
exact shapes were not pinned against a live file — VERIFY before relying on
those sections (see README open-questions).

Stdlib only — no pip install. Runnable locally TODAY:

  python3 aggregate_weekly_evals.py \
    --repo-dir ~/projects/RegenAI/koi-research \
    --branch eval-reports --days 7 \
    --out-md /tmp/koi-weekly-eval.md --out-json /tmp/koi-weekly-eval.json
"""
import argparse
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

FNAME_RE = re.compile(r"(?P<date>\d{4}-\d{2}-\d{2})-(?P<hm>\d{4})_(?P<suite>suite_b|suite_d|suite_d_delta|hallucination_diff)\.json$")


def _git(repo_dir, *args):
    return subprocess.run(["git", "-C", repo_dir, *args],
                          capture_output=True, text=True, check=False)


def list_branch_reports(repo_dir, branch):
    """Return [(path, date_str)] for report JSONs on the branch."""
    ref = branch
    # Prefer origin/<branch> if the local ref is stale/absent.
    if _git(repo_dir, "rev-parse", "--verify", f"origin/{branch}").returncode == 0:
        ref = f"origin/{branch}"
    out = _git(repo_dir, "ls-tree", "-r", ref, "--name-only")
    if out.returncode != 0:
        sys.exit(f"git ls-tree failed for {ref}: {out.stderr.strip()}")
    items = []
    for path in out.stdout.splitlines():
        m = FNAME_RE.search(path)
        if m:
            items.append((path, m.group("date"), m.group("suite"), ref))
    return items


def read_branch_json(repo_dir, ref, path):
    out = _git(repo_dir, "show", f"{ref}:{path}")
    if out.returncode != 0:
        return None
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError:
        return None


def within_window(date_str, days):
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        return False
    return d >= (datetime.now(timezone.utc) - timedelta(days=days))


def status_rank(s):
    return {"green": 0, "yellow": 1, "red": 2}.get((s or "unknown").lower(), 1)


def aggregate(repo_dir, branch, days):
    reports = list_branch_reports(repo_dir, branch)
    by_suite = defaultdict(list)  # suite -> [(date, data)]
    for path, date_str, suite, ref in reports:
        if not within_window(date_str, days):
            continue
        data = read_branch_json(repo_dir, ref, path)
        if data is not None:
            by_suite[suite].append((date_str, data))

    for suite in by_suite:
        by_suite[suite].sort(key=lambda t: t[0])

    agg = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "window_days": days,
        "report_counts": {s: len(v) for s, v in by_suite.items()},
        "suite_b": _agg_suite_b(by_suite.get("suite_b", [])),
        "suite_d_delta": _agg_delta(by_suite.get("suite_d_delta", [])),
        "hallucination": _agg_halluc(by_suite.get("hallucination_diff", [])),
    }
    # Headline = worst status seen across the week.
    worst = "green"
    for sect in ("suite_b", "suite_d_delta", "hallucination"):
        st = (agg[sect] or {}).get("worst_status")
        if st and status_rank(st) > status_rank(worst):
            worst = st
    agg["headline_status"] = worst
    agg["alerts"] = {
        "red_dates": sorted({d for sect in ("suite_b", "suite_d_delta", "hallucination")
                             for d in (agg[sect] or {}).get("red_dates", [])}),
        "yellow_dates": sorted({d for sect in ("suite_b", "suite_d_delta", "hallucination")
                                for d in (agg[sect] or {}).get("yellow_dates", [])}),
    }
    return agg


def _collect_status_dates(rows, get_status):
    red, yellow = [], []
    for date_str, data in rows:
        st = (get_status(data) or "unknown").lower()
        if st == "red":
            red.append(date_str)
        elif st == "yellow":
            yellow.append(date_str)
    return red, yellow


def _agg_suite_b(rows):
    if not rows:
        return None
    rates = [(d, (data.get("summary") or {}).get("pass_rate")) for d, data in rows]
    rates = [(d, r) for d, r in rates if r is not None]
    red, yellow = _collect_status_dates(rows, lambda x: (x.get("baseline_diff") or {}).get("status"))
    worst = "green"
    for _, data in rows:
        st = (data.get("baseline_diff") or {}).get("status")
        if status_rank(st) > status_rank(worst):
            worst = st
    best = max(rates, key=lambda t: t[1]) if rates else None
    low = min(rates, key=lambda t: t[1]) if rates else None
    return {
        "runs": len(rows),
        "avg_pass_rate": round(sum(r for _, r in rates) / len(rates), 4) if rates else None,
        "best": {"date": best[0], "pass_rate": best[1]} if best else None,
        "worst": {"date": low[0], "pass_rate": low[1]} if low else None,
        "worst_status": worst,
        "red_dates": red,
        "yellow_dates": yellow,
    }


def _agg_delta(rows):
    """Suite D KOI value-add. Distinguishes a genuine negative delta (KOI hurts)
    from a harness/SDK failure where the delta is uncomputable (delta=null,
    reason=baseline_failed_checks/sdk_err) — the latter is NOT a KOI-quality signal."""
    if not rows:
        return None
    def summ(x):
        return (x.get("koi_value_add_delta") or {}).get("summary") or {}
    worst = "green"
    numeric_deltas = []   # (date, delta) — only where computable
    harness_errors = []   # dates where baseline/SDK harness failed (delta null)
    for date_str, data in rows:
        s = summ(data)
        st = s.get("status")
        if status_rank(st) > status_rank(worst):
            worst = st
        d = s.get("avg_verified_rate_delta")
        pair_reasons = " ".join(str((p or {}).get("reason", "")) for p in (data.get("pairs") or []))
        harness_failed = d is None or "err" in pair_reasons or "baseline_failed" in pair_reasons
        if d is not None:
            numeric_deltas.append((date_str, d))
        if harness_failed:
            harness_errors.append(date_str)
    red, yellow = _collect_status_dates(rows, lambda x: summ(x).get("status"))
    return {
        "runs": len(rows),
        "numeric_deltas": numeric_deltas,
        "avg_numeric_delta": round(sum(v for _, v in numeric_deltas) / len(numeric_deltas), 4) if numeric_deltas else None,
        "harness_error_dates": harness_errors,
        "worst_status": worst,
        "red_dates": red,
        "yellow_dates": yellow,
    }


def _agg_halluc(rows):
    """Citation-verification. Real schema: top-level `status`
    (green/yellow/red/insufficient_data), `current.hallucination_rate`, `delta`.
    insufficient_data means Suite D produced <10 citations (usually because the
    upstream agent run itself failed) — a harness signal, not a hallucination one."""
    if not rows:
        return None
    statuses, rates, insufficient = [], [], []
    worst = "green"
    for date_str, data in rows:
        st = data.get("status")
        statuses.append((date_str, st))
        if st == "insufficient_data":
            insufficient.append(date_str)
        elif status_rank(st) > status_rank(worst):
            worst = st
        r = (data.get("current") or {}).get("hallucination_rate")
        if r is not None and st not in ("insufficient_data", None):
            rates.append((date_str, r))
    red = [d for d, s in statuses if s == "red"]
    yellow = [d for d, s in statuses if s == "yellow"]
    trend = None
    if len(rates) >= 2:
        trend = "improving" if rates[-1][1] < rates[0][1] else (
            "stable" if rates[-1][1] == rates[0][1] else "worsening")
    return {
        "runs": len(rows),
        "avg_rate": round(sum(r for _, r in rates) / len(rates), 4) if rates else None,
        "trend": trend,
        "insufficient_data_dates": insufficient,
        "worst_status": worst,
        "red_dates": red,
        "yellow_dates": yellow,
    }


EMOJI = {"green": "✅", "yellow": "⚠️", "red": "🔴", "unknown": "❓"}


def render_md(agg):
    h = agg["headline_status"]
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=agg["window_days"])
    lines = [
        f"# KOI Weekly Eval Digest — {start} → {end}",
        "",
        f"**Overall: {EMOJI.get(h,'❓')} {h.upper()}**  ·  generated {agg['generated_at'][:16]}Z  ·  source: `eval-reports` branch",
        "",
    ]
    a = agg["alerts"]
    if a["red_dates"] or a["yellow_dates"]:
        lines.append(f"> Alerts this week — 🔴 {len(a['red_dates'])} ({', '.join(a['red_dates']) or '—'}) · ⚠️ {len(a['yellow_dates'])} ({', '.join(a['yellow_dates']) or '—'})")
        lines.append("")
    # Diagnosis: separate genuine quality regressions from harness/SDK errors.
    diag = []
    sb = agg["suite_b"]
    if sb and status_rank(sb["worst_status"]) >= 2:
        diag.append(f"**retrieval quality regressed** to {_pct(sb['avg_pass_rate'])} (Suite B — real, vs 100% baseline)")
    dl = agg["suite_d_delta"]
    hl = agg["hallucination"]
    harness = (dl and dl["harness_error_dates"]) or (hl and hl["insufficient_data_dates"])
    if harness:
        diag.append("Suite D / hallucination reds are **harness/SDK errors** (baseline agent failed), not KOI-quality signals")
    if diag:
        lines += ["**Read:** " + "; ".join(diag) + ".", ""]

    sb = agg["suite_b"]
    if sb:
        lines += ["## Retrieval (Suite B)",
                  f"- {sb['runs']} runs · avg pass-rate **{_pct(sb['avg_pass_rate'])}** · worst-status {EMOJI.get(sb['worst_status'],'❓')} {sb['worst_status']}",
                  f"- best {sb['best']['date']} ({_pct(sb['best']['pass_rate'])}) · worst {sb['worst']['date']} ({_pct(sb['worst']['pass_rate'])})",
                  ""]
    dl = agg["suite_d_delta"]
    if dl:
        parts = [f"{dl['runs']} runs", f"worst-status {EMOJI.get(dl['worst_status'],'❓')} {dl['worst_status']}"]
        if dl["numeric_deltas"]:
            parts.append("verified-rate Δ " + ", ".join(f"{d}:{_signed(v)}" for d, v in dl["numeric_deltas"]))
        if dl["harness_error_dates"]:
            parts.append(f"⚙️ harness-error runs: {', '.join(dl['harness_error_dates'])} (baseline/SDK failed → Δ uncomputable, **not** a KOI-quality signal)")
        lines += ["## KOI value-add (Suite D delta)", "- " + " · ".join(parts), ""]
    hl = agg["hallucination"]
    if hl:
        parts = [f"{hl['runs']} runs", f"worst-status {EMOJI.get(hl['worst_status'],'❓')} {hl['worst_status']}"]
        if hl["avg_rate"] is not None:
            parts.append(f"avg rate {_pct(hl['avg_rate'])} (trend {hl['trend'] or 'n/a'})")
        if hl["insufficient_data_dates"]:
            parts.append(f"⚙️ insufficient-data: {', '.join(hl['insufficient_data_dates'])} (0 citations — upstream Suite D produced none)")
        lines += ["## Hallucination (citation verification)", "- " + " · ".join(parts), ""]
    if not (sb or dl or hl):
        lines += ["_No eval reports found in the window. Either the runs are not firing, "
                  "not persisting to `eval-reports`, or this clone is stale — check the live "
                  "GitHub Actions history._", ""]
    lines.append("---")
    lines.append("_Generated by `scripts/aggregate_weekly_evals.py` via `.github/workflows/weekly-eval-digest.yml`._")
    return "\n".join(lines)


def _pct(x):
    return "n/a" if x is None else f"{x*100:.1f}%"


def _signed(x):
    return "n/a" if x is None else (f"+{x:.3f}" if x >= 0 else f"{x:.3f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo-dir", required=True, help="path to koi-research clone")
    ap.add_argument("--branch", default="eval-reports")
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--out-md", default=None)
    ap.add_argument("--out-json", default=None)
    args = ap.parse_args()

    repo = os.path.expanduser(args.repo_dir)
    agg = aggregate(repo, args.branch, args.days)
    md = render_md(agg)

    if args.out_json:
        with open(args.out_json, "w") as f:
            json.dump(agg, f, indent=2)
    if args.out_md:
        with open(args.out_md, "w") as f:
            f.write(md)
    if not (args.out_md or args.out_json):
        print(md)


if __name__ == "__main__":
    main()
