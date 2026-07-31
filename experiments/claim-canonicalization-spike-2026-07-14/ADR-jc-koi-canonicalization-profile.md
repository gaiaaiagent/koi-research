# ADR: JC ⇄ KOI Provisional Canonicalization Profile (EXPLORATORY / SINGLE-PARTY)

**Status:** PROVISIONAL — exploratory test profile. Not adopted. Not a team decision.
**Date:** 2026-07-14
**Context:** JC ⇄ KOI claims-compatibility spike, RegenAI (offline, synthetic fixture `jc-koi-claim-001`).
**Profile label (mandatory, verbatim on every artifact):**
> RDFC-1.0 canonicalization (pyoxigraph 0.5.9) + SHA-256 over canonical N-Quads. Verified: 64/64 W3C
> rdf-canon eval vectors pass. NOT fully spec-conformant: fails §4.4.3 DoS-defense MUST (poison graphs
> do not terminate); 21 MapTests unverified. Synthetic/trusted input only — not safe for untrusted
> claim graphs without an external timeout.

---

## Authorization

> **Authorization.** This provisional test profile was authorized by **Darren Zal** on
> **2026-07-14** (Claude Code session, RegenAI). **Single-party.** The compatibility spike's own
> decision gate (`jc-claims-compatibility-spike-2026-07-14.md`, "Decision gate") requires agreement
> from **Darren + Shawn + JC**. **Shawn and JC have not agreed.** This authorization discharges the
> gate for an **exploratory test profile only**. It is **not** a joint decision, **not** a team ADR,
> and **not** a production commitment. Any of the four profile choices may be overturned without
> cost — nothing depends on them yet.

---

## Verdict this ADR records

The spike is a **PARTIAL FAILURE and therefore a successful session.** Of seven acceptance checks,
**four genuinely pass** (`determinism`, `semantic_sensitivity`, `admission_boundary` [porous],
`no_production_effect`) and **three are false passes** (`audit_isolation`, `lifecycle_preservation`,
`projection_boundary` — the last two are tautologies). See `RESULT.md` for the per-check table and
real bytes. The most important output is a **finding about the claim model itself**, not just this
adapter (see "Real defect surfaced").

---

## The four decisions

### D1 — RDF canonicalization: **RDFC-1.0 via pyoxigraph 0.5.9**

- **What it buys.** The right algorithm (W3C RDFC-1.0, not URDNA2015 — confirmed distinct from the
  spec's Appendix B). Blank-node relabelling to a stable `_:c14n0` is what makes a **substance-derived
  IRI possible at all**: the claim can carry a blank-node subject, get canonicalized deterministically,
  and be fingerprinted before it has a name. 64/64 W3C eval vectors pass; a prebuilt wheel, no Rust
  toolchain. Rejected candidates checked by source introspection, not marketing: PyLD 3.1.0
  (URDNA2015/URGNA2012 only), rdflib 7.6.0 (own isomorphism labeller, no RDFC/URDNA), py_rdfc10
  (n-quads unimplemented).
- **What it does NOT buy — and this is load-bearing.** pyoxigraph 0.5.9 is **NOT RDFC-1.0
  conformant.** It **fails the §4.4.3 DoS-defense MUST**: the poison graph `#test074c` (10-node
  blank-node clique) never terminates — it neither returns nor raises; the run had to be SIGKILL'd
  (rc=137). 21 MapTests are unverified (no issued-identifier-map API). Its own docstring concedes
  worst-case exponential blow-up in blank nodes.
- **Cost to change.** Low-to-moderate today (nothing depends on it). If a JC (Rust) engine
  canonicalizes independently, byte-for-byte cross-engine equivalence must be proven vector-by-vector
  before either side's fingerprint is authoritative — that test does not yet exist.
- **HARD GATE before any non-synthetic use.** Canonicalization MUST be wrapped in an external
  timeout / blank-node-count cap before it ever sees input the team did not author (including JC's
  claim graphs). Un-capped, one small adversarial claim graph hangs the worker forever — a live DoS
  vector. Acceptable here only because the fixture is synthetic, self-authored, and trusted.

### D2 — Claim IRI policy: **deterministic, substance-derived** `urn:regen:claim:sha256:<fp>`

- **What it buys.** Content-addressed identity: the same asserted content always mints the same IRI,
  independent of serialization, blank-node labels, or line order (the `determinism` check, which
  genuinely passes). Two engines that agree on substance agree on the IRI.
- **What it does NOT buy (D2 is DEFECTIVE as specified).** The IRI is only as good as the substance
  model behind it, and **the substance model is wrong** (see "Real defect surfaced" and finding A1 in
  `RESULT.md`). As implemented, `urn:regen:claim:sha256:e69fb077…` is assigned to **two materially
  different claims** (quantity 100 tCO2e / C04 / tonnes and quantity 5 / C05 / kilograms), because the
  quantitative fields never enter the fingerprint. **Do not treat `e69fb077…` as a stable identity for
  the fixture's semantics** — it is stable only for the fixture's five-field projection.
- **Cost to change.** The IRI *scheme* (`urn:regen:claim:sha256:`) is cheap to keep. The *substance
  set* feeding it must change (D-defect), and any change re-mints every IRI. Because nothing is anchored
  yet, that re-mint is free now and expensive later.

### D3 — Digest suite: **SHA-256 over canonical N-Quads UTF-8 bytes, lowercase hex** (application-level)

- **What it buys.** A single, well-understood application fingerprint, computed by us over the
  canonical serialization. Correctly kept **distinct** from RDFC-1.0's *internal* SHA-256 (which only
  labels blank nodes — the spec explicitly disclaims any expectation it also digests the canonical
  result). KOI's incumbent BLAKE2b-256 anchor hash is retained **alongside**, never conflated — proven
  to stay a distinct value that also survives admission.
