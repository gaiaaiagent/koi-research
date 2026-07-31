"""
Injectivity fuzz: run many DISTINCT statements/claim_types through the real
adapter and assert every distinct input yields a distinct fingerprint.
A hash-map with two distinct inputs sharing one fingerprint = collision = defect.

Also stresses control characters that _nt_literal does NOT escape
(form-feed, vtab, NUL, backspace, CR/LF pairs), where a parse->serialize
round-trip could normalize two distinct inputs to one term.

OFFLINE + SYNTHETIC ONLY.
"""
from __future__ import annotations

import itertools
import sys

sys.path.insert(0, "/Users/darrenzal/projects/RegenAI/scratch/jc-koi-canon-spike")

import adapter
import yaml


def load_fixture() -> dict:
    with open("/Users/darrenzal/projects/RegenAI/scratch/jc-koi-canon-spike/fixture.yaml") as fh:
        return yaml.safe_load(fh)


def fp_for_statement(s: str) -> str:
    fx = load_fixture()
    fx["claim_candidate"]["statement"] = s
    return adapter.admit(fx).claim_fingerprint


# Distinct statements including control-char edge cases and near-duplicates.
CTRL = {
    "raw_FF": "a\x0cb",       # form feed
    "raw_VT": "a\x0bb",       # vertical tab
    "raw_NUL": "a\x00b",      # null
    "raw_BS": "a\x08b",       # backspace
    "raw_CR": "a\rb",         # bare CR
    "raw_LF": "a\nb",         # bare LF
    "raw_CRLF": "a\r\nb",     # CRLF
    "raw_TAB": "a\tb",        # tab (escaped by _nt_literal)
    "esc_backslash_n": "a\\nb",   # literal backslash + n
    "esc_backslash_r": "a\\rb",
    "esc_backslash_t": "a\\tb",
    "esc_backslash_backslash": "a\\\\b",
    "plain_anb": "anb",
    "plain_ab": "ab",
    "trailing_sp": "ab ",
    "leading_sp": " ab",
}

seen: dict[str, str] = {}
collisions: list[tuple[str, str, str]] = []
rejected: list[str] = []

for label, s in CTRL.items():
    try:
        fp = fp_for_statement(s)
    except Exception as exc:
        print(f"[reject] {label:26} {type(exc).__name__}: {str(exc)[:50]}")
        rejected.append(label)
        continue
    print(f"[ok    ] {label:26} {repr(s):22} fp={fp[:16]}...")
    if fp in seen and seen[fp] != s:
        collisions.append((label, repr(seen[fp]), repr(s)))
    seen[fp] = s

# Broader fuzz: 400 distinct short strings.
alphabet = "ab \\\"\t\n."  # includes escape-relevant chars
count = 0
for combo in itertools.product(alphabet, repeat=3):
    s = "".join(combo)
    count += 1
    try:
        fp = fp_for_statement(s)
    except Exception:
        rejected.append(repr(s))
        continue
    if fp in seen and seen[fp] != s:
        collisions.append(("fuzz", repr(seen[fp]), repr(s)))
    seen[fp] = s

print("=" * 70)
print(f"distinct statements hashed : {len(seen)}")
print(f"fuzz combos tried          : {count}")
print(f"rejections                 : {len(rejected)}")
print(f"COLLISIONS                 : {len(collisions)}")
for c in collisions:
    print("  COLLISION:", c)
sys.exit(1 if collisions else 0)
