"""
The 7 acceptance criteria as real, runnable assertions.

Stdlib-only harness (no pytest dependency). Prints the REAL bytes for every check.
Exit 0 = all pass. Exit 1 = at least one FAILED (which is a valid, valuable outcome:
a failure here is a genuine finding about the claim model, not a bug to tune away).
"""

from __future__ import annotations

import copy
import io
import socket
import sys
import traceback

import yaml

import adapter
from adapter import (
    AdmissionError,
    CANON_LABEL,
    admit,
    canonicalize,
    fingerprint,
)

RESULTS: dict[str, str] = {}
_LOG = io.StringIO()


def out(msg: str = "") -> None:
    print(msg)
    _LOG.write(msg + "\n")


def load_fixture() -> dict:
    with open("fixture.yaml") as fh:
        return yaml.safe_load(fh)


def check(name: str, fn) -> None:
    out(f"\n{'=' * 72}\nCHECK: {name}\n{'=' * 72}")
    try:
        fn()
        RESULTS[name] = "pass"
        out(f"-> {name}: PASS")
    except Exception:
        RESULTS[name] = "fail"
        out(traceback.format_exc())
        out(f"-> {name}: FAIL")


# ---------------------------------------------------------------------------
# 1. Determinism
# ---------------------------------------------------------------------------

def t_determinism() -> None:
    a = admit(load_fixture())
    b = admit(load_fixture())

    out(f"run 1 IRI  : {a.claim_iri}")
    out(f"run 2 IRI  : {b.claim_iri}")
    out(f"run 1 FP   : {a.claim_fingerprint}")
    out(f"run 2 FP   : {b.claim_fingerprint}")
    out(f"canon bytes: {len(a.canonical_nquads)} / {len(b.canonical_nquads)}")

    assert a.canonical_nquads == b.canonical_nquads, "canonical bytes differ across runs"
    assert a.claim_fingerprint == b.claim_fingerprint, "fingerprint differs across runs"
    assert a.claim_iri == b.claim_iri, "claim IRI differs across runs"

    # Isomorphism: the fingerprint must survive blank-node relabelling + reordering
    # of the SUBSTANCE graph, not just a byte-identical re-read of the fixture.
    scrambled = (
        f'_:zzz9 <{adapter.NS}assertedAt> "2026-07-14T00:00:00Z"'
        f'^^<{adapter.XSD_DATETIME}> .\n'
        f'_:zzz9 <{adapter.NS}claimType> "ecological" .\n'
        f'_:zzz9 <{adapter.NS}statement> '
        f'"Fixture assertion for cross-engine canonicalization testing." .\n'
        f'_:zzz9 <{adapter.NS}hasSubject> <https://example.org/entities/subject-001> .\n'
        f'_:zzz9 <{adapter.NS}hasClaimant> <https://example.org/entities/assertor-001> .\n'
    )
    scrambled_fp = fingerprint(canonicalize(scrambled))
    out(f"scrambled (relabelled _:zzz9 + reordered) FP: {scrambled_fp}")
    assert scrambled_fp == a.claim_fingerprint, "isomorphic substance graph did not converge"


# ---------------------------------------------------------------------------
# 2. Semantic sensitivity  <-- CARRIES SIGNAL
# ---------------------------------------------------------------------------

def t_semantic_sensitivity() -> None:
    base = admit(load_fixture())
    out(f"baseline FP: {base.claim_fingerprint}\n")

    mutations = {
        "statement": ("statement", "Fixture assertion for cross-engine canonicalization testing!"),
        "assertor (claimant_uri)": ("claimant_uri", "https://example.org/entities/assertor-002"),
        "asserted_at": ("asserted_at", "2026-07-14T00:00:01Z"),
        "subject (about_uri)": ("about_uri", "https://example.org/entities/subject-002"),
        "claim_type": ("claim_type", "social"),
    }

    failures = []
    for label, (fieldname, newvalue) in mutations.items():
        fx = load_fixture()
        fx["claim_candidate"][fieldname] = newvalue
        mutated = admit(fx)
        changed = mutated.claim_fingerprint != base.claim_fingerprint
        out(f"mutate {label:<24} -> {mutated.claim_fingerprint}  changed={changed}")
        if not changed:
            failures.append(label)

    assert not failures, f"fingerprint did NOT change for: {failures}"


# ---------------------------------------------------------------------------
# 3. Audit isolation  <-- CARRIES SIGNAL
# ---------------------------------------------------------------------------

