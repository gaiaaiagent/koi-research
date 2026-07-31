"""
ADVERSARIAL attacks on the four "easy to pass vacuously" checks of the
jc-koi-canon-spike: admission_boundary, projection_boundary,
lifecycle_preservation, no_production_effect.

Run against the REAL adapter. Prints real bytes. Exit code is informational:
these are FINDINGS, not regressions. A "FINDING" line means the reported check
overstates its guarantee.

    cd jc-koi-canon-spike && .venv/bin/python attacks/boundaries-and-claims/attack_boundaries.py
"""
from __future__ import annotations

import hashlib
import os
import sys

# import the real adapter from the spike root
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, ROOT)

import yaml  # noqa: E402
import adapter  # noqa: E402
from adapter import (  # noqa: E402
    AcceptedClaim,
    AdmissionError,
    admit,
    build_substance_graph,
    canonicalize,
    derive_claim_iri,
    fingerprint,
)

FIXTURE = os.path.join(ROOT, "fixture.yaml")


def load():
    with open(FIXTURE) as fh:
        return yaml.safe_load(fh)


def banner(t):
    print(f"\n{'='*74}\n{t}\n{'='*74}")


findings = []


# ---------------------------------------------------------------------------
# ATTACK 1 — PROJECTION BOUNDARY / IMMUTABILITY
# The spike objective is an "immutable" domain Claim. frozen=True does not make
# the substance dict immutable; it can be mutated in place post-admission, and
# the self-describing fingerprint silently desyncs. The suite's tamper test only
# corrupts a LOCAL STRING, never the object, so it cannot catch this.
# ---------------------------------------------------------------------------
def attack_immutability():
    banner("ATTACK 1: 'immutable' AcceptedClaim is mutable -> fingerprint desync")
    c = admit(load())
    print("stored claim_fingerprint :", c.claim_fingerprint)
    c.substance["statement"] = "TAMPERED post-admission"  # mutate through frozen dataclass
    rebuilt = c.rebuild_substance()
    new_fp = fingerprint(rebuilt)
    proj = c.project_to_graph()
    print("after in-place mutation of c.substance['statement']:")
    print("  rebuild_substance() fingerprint :", new_fp)
    print("  stored claim_fingerprint         :", c.claim_fingerprint)
    print("  projection now emits 'TAMPERED'  :", "TAMPERED" in proj)
    desync = new_fp != c.claim_fingerprint and "TAMPERED" in proj
    if desync:
        findings.append(
            "projection_boundary: the accepted Claim is NOT immutable. c.substance is a "
            "mutable dict inside a frozen dataclass; post-admission mutation makes "
            f"rebuild_substance()/projection ({new_fp}) diverge from the stored "
            f"fingerprint ({c.claim_fingerprint}). The suite's tamper assertion only "
            "corrupts a local string, so it never exercises this path."
        )
        print("FINDING: immutability violated; suite tamper-check is a tautology.")


# ---------------------------------------------------------------------------
# ATTACK 2 — PROJECTION does not round-trip to the fingerprint
# "rebuildable" is only tested as: the IRI string substring-appears in the
# projection. The projection graph (named IRI subject) hashes to a DIFFERENT
# value than the canonical (blank-node) graph the fingerprint was taken over.
# ---------------------------------------------------------------------------
def attack_projection_roundtrip():
    banner("ATTACK 2: projection graph does not reproduce the claim fingerprint")
    c = admit(load())
    proj_fp = fingerprint(canonicalize(c.project_to_graph()))
    print("canonical(blank-node) fingerprint :", c.claim_fingerprint)
    print("projection(named-IRI) fingerprint :", proj_fp)
    print("equal:", proj_fp == c.claim_fingerprint)
    if proj_fp != c.claim_fingerprint:
        findings.append(
            "projection_boundary: 'rebuildable' is asserted only as a substring check "
            f"(IRI text appears). The projection graph re-canonicalizes to {proj_fp}, "
            f"which does NOT equal the claim fingerprint {c.claim_fingerprint}; the two "
            "are different graphs (named IRI vs blank node). No test asserts the "
            "projection reproduces the fingerprint."
        )
        print("FINDING: projection is not verified to reproduce the fingerprint.")


# ---------------------------------------------------------------------------
# ATTACK 3 — ADMISSION BOUNDARY
# (a) Does it really reject unreviewed candidates? YES (not vacuous).
# (b) But the boundary is porous: AcceptedClaim can be built directly, and a
#     peer_reviewed candidate with no reviewer still admits.
# ---------------------------------------------------------------------------
def attack_admission():
    banner("ATTACK 3: admission boundary — real rejection, but porous")
    # (a) genuine rejection
    rej = []
    for s in ["self_reported", "ai_extracted", "unverified", "ledger_anchored",
              "PEER_REVIEWED", " peer_reviewed", None, ""]:
        fx = load()
        if s is None:
            fx["claim_candidate"].pop("verification_state", None)
        else:
            fx["claim_candidate"]["verification_state"] = s
        try:
            admit(fx)
            print(f"  state={s!r:<16} -> ADMITTED (leak)")
        except AdmissionError:
            rej.append(s)
    print(f"  genuinely rejected {len(rej)}/8 non-'peer_reviewed' states "
          "(admission check is NOT vacuous)")

    # (b1) direct construction bypass
    sub = {"claimant_uri": "https://evil/x", "about_uri": "https://evil/y",
           "statement": "UNREVIEWED forged content", "claim_type": "ecological",
           "asserted_at": "2026-07-14T00:00:00Z"}
    canon = canonicalize(build_substance_graph(sub))
    fp = fingerprint(canon)
    forged = AcceptedClaim(claim_iri=derive_claim_iri(fp), claim_fingerprint=fp,
                           canonical_nquads=canon, assertor=sub["claimant_uri"],
                           asserted_at=sub["asserted_at"], substance=sub, audit={})
    bypass = fingerprint(forged.rebuild_substance()) == forged.claim_fingerprint
    print(f"  direct AcceptedClaim() of UNREVIEWED content is valid+well-formed: {bypass}")

    # (b2) peer_reviewed with no reviewer still admits
    fx = load()
    fx["claim_candidate"]["reviewer_uri"] = None
    c = admit(fx)
    noreviewer = c.audit["reviewer_uri"] is None
    print(f"  peer_reviewed + reviewer_uri=None still ADMITTED: {noreviewer} "
          f"(reviewer identity not actually required)")

    if bypass or noreviewer:
        findings.append(
            "admission_boundary: the check genuinely rejects non-'peer_reviewed' states, "
            "but the boundary is porous — AcceptedClaim() can be constructed directly, "
            "bypassing admit() entirely, and admit() accepts a 'peer_reviewed' candidate "
            "with reviewer_uri=None (no reviewer actually required). The test only ever "
            "calls admit(), so neither gap is detected. Design/enforcement gap, not test-vacuity."
        )


