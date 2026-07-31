"""
JC <-> KOI canonical-claim adapter.  SYNTHETIC / OFFLINE ONLY.

PROFILE (fixed by prior decision; not re-litigated here)
-------------------------------------------------------
rdf_canonicalization : RDFC-1.0 (pyoxigraph CanonicalizationAlgorithm.RDFC_1_0, 0.5.9)
digest_suite         : SHA-256 over the canonical N-Quads UTF-8 bytes, lowercase hex.
                       Computed by US, over the canonical serialization. This is NOT
                       the RDFC-1.0 internal blank-node-labelling hash. Keep distinct.
claim_iri_policy     : deterministic, derived from claim SUBSTANCE only
                       (assertor + subject + statement + claim_type + asserted_at).
admission_rule       : reviewer-confirmed -> verification_state == "peer_reviewed"
legacy               : KOI's BLAKE2b-256 anchor hash is retained as a SEPARATE value.
                       Never replaced by, never conflated with, the semantic fingerprint.

CANONICALIZATION LABEL (mandatory, stamped on every artifact) -- see CANON_LABEL.

THE LOAD-BEARING DESIGN POINT
-----------------------------
A claim IRI derived from substance cannot name itself before it is computed
(bootstrapping problem). So the substance graph gives the claim a BLANK NODE
subject. RDFC-1.0 deterministically relabels that blank node (-> _:c14n0), which
makes the canonical bytes stable and self-contained. The fingerprint is taken over
those bytes; the IRI is then minted from the fingerprint. This is precisely why
RDFC-1.0 is load-bearing and why a naive "sort the N-Triples" scheme would not do.

THE WHOLE POINT OF THE EXPERIMENT
---------------------------------
The canonicalized graph contains ONLY the five substance terms. Evidence URIs,
output_record_rid, source_document, reviewer_uri, verification_state, claim_rid,
data_iri, DB/API timestamps and the BLAKE2b anchor hash are AUDIT/OPERATIONAL
records. They ride ALONGSIDE the Claim and MUST NOT enter the canonical graph.
This is enforced structurally by SUBSTANCE_FIELDS below -- the graph builder reads
from an explicit allowlist, so an audit field cannot leak in even if someone later
adds it to the fixture.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Mapping

import pyoxigraph as ox

CANON_LABEL = (
    "RDFC-1.0 canonicalization (pyoxigraph 0.5.9) + SHA-256 over canonical N-Quads. "
    "Verified: 64/64 W3C rdf-canon eval vectors pass. NOT fully spec-conformant: "
    "fails §4.4.3 DoS-defense MUST (poison graphs do not terminate); 21 MapTests "
    "unverified. Synthetic/trusted input only — not safe for untrusted claim graphs "
    "without an external timeout."
)

# Spike-scoped, deliberately non-production vocabulary. Minting a real published
# namespace (or a claim-type taxonomy IRI scheme) is an explicit NON-GOAL of the
# spike, so claim_type stays a plain literal rather than a minted taxonomy term.
NS = "https://example.org/ns/claim#"
XSD_DATETIME = "http://www.w3.org/2001/XMLSchema#dateTime"

# ---------------------------------------------------------------------------
# THE BOUNDARY. Everything hinges on these two sets being disjoint.
# ---------------------------------------------------------------------------

#: The ONLY fields whose values may enter the canonicalized graph.
SUBSTANCE_FIELDS = ("claimant_uri", "about_uri", "statement", "claim_type", "asserted_at")

#: Fields that ride ALONGSIDE the Claim. Never canonicalized. Never fingerprinted.
AUDIT_FIELDS = (
    "reviewer_uri",
    "verification_state",
    "output_record_rid",
    "source_document",
    "evidence_uris",
    "claim_rid",
    "data_iri",
    "db_created_at",
    "api_request_at",
    "legacy_blake2b_anchor_hash",
)

ADMISSION_STATE = "peer_reviewed"


class AdmissionError(ValueError):
    """Raised when a candidate is not reviewer-confirmed. It is not yet a Claim."""


class SubstanceLeakError(AssertionError):
    """Raised if an audit value is found inside the canonical graph. Fail closed."""


# ---------------------------------------------------------------------------
# Canonicalization primitives
# ---------------------------------------------------------------------------

def canonicalize(nquads: str) -> bytes:
    """RDFC-1.0 canonical N-Quads form, as UTF-8 bytes."""
    ds = ox.Dataset()
    for quad in ox.parse(nquads, format=ox.RdfFormat.N_QUADS):
        ds.add(quad)
    ds.canonicalize(ox.CanonicalizationAlgorithm.RDFC_1_0)
    raw = ox.serialize(ds, format=ox.RdfFormat.N_QUADS).decode("utf-8")
    # RDFC-1.0 canonical form: serialized quads sorted in code point order.
    lines = sorted(line for line in raw.split("\n") if line.strip())
    return "".join(line + "\n" for line in lines).encode("utf-8")


def fingerprint(canonical_bytes: bytes) -> str:
    """Semantic fingerprint: SHA-256 over canonical N-Quads bytes, lowercase hex."""
    return hashlib.sha256(canonical_bytes).hexdigest()


def _nt_literal(value: str) -> str:
    """Escape a plain literal per N-Triples canonical form."""
    escaped = (
        value.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
    )
    return f'"{escaped}"'


def build_substance_graph(candidate: Mapping[str, Any]) -> str:
    """
    Serialize ONLY the five substance terms as N-Quads.

    The claim subject is a BLANK NODE (`_:claim`) -- see module docstring. RDFC-1.0
    canonicalizes it to a stable label, which is what makes a substance-derived IRI
    possible at all.

    Reads strictly from SUBSTANCE_FIELDS. An audit field cannot leak in via the
    fixture, because nothing outside this allowlist is ever consulted.
    """
    missing = [f for f in SUBSTANCE_FIELDS if not candidate.get(f)]
    if missing:
        raise ValueError(f"substance field(s) missing or empty: {missing}")

    lines = [
        f'_:claim <{NS}hasClaimant> <{candidate["claimant_uri"]}> .',
        f'_:claim <{NS}hasSubject> <{candidate["about_uri"]}> .',
        f'_:claim <{NS}statement> {_nt_literal(str(candidate["statement"]))} .',
        f'_:claim <{NS}claimType> {_nt_literal(str(candidate["claim_type"]))} .',
        f'_:claim <{NS}assertedAt> '
        f'{_nt_literal(str(candidate["asserted_at"]))}^^<{XSD_DATETIME}> .',
    ]
    return "\n".join(lines) + "\n"


def derive_claim_iri(fp: str) -> str:
    """
    Deterministic, substance-derived Claim IRI. Function of the fingerprint and
    NOTHING else -- no claim_rid, no data_iri, no DB id, no timestamp-of-insert.
    """
    return f"urn:regen:claim:sha256:{fp}"


def legacy_blake2b_anchor_hash(candidate: Mapping[str, Any]) -> str:
    """
    STAND-IN for KOI's existing BLAKE2b-256 canonical-JSON anchor hash.

    Retained as a SEPARATE, parallel value. It is deliberately computed over the
    WHOLE candidate (audit fields included), which is exactly why it is NOT a
    semantic fingerprint and must never be conflated with one.

    NOTE: this is a stand-in. It is not verified byte-equal to koi-processor's
    production `ledger_anchor.py` implementation (out of scope: do not touch that
    repo). Its role here is only to prove the two hashes stay distinct and both
    survive admission.
    """
    payload = json.dumps(candidate, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.blake2b(payload, digest_size=32).hexdigest()


# ---------------------------------------------------------------------------
# The accepted Claim
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class AcceptedClaim:
    """
    The immutable, admitted canonical Claim.

    `substance_*` is the authoritative asserted content.
    `audit` rides ALONGSIDE and is deliberately excluded from the fingerprint.
    """

    claim_iri: str
    claim_fingerprint: str
    canonical_nquads: bytes
    assertor: str
    asserted_at: str
    substance: Mapping[str, Any]
    audit: Mapping[str, Any] = field(default_factory=dict)
    canon_label: str = CANON_LABEL

    def project_to_graph(self) -> str:
        """
        Step 6: rebuildable graph projection (L0 view).

        The projection re-states the substance under the REAL claim IRI (the blank
        node is resolved). It is DERIVED, not authoritative: it can be thrown away
        and rebuilt from this record at any time (see `rebuild_substance`).
        """
        c = self.substance
        lines = [
            f'<{self.claim_iri}> <{NS}hasClaimant> <{c["claimant_uri"]}> .',
            f'<{self.claim_iri}> <{NS}hasSubject> <{c["about_uri"]}> .',
            f'<{self.claim_iri}> <{NS}statement> {_nt_literal(str(c["statement"]))} .',
            f'<{self.claim_iri}> <{NS}claimType> {_nt_literal(str(c["claim_type"]))} .',
            f'<{self.claim_iri}> <{NS}assertedAt> '
            f'{_nt_literal(str(c["asserted_at"]))}^^<{XSD_DATETIME}> .',
        ]
        return "\n".join(lines) + "\n"

    def rebuild_substance(self) -> bytes:
        """Re-derive the canonical substance bytes from the accepted record alone."""
        return canonicalize(build_substance_graph(self.substance))


def admit(record: Mapping[str, Any]) -> AcceptedClaim:
    """
    THE ADMISSION BOUNDARY.

    A raw or AI-extracted candidate is NOT a Claim. Only a reviewer-confirmed
    candidate (verification_state == "peer_reviewed") may cross into the canonical
    core. Anything else raises AdmissionError.
    """
    candidate = dict(record["claim_candidate"])
    source = dict(record.get("source", {}))

    state = candidate.get("verification_state")
    if state != ADMISSION_STATE:
        raise AdmissionError(
            f"candidate is not reviewer-confirmed: verification_state={state!r} "
            f"(required {ADMISSION_STATE!r}). Submitted material is not an accepted Claim."
        )

    substance = {k: candidate[k] for k in SUBSTANCE_FIELDS}

    canon = canonicalize(build_substance_graph(substance))
    fp = fingerprint(canon)
    iri = derive_claim_iri(fp)

    audit: dict[str, Any] = {
        "reviewer_uri": candidate.get("reviewer_uri"),
        "verification_state": state,
        "output_record_rid": source.get("output_record_rid"),
        "source_document": source.get("source_document"),
        "evidence_uris": list(source.get("evidence_uris", [])),
        # Operational identifiers/timestamps -- deliberately NOT in the fingerprint.
        "claim_rid": record.get("claim_rid", "orn:koi.claim:fixture-001"),
        "data_iri": record.get("data_iri", "urn:koi:fixture:data-iri-001"),
        "db_created_at": record.get("db_created_at", "2026-07-14T10:31:07.221Z"),
        "api_request_at": record.get("api_request_at", "2026-07-14T10:31:07.198Z"),
        "legacy_blake2b_anchor_hash": legacy_blake2b_anchor_hash(candidate),
    }

    claim = AcceptedClaim(
        claim_iri=iri,
        claim_fingerprint=fp,
        canonical_nquads=canon,
        assertor=substance["claimant_uri"],
        asserted_at=substance["asserted_at"],
        substance=substance,
        audit=audit,
    )

    _assert_no_audit_leak(claim)
    return claim


def _assert_no_audit_leak(claim: AcceptedClaim) -> None:
    """
    Fail-closed guard: no audit VALUE may appear in the canonical bytes.

    Belt-and-braces on top of the SUBSTANCE_FIELDS allowlist. If this ever fires,
    the adapter is broken and the fingerprint is not substance-pure.
    """
    canon_text = claim.canonical_nquads.decode("utf-8")
    for key in AUDIT_FIELDS:
        value = claim.audit.get(key)
        for item in value if isinstance(value, list) else [value]:
            if item and str(item) in canon_text:
                raise SubstanceLeakError(
                    f"audit field {key!r} value {item!r} leaked into the canonical graph"
                )
