"""
ADVERSARIAL SEMANTIC-SENSITIVITY ATTACK against the JC<->KOI adapter.

Goal: find a SEMANTIC change (asserted content / assertor / subject / claim_type /
asserted_at) that does NOT change the claim_fingerprint -> a collision = real defect.

Everything runs through the REAL adapter (admit -> build_substance_graph ->
_nt_literal -> canonicalize -> fingerprint). Prints the real bytes/hashes.

OFFLINE + SYNTHETIC ONLY. Loads the same synthetic fixture; no network, no DB.
"""
from __future__ import annotations

import copy
import sys
import unicodedata

sys.path.insert(0, "/Users/darrenzal/projects/RegenAI/scratch/jc-koi-canon-spike")

import adapter
import yaml


def load_fixture() -> dict:
    with open("/Users/darrenzal/projects/RegenAI/scratch/jc-koi-canon-spike/fixture.yaml") as fh:
        return yaml.safe_load(fh)


BASE = adapter.admit(load_fixture())
BASE_FP = BASE.claim_fingerprint
print(f"BASELINE fingerprint : {BASE_FP}")
print(f"BASELINE canon bytes : {len(BASE.canonical_nquads)}")
print("=" * 78)

collisions: list[tuple[str, str, str]] = []
errors: list[tuple[str, str]] = []


def fp_of(fx: dict) -> str:
    return adapter.admit(fx).claim_fingerprint


def attack(label: str, field: str, newvalue, *, container="claim_candidate") -> None:
    """Mutate one substance field; a collision (fp == BASE_FP) is a DEFECT."""
    fx = load_fixture()
    fx[container][field] = newvalue
    try:
        fp = fp_of(fx)
    except Exception as exc:  # rejection is fine; it is not a collision
        print(f"[reject ] {label:52} {type(exc).__name__}: {str(exc)[:40]}")
        errors.append((label, f"{type(exc).__name__}: {exc}"))
        return
    collided = fp == BASE_FP
    tag = "COLLISION!!" if collided else "distinct   "
    print(f"[{tag}] {label:52} fp={fp}")
    if collided:
        collisions.append((label, field, repr(newvalue)))


ORIG_STMT = "Fixture assertion for cross-engine canonicalization testing."

# --- 1. Unicode normalization on statement (over-normalization erases a diff?) ---
attack("statement NFD(café) vs baseline (ascii, control)", "statement",
       unicodedata.normalize("NFD", ORIG_STMT))  # ascii unchanged; control probe
attack("statement NFC 'café'", "statement", unicodedata.normalize("NFC", "café"))
attack("statement NFD 'café' (should differ from NFC above, not baseline)",
       "statement", unicodedata.normalize("NFD", "café"))

# --- 2. Whitespace variants on statement ---
attack("statement + trailing space", "statement", ORIG_STMT + " ")
attack("statement + leading space", "statement", " " + ORIG_STMT)
attack("statement with double space", "statement",
       ORIG_STMT.replace("for cross", "for  cross"))
attack("statement tab-vs-space", "statement", ORIG_STMT.replace(" ", "\t", 1))

# --- 3. claim_type case / whitespace ---
attack("claim_type 'Ecological' (case)", "claim_type", "Ecological")
attack("claim_type 'ecological ' (trailing sp)", "claim_type", "ecological ")
attack("claim_type 'ECOLOGICAL'", "claim_type", "ECOLOGICAL")

# --- 4. IRI variants on claimant_uri / about_uri ---
attack("claimant HTTPS scheme case", "claimant_uri",
       "HTTPS://example.org/entities/assertor-001")
attack("claimant :443 default port", "claimant_uri",
       "https://example.org:443/entities/assertor-001")
attack("claimant dot-segment", "claimant_uri",
       "https://example.org/x/../entities/assertor-001")
attack("claimant trailing slash", "claimant_uri",
       "https://example.org/entities/assertor-001/")
attack("about %7E vs ~", "about_uri", "https://example.org/entities/subject-001%7E")
attack("about host case", "about_uri", "https://Example.ORG/entities/subject-001")

# --- 5. asserted_at timezone-equivalent-but-textually-different ---
attack("asserted_at Z -> +00:00 (same instant)", "asserted_at",
       "2026-07-14T00:00:00+00:00")
attack("asserted_at Z -> .000Z (same instant)", "asserted_at",
       "2026-07-14T00:00:00.000Z")
attack("asserted_at Z -> -07:00 (same instant, diff wallclock)", "asserted_at",
       "2026-07-13T17:00:00-07:00")

# --- 6. N-Triples injection: try to make a different statement canonicalize
#         to the SAME graph as baseline by escaping out of the literal ---
attack("statement injection: close-quote + fake predicate", "statement",
       ORIG_STMT + '" .\n_:claim <https://example.org/ns/claim#statement> "'
       + ORIG_STMT)
attack("statement injection: swap to baseline via crafted escape", "statement",
       'Fixture assertion for cross-engine canonicalization testing.\\')

# --- 7. Sanity: a genuinely different statement MUST NOT collide ---
attack("statement genuinely different (control)", "statement",
       "A completely different ecological assertion.")

print("=" * 78)
print(f"COLLISIONS FOUND: {len(collisions)}")
for c in collisions:
    print("  ", c)
print(f"(rejections: {len(errors)} — rejections are not collisions)")
sys.exit(1 if collisions else 0)