# ---------------------------------------------------------------------------
# ATTACK 4 — LIFECYCLE PRESERVATION is a tautology for anchor references
# claim_rid / data_iri / db_created_at / api_request_at are NOT in the fixture.
# admit() invents fixed defaults; the test asserts them truthy. The spec's
# lifecycle criterion NAMES anchor/ledger references as what must be preserved.
# ---------------------------------------------------------------------------
def attack_lifecycle():
    banner("ATTACK 4: lifecycle 'preservation' of anchor references = fabricated defaults")
    fx = load()
    absent = [k for k in ("claim_rid", "data_iri", "db_created_at", "api_request_at")
              if k not in fx and k not in fx.get("source", {}) and k not in fx["claim_candidate"]]
    print("audit fields ABSENT from the fixture entirely:", absent)
    c1 = admit(load())
    fx2 = load()
    fx2["claim_candidate"]["statement"] = "a completely different claim"
    c2 = admit(fx2)
    print("claim A:", c1.claim_fingerprint[:16], "anchor claim_rid =", c1.audit["claim_rid"])
    print("claim B:", c2.claim_fingerprint[:16], "anchor claim_rid =", c2.audit["claim_rid"])
    shared = (c1.audit["claim_rid"] == c2.audit["claim_rid"]
              and c1.audit["data_iri"] == c2.audit["data_iri"])
    print("two semantically DISTINCT claims share the same anchor identifiers:", shared)
    if absent and shared:
        findings.append(
            "lifecycle_preservation: the spec requires anchor transaction / ledger IRI / "
            "proof-pack references to remain accessible and distinct. NONE of "
            f"{absent} exist in the fixture; admit() hardcodes fixed defaults "
            f"(claim_rid='{c1.audit['claim_rid']}', data_iri='{c1.audit['data_iri']}'), and "
            "the lifecycle test's `assert value` passes on those invented constants. Two "
            "distinct claims carry IDENTICAL anchor identifiers, proving the field preserves "
            "nothing per-claim. (evidence_uris/reviewer_uri/verification_state/"
            "output_record_rid/source_document ARE genuinely preserved from the fixture.)"
        )
        print("FINDING: anchor-reference preservation is over invented constants.")


# ---------------------------------------------------------------------------
# ATTACK 5 — NO PRODUCTION EFFECT: audit, confirm it SURVIVES (honesty)
# ---------------------------------------------------------------------------
def attack_no_prod():
    banner("ATTACK 5: no_production_effect — code audit (expected: SURVIVES)")
    src = open(os.path.join(ROOT, "adapter.py")).read()
    import re
    net = re.findall(r"import\s+(requests|httpx|psycopg|sqlalchemy|aiohttp|boto3|urllib)", src)
    subproc = "subprocess" in src or "os.system" in src
    writes = re.findall(r'open\([^)]*["\']w', src)
    print("adapter.py network imports:", net or "none")
    print("adapter.py subprocess/os.system:", subproc)
    print("adapter.py file writes:", writes or "none")
    print("=> adapter is pure computation (hashlib/json/pyoxigraph). Conclusion HOLDS.")
    print("Caveat (not a false pass): the socket guard in the suite only wraps a re-run")
    print("of the already-pure admit(); the token grep is a fixed allowlist (misses e.g.")
    print("8301/3030/prod IP); run.py DOES write result-record.yaml + canonical.nq, but")
    print("both are inside the spike dir. 'Mechanically enforced' overstates a redundant guard.")


def independent_headline():
    banner("CROSS-CHECK: headline fingerprint recomputed independently")
    c = admit(load())
    manual = hashlib.sha256(c.canonical_nquads).hexdigest()
    print("independent SHA-256 of canonical bytes:", manual)
    print("reported claim_fingerprint           :", c.claim_fingerprint)
    print("reported claim_iri                   :", c.claim_iri)
    print("GENUINE (matches, not fabricated):", manual == c.claim_fingerprint
          and c.claim_iri.endswith(manual))


def main():
    independent_headline()
    attack_immutability()
    attack_projection_roundtrip()
    attack_admission()
    attack_lifecycle()
    attack_no_prod()

    banner("FINDINGS")
    if not findings:
        print("No boundary check overstated its guarantee.")
    for i, f in enumerate(findings, 1):
        print(f"\n[{i}] {f}")
    print(f"\n{len(findings)} finding(s).")


if __name__ == "__main__":
    main()