def t_audit_isolation() -> None:
    base = admit(load_fixture())
    out(f"baseline FP    : {base.claim_fingerprint}")
    out(f"baseline canon : {len(base.canonical_nquads)} bytes\n")

    def mutate_evidence(fx):
        fx["source"]["evidence_uris"] = [
            "urn:koi:fixture:evidence-999",
            "urn:koi:fixture:evidence-998",
        ]

    def mutate_output_record(fx):
        fx["source"]["output_record_rid"] = "urn:koi:fixture:output-record-CHANGED"

    def mutate_db_timestamp(fx):
        fx["db_created_at"] = "2099-01-01T00:00:00.000Z"
        fx["api_request_at"] = "2099-01-01T00:00:00.000Z"

    def mutate_all_audit(fx):
        mutate_evidence(fx)
        mutate_output_record(fx)
        mutate_db_timestamp(fx)
        fx["source"]["source_document"] = "urn:koi:fixture:document-CHANGED"
        fx["claim_candidate"]["reviewer_uri"] = "https://example.org/entities/reviewer-999"
        fx["claim_rid"] = "orn:koi.claim:CHANGED"
        fx["data_iri"] = "urn:koi:fixture:data-iri-CHANGED"

    mutations = {
        "evidence_uris only": mutate_evidence,
        "output_record_rid only": mutate_output_record,
        "DB/API timestamps only": mutate_db_timestamp,
        "ALL audit fields at once": mutate_all_audit,
    }

    failures = []
    for label, fn in mutations.items():
        fx = load_fixture()
        fn(fx)
        mutated = admit(fx)
        same_bytes = mutated.canonical_nquads == base.canonical_nquads
        same_fp = mutated.claim_fingerprint == base.claim_fingerprint
        same_iri = mutated.claim_iri == base.claim_iri
        out(
            f"mutate {label:<26} -> {mutated.claim_fingerprint}\n"
            f"       {'':<26}    canon_bytes_identical={same_bytes} "
            f"fp_identical={same_fp} iri_identical={same_iri}"
        )
        if not (same_bytes and same_fp and same_iri):
            failures.append(label)

        # The legacy BLAKE2b anchor hash SHOULD move when audit data moves --
        # that is the whole reason it is not a semantic fingerprint.
        legacy_moved = (
            mutated.audit["legacy_blake2b_anchor_hash"]
            != base.audit["legacy_blake2b_anchor_hash"]
        )
        out(f"       {'':<26}    legacy_blake2b_moved={legacy_moved}")

    assert not failures, f"canonical fingerprint MOVED on audit-only mutation: {failures}"


# ---------------------------------------------------------------------------
# 4. Admission boundary
# ---------------------------------------------------------------------------

def t_admission_boundary() -> None:
    rejected = []
    for state in ["self_reported", "ai_extracted", "unverified", "ledger_anchored", None, ""]:
        fx = load_fixture()
        if state is None:
            fx["claim_candidate"].pop("verification_state", None)
        else:
            fx["claim_candidate"]["verification_state"] = state
        try:
            admit(fx)
            out(f"verification_state={state!r:<18} -> ADMITTED  (LEAK!)")
        except AdmissionError:
            out(f"verification_state={state!r:<18} -> refused (AdmissionError)")
            rejected.append(state)

    assert len(rejected) == 6, "an unreviewed candidate crossed the admission boundary"

    ok = admit(load_fixture())
    out(f"verification_state='peer_reviewed'  -> ADMITTED {ok.claim_iri}")


# ---------------------------------------------------------------------------
# 5. Projection boundary
# ---------------------------------------------------------------------------

def t_projection_boundary() -> None:
    claim = admit(load_fixture())

    projection = claim.project_to_graph()
    out("graph projection (L0 view, derived):")
    out(projection)

    # The projection names the claim by its REAL substance-derived IRI.
    assert claim.claim_iri in projection, "projection does not reference the canonical IRI"

    # It is REBUILDABLE from the accepted Claim alone: throw it away, rebuild it.
    del projection
    rebuilt = claim.project_to_graph()
    assert claim.claim_iri in rebuilt, "projection not rebuildable from the accepted Claim"
    out("projection discarded and rebuilt from the accepted Claim: OK")

    # And it is NOT authoritative: the authoritative substance bytes re-derive from
    # the Claim record itself, independent of any projection.
    re_derived = claim.rebuild_substance()
    out(f"re-derived canonical bytes == original : {re_derived == claim.canonical_nquads}")
    out(f"re-derived fingerprint                 : {fingerprint(re_derived)}")
    assert re_derived == claim.canonical_nquads, "substance not re-derivable from the Claim"
    assert fingerprint(re_derived) == claim.claim_fingerprint

    # Corrupting the projection must not touch the authoritative record.
    corrupt = rebuilt.replace("ecological", "TAMPERED")
    assert fingerprint(canonicalize(claim.project_to_graph())) != fingerprint(
        canonicalize(corrupt)
    ), "corrupted projection indistinguishable from clean one"
    assert claim.claim_fingerprint == fingerprint(claim.canonical_nquads), (
        "authoritative record was affected by projection tampering"
    )
    out("tampering with the projection does NOT alter the authoritative Claim: OK")