- **What it does NOT buy.** The BLAKE2b value in this spike is a **stand-in**, not verified byte-equal
  to `koi-processor`'s production `ledger_anchor.py` (out of bounds this session). Byte-parity is
  unproven.
- **Cost to change.** Low. Swapping to SHA-384 (pyoxigraph exposes RDFC_1_0_SHA_384; vectors 075c/076c
  pass) or another digest is a one-line change but re-mints every IRI (D2 depends on the digest).

### D4 — Admission rule: **reviewer-confirmed** → `verification_state == "peer_reviewed"` (STRICT `==`)

- **What it buys.** A real, non-vacuous boundary: 8/8 non-`peer_reviewed` states are rejected
  (`self_reported`, `ai_extracted`, `unverified`, `ledger_anchored`, case/whitespace variants, `None`,
  `""`). Unreviewed material cannot become a canonical Claim through `admit()`.
- **What it does NOT buy — two design problems to resolve.**
  1. **Strict `==` refuses `ledger_anchored`.** `ledger_anchored` is *further along* KOI's progressive
     verification lattice than `peer_reviewed`; strict equality treats "more verified" as "not
     verified." The team must decide `== peer_reviewed` vs. `>= peer_reviewed` on an **ordered
     lattice**. This ADR does not silently widen the check; it records the choice as open.
  2. **The boundary is porous.** `AcceptedClaim()` can be constructed directly, bypassing `admit()`
     entirely; and a `peer_reviewed` candidate with `reviewer_uri=None` still admits — "reviewer-
     confirmed" currently reduces to a string field equalling a constant, with no reviewer identity
     required.
- **Cost to change.** Low (nothing depends on it). Moving to a lattice and requiring a non-null
  reviewer identity are additive.

---

## Real defect surfaced (a finding about KOI's claim shape, not just this adapter)

The `audit_isolation` check was meant to prove the fingerprint captures **claim substance** while
excluding **audit noise**. It falls into the **inverse trap**: it passes by capturing *too little*.
The 5-field allowlist (`claimant_uri, about_uri, statement, claim_type, asserted_at`) **drops genuine
claim substance** that the real `koi-processor` `ClaimCreateRequest` carries — `metadata`
(quantity/unit/dates/SDGs/methodology) and `credit_class_id` (e.g. C04/C05). Consequence, reproduced
on real bytes:

- Two ledger-distinct impact claims → **one** fingerprint `e69fb077…` and **one** `urn:regen:claim:…`
  IRI.
- KOI's incumbent anchor hash keeps them distinct. **The new canonical identity is strictly *less*
  discriminating than the incumbent it would replace.**

**Implication for the claim model (not just the adapter):** *what counts as "substance" vs. "audit" is
an unsettled modelling question, and the spike's 5-field guess is wrong.* Quantitative and
methodological fields (quantity, unit, credit class, methodology, SDGs, and almost certainly the
validity/observation dates) are **substance** — changing them changes what is being claimed and MUST
change the identity. Any adopted profile MUST first define the substance schema against the real
`Claim`/`ClaimCreateRequest` shape (compose with LinkML `Claim.yaml` / PR #53) before an IRI policy
can be trusted. Two secondary model issues also surfaced: the `xsd:dateTime` **lexical-vs-value**
hazard (same instant → four different IRIs — normalize timestamps to one lexical form before
fingerprinting), and the fact that the canonical Claim wrapper is **mutable** (frozen dataclass over a
mutable dict) and can desync from its own fingerprint (make substance a deep-frozen/immutable mapping,
or re-derive the fingerprint on read).

---

## What the spike DEMONSTRATED vs. what remains OPEN

**Demonstrated (verified, conservative):**
- RDFC-1.0 canonicalization works for well-formed input; blank-node bootstrapping makes a
  substance-derived IRI mechanically feasible; determinism holds across relabelling + reordering.
- The fingerprint does not over-normalize IRIs/Unicode/literals (~560 adversarial cases, 0 real
  collisions); N-Triples injection stays contained.
- The pipeline has no production effect.

**Open (must be closed before this profile could ever be proposed as real):**
1. **Substance schema** — define it against the real `Claim` shape; the current 5-field set is
   defective (D2/defect). Blocks D2 and D3.
2. **Cross-engine byte-equivalence** — prove JC (Rust) and KOI (pyoxigraph) produce identical
   canonical bytes on a shared vector set. Not yet attempted.
3. **DoS hardening** — external timeout / blank-node cap before any untrusted input. Non-negotiable
   gate on D1.
4. **Admission semantics** — `==` vs. `>=` on an ordered lattice; require reviewer identity; close the
   direct-construction bypass (D4).
5. **Timestamp normalization** — one lexical form before fingerprinting (C-caveat).
6. **BLAKE2b byte-parity** — verify the stand-in against production `ledger_anchor.py` (D3).
7. **Namespace + `claim_type` encoding** — the spike-scoped `https://example.org/ns/claim#` and
   plain-literal `claim_type` are placeholders; a real published vocabulary / taxonomy IRI changes the
   fingerprint bytes. Decide deliberately.

**Reversibility:** every one of D1–D4 can be overturned at zero cost today — nothing is anchored,
nothing is published, no counterparty has agreed. This ADR exists to make the choices legible and the
defects impossible to overlook, not to bind anyone.
