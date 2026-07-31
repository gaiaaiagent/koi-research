"""
ADVERSARIAL ATTACK — audit-isolation lens.

Goal: BREAK the claim "mutating ONLY audit/operational metadata leaves the
fingerprint byte-identical." Two attack directions:

  DIRECTION 1 (positive leak): find an audit/operational field whose mutation
  DOES move the semantic fingerprint. If any does, audit_isolation is a false pass.

  DIRECTION 2 (inverse trap): the check may pass simply because the adapter
  IGNORES too much. If a genuinely SEMANTIC field is dropped from the substance
  set, two materially-different claims collide onto one fingerprint / one Claim
  IRI. Grounded against the REAL koi-processor ClaimCreateRequest, which carries
  metadata{quantity,unit,dates,SDGs,methodology} and credit_class_id.

Everything is RUN against the real adapter. Every finding carries real bytes.
OFFLINE + SYNTHETIC ONLY.
"""

from __future__ import annotations

import copy
import sys

# import the real adapter from the spike root
sys.path.insert(0, "/Users/darrenzal/projects/RegenAI/scratch/jc-koi-canon-spike")

import yaml

import adapter
from adapter import admit


FIXTURE_PATH = "/Users/darrenzal/projects/RegenAI/scratch/jc-koi-canon-spike/fixture.yaml"


def load_fixture() -> dict:
    with open(FIXTURE_PATH) as fh:
        return yaml.safe_load(fh)


def hr(title: str) -> None:
    print(f"\n{'=' * 78}\n{title}\n{'=' * 78}")