# ---------------------------------------------------------------------------
# 6. Lifecycle preservation
# ---------------------------------------------------------------------------

def t_lifecycle_preservation() -> None:
    claim = admit(load_fixture())

    required = {
        "evidence links": "evidence_uris",
        "reviewer attestation": "reviewer_uri",
        "verification state": "verification_state",
        "OutputRecord provenance": "output_record_rid",
        "source document": "source_document",
        "anchor/ledger identifiers": "claim_rid",
        "data IRI": "data_iri",
        "legacy BLAKE2b anchor hash": "legacy_blake2b_anchor_hash",
    }
    for label, key in required.items():
        value = claim.audit.get(key)
        out(f"{label:<28} {key:<28} = {value}")
        assert value, f"{label} lost across admission"

    # Integrity commitment != validation judgment. The two hashes must stay DISTINCT.
    out()
    out(f"semantic fingerprint (SHA-256) : {claim.claim_fingerprint}")
    out(f"legacy anchor hash  (BLAKE2b)  : {claim.audit['legacy_blake2b_anchor_hash']}")
    assert claim.claim_fingerprint != claim.audit["legacy_blake2b_anchor_hash"], (
        "semantic fingerprint conflated with the legacy anchor hash"
    )

    # Reviewer attestation is an audit record, NOT part of asserted content.
    assert "reviewer_uri" not in claim.substance
    assert "verification_state" not in claim.substance
    assert set(claim.substance) == set(adapter.SUBSTANCE_FIELDS)
    out("\nreviewer attestation + verification state are audit records, not "
        "asserted content: OK")
    out(f"substance keys: {sorted(claim.substance)}")

    assert CANON_LABEL in claim.canon_label
    out("canonicalization label stamped on the artifact: OK")


# ---------------------------------------------------------------------------
# 7. No production effect
# ---------------------------------------------------------------------------

def t_no_production_effect() -> None:
    # Real, mechanical guard: any attempt to open a socket during the full pipeline
    # raises. If the adapter touched a DB, the ledger, or the claims API, this fires.
    banned = ["requests", "httpx", "urllib.request", "psycopg2", "psycopg", "sqlalchemy",
              "aiohttp", "boto3"]
    leaked = [m for m in banned if m in sys.modules]
    out(f"network/DB modules imported: {leaked or 'none'}")
    assert not leaked, f"adapter pulled in network/DB libraries: {leaked}"

    real_socket = socket.socket
    real_create = socket.create_connection
    calls: list[str] = []

    def blocked(*args, **kwargs):
        calls.append("socket")
        raise AssertionError("NETWORK ACCESS ATTEMPTED during the spike")

    socket.socket = blocked          # type: ignore[assignment]
    socket.create_connection = blocked  # type: ignore[assignment]
    try:
        claim = admit(load_fixture())
        claim.project_to_graph()
        claim.rebuild_substance()
        fx = load_fixture()
        fx["claim_candidate"]["statement"] = "mutated"
        admit(fx)
        out("full pipeline executed under a socket guard: no connection attempted")
    finally:
        socket.socket = real_socket          # type: ignore[assignment]
        socket.create_connection = real_create  # type: ignore[assignment]

    assert not calls, "the spike attempted a network connection"

    src = open("adapter.py").read()
    for token in ["regen.gaiaai.xyz", "localhost:8351", "psycopg", "POST /claims",
                  "MsgAnchor", "MsgAttest", "5433"]:
        assert token not in src, f"adapter references a production surface: {token}"
    out("adapter references no production endpoint, DB, or ledger message type")
    out("no ledger transaction, no claim creation, no anchoring performed")


# ---------------------------------------------------------------------------

def main() -> int:
    out(f"CANONICALIZATION PROFILE\n{CANON_LABEL}\n")

    check("determinism", t_determinism)
    check("semantic_sensitivity", t_semantic_sensitivity)
    check("audit_isolation", t_audit_isolation)
    check("admission_boundary", t_admission_boundary)
    check("projection_boundary", t_projection_boundary)
    check("lifecycle_preservation", t_lifecycle_preservation)
    check("no_production_effect", t_no_production_effect)

    out(f"\n{'=' * 72}\nSUMMARY\n{'=' * 72}")
    for name, res in RESULTS.items():
        out(f"  {name:<26} {res.upper()}")
    failed = [n for n, r in RESULTS.items() if r != "pass"]
    out(f"\noverall: {'FAIL' if failed else 'PASS'}  ({len(RESULTS) - len(failed)}/{len(RESULTS)})")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
