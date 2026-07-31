"""
The 9 execution steps from the spike spec (L94-104), in order, emitting the
result record from the spec template (L122-138).

OFFLINE + SYNTHETIC ONLY. No production DB, no ledger, no live claims API.
"""

from __future__ import annotations

import yaml

import adapter
from adapter import (
    AdmissionError,
    CANON_LABEL,
    admit,
    build_substance_graph,
    canonicalize,
    fingerprint,
)


def load_fixture() -> dict:
    with open("fixture.yaml") as fh:
        return yaml.safe_load(fh)


def hr(n: int, title: str) -> None:
    print(f"\n{'=' * 74}\nSTEP {n}: {title}\n{'=' * 74}")


def main() -> None:
    print("JC <-> KOI CANONICAL-CLAIM COMPATIBILITY SPIKE")
    print(f"\nPROFILE: {CANON_LABEL}")

    # ---- 1 -----------------------------------------------------------------
    hr(1, "Freeze the fixture")
    fx = load_fixture()
    print(f"fixture_id : {fx['fixture_id']}  (synthetic; loaded from fixture.yaml)")
    print(yaml.safe_dump(fx, sort_keys=False).rstrip())

    # ---- 2 -----------------------------------------------------------------
    hr(2, "Encode the candidate's ASSERTED CONTENT as RDF")
    candidate = fx["claim_candidate"]
    substance = {k: candidate[k] for k in adapter.SUBSTANCE_FIELDS}
    raw_graph = build_substance_graph(substance)
    print(f"substance fields (allowlist): {list(adapter.SUBSTANCE_FIELDS)}")
    print(f"EXCLUDED as audit/operational: {list(adapter.AUDIT_FIELDS)}\n")
    print("pre-canonical N-Quads (claim subject is a BLANK NODE -- see adapter docstring):")
    print(raw_graph)

    # ---- 3 -----------------------------------------------------------------
    hr(3, "Canonicalize the RDF dataset (RDFC-1.0)")
    canon = canonicalize(raw_graph)
    print("canonical N-Quads:")
    print(canon.decode("utf-8"), end="")
    print(f"\nbytes: {len(canon)}")

    # ---- 4 -----------------------------------------------------------------
    hr(4, "Derive the Claim IRI and fingerprint")
    fp = fingerprint(canon)
    iri = adapter.derive_claim_iri(fp)
    print(f"claim_fingerprint : {fp}")
    print(f"                    ^ SHA-256 over the canonical N-Quads UTF-8 bytes,")
    print(f"                      computed by us -- NOT the RDFC-1.0 internal hash.")
    print(f"claim_iri         : {iri}")
    print(f"                    ^ function of SUBSTANCE ONLY. No claim_rid, no data_iri,")
    print(f"                      no DB id, no insertion timestamp.")

    # ---- 5 -----------------------------------------------------------------
    hr(5, "Construct the JC-domain Claim (assertor + asserted_at provenance)")
    claim = admit(fx)
    print(f"admitted          : verification_state='{claim.audit['verification_state']}'")
    print(f"claim_iri         : {claim.claim_iri}")
    print(f"claim_fingerprint : {claim.claim_fingerprint}")
    print(f"assertor          : {claim.assertor}")
    print(f"asserted_at       : {claim.asserted_at}  (canonical instant, NOT API creation time)")
    assert claim.claim_fingerprint == fp and claim.claim_iri == iri

    # ---- 6 -----------------------------------------------------------------
    hr(6, "Project the admitted Claim to a graph view (L0, rebuildable)")
    projection = claim.project_to_graph()
    print(projection, end="")
    print("\n^ DERIVED projection. Rebuildable from the accepted Claim; not authoritative.")

    # ---- 7 -----------------------------------------------------------------
    hr(7, "Query the projection for asserted content; query KOI-side records separately")
    print("--- A. asserted content (from the canonical Claim / projection) ---")
    for k in adapter.SUBSTANCE_FIELDS:
        print(f"  {k:<28} = {claim.substance[k]}")

    print("\n--- B. KOI-side audit records (SEPARATE; never fingerprinted) ---")
    print("  evidence:")
    for uri in claim.audit["evidence_uris"]:
        print(f"    - {uri}")
    print(f"  review/validation:")
    print(f"    reviewer_uri              = {claim.audit['reviewer_uri']}")
    print(f"    verification_state        = {claim.audit['verification_state']}")
    print(f"  provenance:")
    print(f"    output_record_rid         = {claim.audit['output_record_rid']}")
    print(f"    source_document           = {claim.audit['source_document']}")
    print(f"  anchor / local identifiers:")
    print(f"    claim_rid                 = {claim.audit['claim_rid']}")
    print(f"    data_iri                  = {claim.audit['data_iri']}")
    print(f"    legacy BLAKE2b anchor     = {claim.audit['legacy_blake2b_anchor_hash']}")
    print(f"  operational timestamps:")
    print(f"    db_created_at             = {claim.audit['db_created_at']}")
    print(f"    api_request_at            = {claim.audit['api_request_at']}")
    print("\n  ^ integrity commitment (anchor hash) != validation judgment "
          "(reviewer attestation).")
    print("    They are queried on DIFFERENT surfaces and are not collapsed into one status.")

    # ---- 8 -----------------------------------------------------------------
    hr(8, "Run the same input twice and compare Claim IRI / fingerprint BYTES")
    again = admit(load_fixture())
    print(f"run 1 canonical bytes : {claim.canonical_nquads!r}")
    print(f"run 2 canonical bytes : {again.canonical_nquads!r}")
    print(f"\nbytes identical       : {claim.canonical_nquads == again.canonical_nquads}")
    print(f"fingerprint identical : {claim.claim_fingerprint == again.claim_fingerprint}")
    print(f"IRI identical         : {claim.claim_iri == again.claim_iri}")
    determinism = (
        claim.canonical_nquads == again.canonical_nquads
        and claim.claim_fingerprint == again.claim_fingerprint
        and claim.claim_iri == again.claim_iri
    )

    # ---- 9 -----------------------------------------------------------------
    hr(9, "Change ONE asserted-content term; separately change ONLY an audit field")
    print(f"baseline fingerprint : {claim.claim_fingerprint}\n")

    print("--- 9a. SEMANTIC mutation (one asserted-content term at a time) ---")
    semantic_ok = True
    for label, fieldname, newvalue in [
        ("statement", "statement", "Fixture assertion for cross-engine canonicalization testing!"),
        ("assertor", "claimant_uri", "https://example.org/entities/assertor-002"),
        ("asserted_at", "asserted_at", "2026-07-14T00:00:01Z"),
    ]:
        m = load_fixture()
        m["claim_candidate"][fieldname] = newvalue
        mc = admit(m)
        changed = mc.claim_fingerprint != claim.claim_fingerprint
        semantic_ok &= changed
        print(f"  {label:<12} -> {mc.claim_fingerprint}  CHANGED={changed}")

    print("\n--- 9b. AUDIT-ONLY mutation (evidence / output_record_rid / DB timestamp) ---")
    m = load_fixture()
    m["source"]["evidence_uris"] = ["urn:koi:fixture:evidence-999", "urn:koi:fixture:evidence-998"]
    m["source"]["output_record_rid"] = "urn:koi:fixture:output-record-CHANGED"
    m["db_created_at"] = "2099-01-01T00:00:00.000Z"
    ac = admit(m)
    audit_ok = (
        ac.canonical_nquads == claim.canonical_nquads
        and ac.claim_fingerprint == claim.claim_fingerprint
        and ac.claim_iri == claim.claim_iri
    )
    print(f"  audit-only   -> {ac.claim_fingerprint}  CHANGED="
          f"{ac.claim_fingerprint != claim.claim_fingerprint}")
    print(f"  canonical bytes identical : {ac.canonical_nquads == claim.canonical_nquads}")
    print(f"  claim IRI identical       : {ac.claim_iri == claim.claim_iri}")
    print(f"  legacy BLAKE2b moved      : "
          f"{ac.audit['legacy_blake2b_anchor_hash'] != claim.audit['legacy_blake2b_anchor_hash']}")
    print("    ^ it did NOT move -- because the legacy hash is computed over "
          "claim_candidate ONLY,")
    print("      which does not carry source/evidence/DB-timestamp fields. See 9c for the")
    print("      mutation that actually separates the two hash functions.")

    print("\n--- 9c. The sharp contrast: an audit field INSIDE claim_candidate (reviewer_uri) ---")
    m = load_fixture()
    m["claim_candidate"]["reviewer_uri"] = "https://example.org/entities/reviewer-999"
    rc = admit(m)
    print(f"  semantic fingerprint : {rc.claim_fingerprint}")
    print(f"    moved = {rc.claim_fingerprint != claim.claim_fingerprint}"
          "   <- reviewer identity is NOT asserted content")
    print(f"  legacy BLAKE2b       : {rc.audit['legacy_blake2b_anchor_hash']}")
    print(f"    moved = "
          f"{rc.audit['legacy_blake2b_anchor_hash'] != claim.audit['legacy_blake2b_anchor_hash']}"
          "    <- the legacy hash DOES bind reviewer identity")
    print("\n  => The two hashes are demonstrably DIFFERENT FUNCTIONS over different inputs.")
    print("     KOI's BLAKE2b anchor hash binds who reviewed a claim; the semantic")
    print("     fingerprint binds only what was asserted. Conflating them would make the")
    print("     canonical identity of a claim change when a reviewer is reassigned.")
    reviewer_isolated = rc.claim_fingerprint == claim.claim_fingerprint
    audit_ok = audit_ok and reviewer_isolated

    # ---- admission boundary (spec's 4th check; exercised here too) ----------
    hr(0, "Admission boundary (unreviewed candidate must NOT enter the adapter)")
    unreviewed = load_fixture()
    unreviewed["claim_candidate"]["verification_state"] = "ai_extracted"
    try:
        admit(unreviewed)
        admission_ok = False
        print("  ai_extracted -> ADMITTED  <-- LEAK, admission boundary is broken")
    except AdmissionError as exc:
        admission_ok = True
        print(f"  ai_extracted -> refused: {exc}")

    # ---- result record -----------------------------------------------------
    print(f"\n{'=' * 74}\nRESULT RECORD\n{'=' * 74}")
    record = {
        "profile": {
            "rdf_canonicalization": "RDFC-1.0 (pyoxigraph CanonicalizationAlgorithm.RDFC_1_0 0.5.9)",
            "claim_iri_policy": "deterministic; derived from claim SUBSTANCE only "
                                "(assertor + subject + statement + claim_type + asserted_at)",
            "digest_suite": "SHA-256 over canonical N-Quads UTF-8 bytes, lowercase hex",
            "canonicalization_label": CANON_LABEL,
        },
        "admission_rule": 'reviewer-confirmed (verification_state == "peer_reviewed")',
        "fixture_id": fx["fixture_id"],
        "claim_iri": claim.claim_iri,
        "claim_fingerprint": claim.claim_fingerprint,
        "canonical_nquads": claim.canonical_nquads.decode("utf-8"),
        "canonical_bytes": len(claim.canonical_nquads),
        "legacy_koi_anchor_hash_blake2b_256": claim.audit["legacy_blake2b_anchor_hash"],
        "checks": {
            "determinism": "pass" if determinism else "fail",
            "semantic_sensitivity": "pass" if semantic_ok else "fail",
            "audit_isolation": "pass" if audit_ok else "fail",
            "admission_boundary": "pass" if admission_ok else "fail",
        },
        "notes": [
            "Synthetic fixture. No production DB, ledger, or claims-API access.",
            "Legacy BLAKE2b-256 anchor hash retained as a SEPARATE value; never "
            "conflated with the semantic fingerprint.",
            "See test_spike.py for all 7 acceptance criteria.",
        ],
    }
    print(yaml.safe_dump(record, sort_keys=False, width=100).rstrip())

    with open("result-record.yaml", "w") as fh:
        yaml.safe_dump(record, fh, sort_keys=False, width=100)
    print("\nwritten: result-record.yaml")

    with open("canonical.nq", "wb") as fh:
        fh.write(claim.canonical_nquads)
    print("written: canonical.nq")


if __name__ == "__main__":
    main()