def main() -> int:
    base = admit(load_fixture())
    BASE_FP = base.claim_fingerprint
    BASE_IRI = base.claim_iri
    BASE_LEGACY = base.audit["legacy_blake2b_anchor_hash"]
    print(f"BASELINE fingerprint : {BASE_FP}")
    print(f"BASELINE claim_iri   : {BASE_IRI}")
    print(f"BASELINE legacy hash : {BASE_LEGACY}")

    findings: list[str] = []

    # ------------------------------------------------------------------ #
    hr("DIRECTION 1 — try to make an AUDIT field leak into the fingerprint")
    # Exhaustively mutate every declared audit field, plus adversarial variants:
    # nested collisions, type confusion, and audit values that duplicate the
    # subject IRI (to try to trick the substring leak-guard).
    d1_moves = []

    def probe(label, mutate):
        fx = load_fixture()
        mutate(fx)
        try:
            m = admit(fx)
        except Exception as exc:  # noqa
            print(f"  {label:<52} -> RAISED {type(exc).__name__}: {exc}")
            return None
        moved = m.claim_fingerprint != BASE_FP
        print(f"  {label:<52} fp_moved={moved}  legacy_moved={m.audit['legacy_blake2b_anchor_hash']!=BASE_LEGACY}")
        if moved:
            d1_moves.append(label)
        return m

    probe("source.evidence_uris -> [999,998]",
          lambda fx: fx["source"].__setitem__("evidence_uris", ["urn:koi:fixture:evidence-999"]))
    probe("source.output_record_rid -> CHANGED",
          lambda fx: fx["source"].__setitem__("output_record_rid", "urn:koi:fixture:or-CHANGED"))
    probe("source.source_document -> CHANGED",
          lambda fx: fx["source"].__setitem__("source_document", "urn:koi:fixture:doc-CHANGED"))
    probe("claim_candidate.reviewer_uri -> reviewer-999",
          lambda fx: fx["claim_candidate"].__setitem__("reviewer_uri", "https://example.org/entities/reviewer-999"))
    probe("top.claim_rid -> CHANGED",
          lambda fx: fx.__setitem__("claim_rid", "orn:koi.claim:CHANGED"))
    probe("top.data_iri -> CHANGED",
          lambda fx: fx.__setitem__("data_iri", "urn:koi:fixture:data-CHANGED"))
    probe("top.db_created_at -> 2099",
          lambda fx: fx.__setitem__("db_created_at", "2099-01-01T00:00:00Z"))
    probe("top.api_request_at -> 2099",
          lambda fx: fx.__setitem__("api_request_at", "2099-01-01T00:00:00Z"))
    # adversarial: audit value == subject IRI, to test the substring leak-guard
    probe("evidence_uris contains the SUBJECT iri (guard trick)",
          lambda fx: fx["source"].__setitem__("evidence_uris", ["https://example.org/entities/subject-001"]))
    # adversarial: try to smuggle a substance-named key inside source
    probe("source.statement = 'HACK' (wrong container)",
          lambda fx: fx["source"].__setitem__("statement", "HACK"))
    # adversarial: verification_state is audit but also the admission gate;
    # mutate to another admitted-equivalent? there is none, so keep peer_reviewed
    # and add a stray extra state field
    probe("claim_candidate.verification_notes = '...' (extra audit)",
          lambda fx: fx["claim_candidate"].__setitem__("verification_notes", "looks good"))

    if d1_moves:
        findings.append(f"DIRECTION 1 LEAK: audit field(s) moved the fingerprint: {d1_moves}")
        print(f"\n  !! LEAK: {d1_moves}")
    else:
        print("\n  DIRECTION 1: no audit field moved the fingerprint (allowlist holds structurally).")

    # ------------------------------------------------------------------ #
    hr("DIRECTION 2 — INVERSE TRAP: is a genuinely SEMANTIC field being dropped?")
    print("Grounded against koi-processor ClaimCreateRequest (real model):")
    print("  metadata: Dict  # 'Extensible fields: quantity, unit, dates, SDGs, methodology'")
    print("  credit_class_id: Optional[str]  # 'Regen credit class ID (e.g., C04, C05)'")
    print("  ai_confidence: Optional[float]")
    print("None of these are in adapter.SUBSTANCE_FIELDS. The adapter reads ONLY:")
    print(f"  {list(adapter.SUBSTANCE_FIELDS)}")
    print("So it silently ignores them. Below: two MATERIALLY DIFFERENT real claims\n"
          "that collide onto ONE fingerprint / ONE Claim IRI.\n")

    def collide(label, keypath, val_a, val_b):
        """keypath is a list into the record dict. Returns True if the two
        distinct claims produce the SAME fingerprint (a collision)."""
        fa = load_fixture()
        fb = load_fixture()

        def setp(fx, kp, v):
            d = fx
            for k in kp[:-1]:
                d = d.setdefault(k, {})
            d[kp[-1]] = v

        setp(fa, keypath, val_a)
        setp(fb, keypath, val_b)
        ca, cb = admit(fa), admit(fb)
        same_fp = ca.claim_fingerprint == cb.claim_fingerprint
        same_iri = ca.claim_iri == cb.claim_iri
        legacy_diff = ca.audit["legacy_blake2b_anchor_hash"] != cb.audit["legacy_blake2b_anchor_hash"]
        print(f"  {label}")
        print(f"    A ({val_a!r:>40})  fp={ca.claim_fingerprint}")
        print(f"    B ({val_b!r:>40})  fp={cb.claim_fingerprint}")
        print(f"    same_fingerprint={same_fp}  same_claim_iri={same_iri}  "
              f"legacy_hash_DIFFERS={legacy_diff}")
        if same_fp and same_iri:
            print(f"    >>> COLLISION: two different claims, one canonical identity.")
            if legacy_diff:
                print(f"    >>> and KOI's OWN legacy anchor hash treats them as DISTINCT.")
        print()
        return same_fp and same_iri, legacy_diff

    # 2a. ecological magnitude: quantity 100 t vs 5 t  (metadata dict)
    c_qty, leg_qty = collide(
        "2a. metadata.quantity (ecological magnitude): 100 tonnes vs 5 tonnes",
        ["claim_candidate", "metadata"],
        {"quantity": 100, "unit": "tCO2e"},
        {"quantity": 5, "unit": "tCO2e"},
    )
    if c_qty:
        findings.append(
            "INVERSE TRAP 2a: claims differing only in metadata.quantity "
            "(100 vs 5 tCO2e) collide onto one fingerprint/IRI"
            + ("; KOI's legacy anchor hash treats them as distinct" if leg_qty else "")
        )

    # 2b. credit_class_id: C04 vs C05
    c_cc, leg_cc = collide(
        "2b. credit_class_id: C04 vs C05 (different Regen credit methodology)",
        ["claim_candidate", "credit_class_id"],
        "C04",
        "C05",
    )
    if c_cc:
        findings.append(
            "INVERSE TRAP 2b: claims differing only in credit_class_id (C04 vs C05) "
            "collide onto one fingerprint/IRI"
            + ("; KOI legacy hash distinct" if leg_cc else "")
        )

    # 2c. unit only: tonnes vs kilograms (same number, 1000x difference)
    c_unit, leg_unit = collide(
        "2c. metadata.unit: tonnes vs kilograms (1000x real-world difference)",
        ["claim_candidate", "metadata"],
        {"quantity": 100, "unit": "tonnes"},
        {"quantity": 100, "unit": "kilograms"},
    )
    if c_unit:
        findings.append(
            "INVERSE TRAP 2c: quantity 100 tonnes vs 100 kilograms collide onto one identity"
        )

    # 2d. polarity/negation carried structurally (a claim vs its negation)
    c_neg, leg_neg = collide(
        "2d. metadata.negated: false vs true (claim vs its negation)",
        ["claim_candidate", "metadata"],
        {"negated": False},
        {"negated": True},
    )
    if c_neg:
        findings.append(
            "INVERSE TRAP 2d: a claim and its structural negation collide onto one identity"
        )

    # ------------------------------------------------------------------ #
    hr("DIRECTION 3 — does the legacy BLAKE2b (KOI's own claim hash) disagree?")
    print("If metadata rides inside claim_candidate, KOI's legacy anchor hash (over the")
    print("WHOLE candidate) MOVES while the JC semantic fingerprint does NOT. That means")
    print("the two engines would DISAGREE on whether two claims are the same claim.\n")
    fa = load_fixture(); fb = load_fixture()
    fa["claim_candidate"]["metadata"] = {"quantity": 100, "unit": "tCO2e"}
    fb["claim_candidate"]["metadata"] = {"quantity": 5, "unit": "tCO2e"}
    ca, cb = admit(fa), admit(fb)
    print(f"  JC semantic fingerprint  A==B : {ca.claim_fingerprint == cb.claim_fingerprint}")
    print(f"  KOI legacy anchor hash   A==B : {ca.audit['legacy_blake2b_anchor_hash'] == cb.audit['legacy_blake2b_anchor_hash']}")
    print(f"    JC:  A={ca.claim_fingerprint}")
    print(f"    JC:  B={cb.claim_fingerprint}")
    print(f"    KOI: A={ca.audit['legacy_blake2b_anchor_hash']}")
    print(f"    KOI: B={cb.audit['legacy_blake2b_anchor_hash']}")
    disagree = (ca.claim_fingerprint == cb.claim_fingerprint) and \
               (ca.audit['legacy_blake2b_anchor_hash'] != cb.audit['legacy_blake2b_anchor_hash'])
    if disagree:
        findings.append(
            "CROSS-ENGINE DISAGREEMENT: JC fingerprint says two claims are identical; "
            "KOI legacy anchor hash says they are distinct. 'without losing existing "
            "semantics' is falsified for any claim carrying metadata."
        )
        print("\n  !! The engines DISAGREE on claim identity.")

    # ------------------------------------------------------------------ #
    hr("VERDICT")
    if findings:
        print("audit_isolation is a FALSE PASS (inverse-trap sense). Findings:")
        for f in findings:
            print(f"  - {f}")
        return 1
    print("No break found; audit_isolation survives.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
