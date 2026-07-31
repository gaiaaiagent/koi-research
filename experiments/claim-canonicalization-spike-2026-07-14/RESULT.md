# JC ⇄ KOI Canonical-Claim Compatibility Spike — RESULT RECORD

**Canonicalization profile under test:**
> RDFC-1.0 canonicalization (pyoxigraph 0.5.9) + SHA-256 over canonical N-Quads. Verified: 64/64 W3C
> rdf-canon eval vectors pass. NOT fully spec-conformant: fails §4.4.3 DoS-defense MUST (poison graphs
> do not terminate); 21 MapTests unverified. Synthetic/trusted input only — not safe for untrusted
> claim graphs without an external timeout.

- **Date:** 2026-07-14 (the orchestrator passed the working dir and date as the literal string
  `undefined` — a template-variable bug; resolved from session context. See "Provenance / caveats".)
- **Workspace:** `/Users/darrenzal/projects/RegenAI/scratch/jc-koi-canon-spike` (synthetic, offline)
- **Fixture:** `jc-koi-claim-001` (synthetic, self-authored, trusted)
- **This document supersedes the build's self-reported `overall: pass`.** Where the adversarial pass
  and the build disagree, the adversary wins (per the task contract).

---

## 1. VERDICT — PARTIAL FAILURE (3 of 7 acceptance checks are FALSE PASSES)

**The build reported `overall: pass`, 7/7. That headline is wrong. The honest headline is: the spike
FAILED on three of its seven acceptance criteria, and the failure is the valuable outcome.**

A failed spike is a successful session. The falsifiable result the spike exists to produce is:

1. **`audit_isolation` — FALSE PASS (masks a real defect).** The check passes only because it is
   near-tautological, and in passing it green-lights a **substance model that is strictly *narrower*
   than a real KOI claim**. Two materially different impact claims (quantity 100 tCO2e / class C04 /
   tonnes vs. quantity 5 / class C05 / kilograms) collapse to **one** fingerprint and **one**
   `urn:regen:claim:…` IRI. This directly falsifies the spike's stated objective — "represent one
   reviewed KOI claim **without losing existing semantics**." The new canonical identity is *less*
   discriminating than KOI's incumbent anchor hash.

2. **`lifecycle_preservation` — FALSE PASS (tautology on fabricated data).** The anchor/ledger
   identifiers the criterion names (`claim_rid`, `data_iri`, DB/API timestamps) **do not exist in the
   fixture at all**; `admit()` conjures fixed literal defaults for them. Two distinct claims are
   emitted with **identical** `claim_rid` and `data_iri`. Nothing is "preserved"; placeholders are
   invented and their existence asserted.

3. **`projection_boundary` — FALSE PASS (tautology + a real immutability bug).** The tamper-resistance
   assertion corrupts a **local string**, never the object. The object it calls "immutable" is in fact
   **mutable**: `AcceptedClaim` is `frozen=True` but wraps a mutable `substance` dict, so a
   post-admission mutation desyncs the rebuilt content from the stored (now-stale) fingerprint.

**What genuinely holds (not fabricated, independently reproduced):**

- `determinism` — **PASS.** RDFC-1.0 converges two syntactically different serializations (blank node
  relabelled, lines reordered) to one fingerprint.
- `semantic_sensitivity` — **PASS.** ~560 adversarial cases, **0 real collisions**; the adapter does
  not over-normalize IRIs, Unicode, or literals.
- `admission_boundary` — **PASS but porous.** Genuinely rejects 8/8 non-`peer_reviewed` states; the
  *boundary* has design gaps (see finding B4).
- `no_production_effect` — **PASS.** Adapter is genuine pure computation; no network/DB/ledger touched.

The cryptographic core (RDFC-1.0 blank-node → `_:c14n0` canonicalization + SHA-256) is **real and not
fabricated.** The headline fingerprint `e69fb077…` was independently recomputed in this report
(`shasum -a 256 canonical.nq` → 490 bytes → `e69fb077…`). The problem is not a faked hash; it is that
**three checks assert far less than their names claim**, and one of them hides a substance-model defect.

---

## 2. RESULT RECORD (real values, no PROFILE_TBD)

```yaml
profile:
  rdf_canonicalization: RDFC-1.0 (pyoxigraph CanonicalizationAlgorithm.RDFC_1_0, 0.5.9)
  claim_iri_policy: deterministic; derived from claim SUBSTANCE only
    (assertor + subject + statement + claim_type + asserted_at)   # NOTE: this 5-field
    # substance set is DEFECTIVE — see finding A1. It drops genuine claim substance.
  digest_suite: SHA-256 over canonical N-Quads UTF-8 bytes, lowercase hex
    # This is the APPLICATION fingerprint, computed by us over the canonical serialization.
    # It is NOT RDFC-1.0's internal SHA-256 (that one only labels blank nodes; the spec
    # explicitly disclaims any expectation it also digests the canonical result).
  admission_rule: reviewer-confirmed  ->  verification_state == "peer_reviewed"  (STRICT equality)
  canonicalization_label: >-
    RDFC-1.0 canonicalization (pyoxigraph 0.5.9) + SHA-256 over canonical N-Quads. Verified: 64/64
    W3C rdf-canon eval vectors pass. NOT fully spec-conformant: fails §4.4.3 DoS-defense MUST (poison
    graphs do not terminate); 21 MapTests unverified. Synthetic/trusted input only — not safe for
    untrusted claim graphs without an external timeout.

library:
  name: pyoxigraph
  version: 0.5.9
  install: prebuilt wheel, no Rust toolchain
  conformance:
    w3c_rdfc10_eval:     PASS 64/64   # incl. SHA-384 vectors 075c/076c; all < 1s
    w3c_rdfc10_negative: FAIL 1/1     # #test074c poison clique: no refusal; >90s; SIGKILL rc=137
    w3c_rdfc10_map:      SKIP 21      # API does not expose the issued-identifier map
  is_rdfc10_conformant: false         # violates §4.4.3 DoS-defense MUST

fixture_id: jc-koi-claim-001
claim_iri: urn:regen:claim:sha256:e69fb077232b3776620122897ccb649576378ea7f4feecdbb487bda1fc006b6f
claim_fingerprint: e69fb077232b3776620122897ccb649576378ea7f4feecdbb487bda1fc006b6f   # SHA-256, verified
canonical_bytes: 490
legacy_koi_anchor_hash_blake2b_256: 8c37f07707cccb9855b610f28ad00e30d61596f718609da53d86d519b6471efb
  # STAND-IN only — NOT verified byte-equal to koi-processor's production ledger_anchor.py.

canonical_nquads: |
  _:c14n0 <https://example.org/ns/claim#assertedAt> "2026-07-14T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
  _:c14n0 <https://example.org/ns/claim#claimType> "ecological" .
  _:c14n0 <https://example.org/ns/claim#hasClaimant> <https://example.org/entities/assertor-001> .
  _:c14n0 <https://example.org/ns/claim#hasSubject> <https://example.org/entities/subject-001> .
  _:c14n0 <https://example.org/ns/claim#statement> "Fixture assertion for cross-engine canonicalization testing." .

checks:                          # FINAL states — corrected by the adversarial pass, not the build's self-report
  determinism:            pass
  semantic_sensitivity:   pass   # + open ADR caveat: dateTime lexical-vs-value (see B-caveat)
  audit_isolation:        FAIL   # false pass: near-tautology; masks substance-collision (A1)
  admission_boundary:     pass   # genuine but porous (B4)
  projection_boundary:    FAIL   # false pass: tamper test is a tautology; object is mutable (B2/B3)
  lifecycle_preservation: FAIL   # false pass: tautology on fabricated anchor defaults (B1)
  no_production_effect:   pass

overall: PARTIAL_FAIL            # build claimed "pass"; three checks are false passes

notes:
  - Synthetic fixture. No production DB, no Regen ledger, no live claims API, no anchoring, no ledger tx.
  - Legacy BLAKE2b-256 is a stand-in, retained as a separate value; never conflated with the fingerprint.
  - The 5-field substance model is a spike guess and is WRONG (finding A1). Do not ship it.
```

---

## 3. Per-check table — build claim vs. adversary vs. FINAL truth

| Check | Build claimed | Adversary found | **FINAL** |
|---|---|---|---|
| `determinism` | pass | Genuine; relabelled + reordered graph → same fp | **PASS** |
| `semantic_sensitivity` | pass | Survives ~560 attacks, 0 real collisions; not over-normalizing. One ADR caveat: dateTime lexical-vs-value | **PASS** (with caveat) |
| `audit_isolation` | pass | **Partially refuted.** Near-**TAUTOLOGY** (fixed allowlist ⇒ can only observe `fp_identical=True`) that **masks a substance-collision defect**: real KOI claim fields (quantity/unit/credit_class_id/SDGs/methodology) are silently dropped → materially-different claims collide | **FAIL (false pass)** |
| `admission_boundary` | pass | Genuine, non-vacuous (rejects 8/8 non-`peer_reviewed`), but **porous**: direct `AcceptedClaim()` bypasses `admit()`; `reviewer_uri=None` still admits; strict `==` refuses the *more*-verified `ledger_anchored` | **PASS** (porous — design gaps noted) |
| `projection_boundary` | pass | **Partially refuted.** Tamper test is a **TAUTOLOGY** (mutates a local string, not the object); the "immutable" `AcceptedClaim` is **mutable** (frozen dataclass, mutable `substance` dict) → post-mutation desync; "rebuildable" is only a substring check | **FAIL (false pass)** |
| `lifecycle_preservation` | pass | **Partially refuted.** **TAUTOLOGY**: the anchor/ledger identifiers the criterion names are **fabricated defaults absent from the fixture**; two distinct claims share `claim_rid`/`data_iri` | **FAIL (false pass)** |
| `no_production_effect` | pass | Survives — adapter genuinely pure (no network imports, no subprocess, no writes outside spike dir). Guard is redundant but conclusion holds | **PASS** |

**Score: 4 PASS (one porous, one caveated) / 3 FAIL. Build's `7/7 pass` → true `4/7`.**

---

## 4. Findings, with real bytes

### A. audit-isolation lens — `partially_refuted`

**A1 (MAJOR) — the substance model is too narrow; materially-different claims collide.**
`admit()` reads only `SUBSTANCE_FIELDS = ("claimant_uri","about_uri","statement","claim_type",
"asserted_at")` (adapter.py L66, L241) and silently drops everything else. But the real
`koi-processor` `ClaimCreateRequest` (`api/routers/claims_router.py`) carries `metadata` (documented
"quantity, unit, dates, SDGs, methodology") and `credit_class_id` ("e.g. C04, C05") — **genuine claim
substance.** Independently reproduced in this report (`./.venv/bin/python` against the real adapter):

```
A  qty=100  C04  tonnes     -> fp e69fb077232b3776620122897ccb649576378ea7f4feecdbb487bda1fc006b6f
B  qty=5    C05  kilograms  -> fp e69fb077232b3776620122897ccb649576378ea7f4feecdbb487bda1fc006b6f
   fingerprints identical : True      claim IRIs identical : True
   legacy BLAKE2b A       : e1026a382f50deab4b0dff5b8ef8d0d2905a4cd40e7e957833a84411f8fd8948
   legacy BLAKE2b B       : 574b3a468fd18444886dd4a3714f3c3feb1260ea757c58549edf946be52affb0
   legacy hashes distinct : True
```

(The adversary's independent run got the same collision fp `e69fb077…` and its own distinct legacy
pair `8aad1a6c…` / `3446f652…`; the legacy bytes vary with the metadata-payload shape, the collision
does not.) **KOI's incumbent anchor hash separates these two claims; the new fingerprint merges them.**
The proposed canonical identity is strictly *less* discriminating than what it would replace. This is
the finding that falsifies the spike objective.

**A2 (MINOR) — `audit_isolation` is near-tautological.** The fingerprint is derived from
`substance = {k: candidate[k] for k in SUBSTANCE_FIELDS}` (a fixed allowlist), so every field the test
mutates (`evidence_uris`, `output_record_rid`, `reviewer_uri`, `claim_rid`, `data_iri`, DB/API
timestamps) is **by construction never read** during fingerprinting. The test can only ever observe
`fp_identical=True`; it exercises no path that could distinguish "correct substance boundary" from
"too-narrow substance boundary." That structural guarantee is exactly why it masked A1. *(The named-
audit-field direction of the check — declared audit fields do not move the fingerprint — is real: 11
audit mutations, none moved the fingerprint. It is that half that is tautological, not fabricated.)*

**A3 (MINOR) — fail-closed guard false-positive (availability bug).** `_assert_no_audit_leak`
(adapter.py L275-289) is a naive substring test `if item and str(item) in canon_text`. If an evidence
URI equals or is a substring of the subject/claimant IRI (plausible when the evidence *is* the subject
entity's own registry record), a **valid** claim is rejected:
```
source.evidence_uris = ["https://example.org/entities/subject-001"]  (the subject IRI)
-> SubstanceLeakError: audit field 'evidence_uris' value '…subject-001' leaked into the canonical graph
```
The guard provides no real protection (audit values never enter the graph via the allowlist anyway)
and can only cause false rejections.

### B. boundaries-and-claims lens — `partially_refuted`

**B1 (MAJOR, TAUTOLOGY) — `lifecycle_preservation` asserts on fabricated data.** `claim_rid`,
`data_iri`, `db_created_at`, `api_request_at` are **absent from `fixture.yaml`**; `admit()` hardcodes
fixed literal defaults (adapter.py L254-257). The lifecycle test's `assert value` passes on those
invented constants. Independently reproduced:
```
claim ONE  fp=…(distinct)   claim_rid=orn:koi.claim:fixture-001   data_iri=urn:koi:fixture:data-iri-001
claim TWO  fp=…(distinct)   claim_rid=orn:koi.claim:fixture-001   data_iri=urn:koi:fixture:data-iri-001
  fp differ: True   claim_rid same: True   data_iri same: True
```
Two ledger-distinct claims share one "anchor/ledger identifier" → the field preserves **zero**
per-claim information. *(Honest scope: `evidence_uris`, `reviewer_uri`, `verification_state`,
`output_record_rid`, `source_document` ARE genuinely sourced from the fixture and do flow through —
so the criterion is half-real. The anchor-reference half is the tautology.)*

**B2 (MAJOR, TAUTOLOGY) — `projection_boundary` tamper test never touches the object; the object is
mutable.** The suite's tamper assertion corrupts a local string (`rebuilt.replace('ecological',
'TAMPERED')`) and checks the frozen object is unchanged — it never routes tampering through the
object. The real object IS tamperable: `AcceptedClaim` is `frozen=True` but `substance` is a mutable
dict (adapter.py L181-195). Independently reproduced:
```
after c.substance['statement'] = 'TAMPERED post-admission':
  stored claim_fingerprint : e69fb077232b3776620122897ccb649576378ea7f4feecdbb487bda1fc006b6f  (stale)
  rebuild_substance()  fp  : 984b1d1b3ba09b0939c97e1e6dd35afe910e80d3851b44aee76dda63359888e6
  stored == rebuilt        : False
  'TAMPERED' in projection : True
```
The "immutable" Claim and its self-describing fingerprint silently desync.

**B3 (MINOR) — "rebuildable" is only a substring check.** The projection graph names the claim by its
real IRI subject, whereas the fingerprint was taken over the **blank-node** canonical graph, so the
projection re-canonicalizes to a **different** hash and no test asserts the projection reproduces the
fingerprint:
```
canonical(blank-node _:c14n0)  fp = e69fb077232b3776620122897ccb649576378ea7f4feecdbb487bda1fc006b6f
projection(named-IRI subject)  fp = 01d9fec12cf08c68841273291cf5db554adbb67b57875ac735da7646f73bcde0
equal = False
```
"Rebuildable" is verified far more weakly than the word implies.

**B4 (MINOR) — `admission_boundary` is genuine but porous.** The check itself is *not* vacuous: it
constructs 8/8 non-`peer_reviewed` candidates (`self_reported`, `ai_extracted`, `unverified`,
`ledger_anchored`, `PEER_REVIEWED`, `" peer_reviewed"`, `None`, `""`) and confirms each raises
`AdmissionError`. But the boundary is porous by design: (a) `AcceptedClaim()` can be constructed
**directly** with unreviewed forged content, bypassing `admit()` (yields a valid well-formed Claim,
IRI `urn:regen:claim:sha256:074bc48b…`); (b) a `peer_reviewed` candidate with `reviewer_uri=None`
still **admits** — reviewer identity is not actually required. Plus the strict `==` refuses
`ledger_anchored`, a state *further along* KOI's verification lattice than `peer_reviewed` (builder's
own honest-note #2): a strict equality check treats "more verified" as "not verified."

**B5 (SURVIVES) — `no_production_effect`.** Not a false pass. `adapter.py` is genuine pure
computation (`hashlib`/`json`/`pyoxigraph` only): zero network imports, no `subprocess`/`os.system`,
no write-mode `open()`. The only file writes in the spike are `run.py` → `result-record.yaml` +
`canonical.nq`, both inside the spike dir. Caveat only: the socket guard re-runs an already-pure
function (redundant), and the source-token grep is a fixed allowlist that would miss other prod
surfaces (8301 / 3030 / prod IP). The conclusion — no production effect — is **true**.

### C. semantic-sensitivity lens — `survives`

**C1 (SURVIVES, not a tautology) — no over-normalization collisions.** ~560 adversarial evaluations
through the real adapter, **0 real collisions.** pyoxigraph 0.5.9 does **not** normalize IRIs (scheme
case, `:443` default port, `/a/../s` dot-segments, trailing slash, `%7E`-vs-`~`, host case all stay
distinct), does **not** Unicode-normalize literals (NFC `café`=`3818146f…` vs NFD `café`=`bc5a7165…`
distinct), and preserves literal code points verbatim. A 524-statement injectivity fuzz over control
chars / escape ambiguity produced 524 distinct fingerprints. An N-Triples injection attempt (crafted
statement trying to inject a 6th triple / attacker claimant) stays fully contained inside the escaped
literal — canonical graph holds at exactly 5 triples, single subject `_:c14n0`, distinct fp
`ea118d1c…`. Baseline fp independently recomputed as `e69fb077…` (490 bytes). The check is genuine and
falsifiable — it would FAIL if the adapter over-normalized — and it holds.

**C-caveat (ADR-level, does NOT refute the check) — dateTime lexical-vs-value.** The fingerprint is
over the **lexical** form of the `xsd:dateTime` literal, not its value. Four representations of the
**same instant** mint **four different** claim IRIs:
```
2026-07-14T00:00:00Z          -> e69fb077…  (baseline)
2026-07-14T00:00:00+00:00     -> 7a0c00e75ecffb65e10f1bc6c62df325b7d684d9aad963b51fc36bf80453a0e6
2026-07-14T00:00:00.000Z      -> 55c735b97835bb5f8d98027135ef767c8395bafb7dd29a25b5a632004f449ca1
2026-07-13T17:00:00-07:00     -> ca03406e9e568fc8fdf0ba76958ae2578a939680582b8fb176654abe8810a1c9
```
Two engines (Rust JC vs. Python KOI) or two API paths serializing the same instant differently would
mint different canonical identities for the identical claim. This is squarely inside the spike's
cross-engine objective and must become an explicit ADR decision (normalize timestamps to one lexical
form before fingerprinting).

---

## 5. Tautologies (a vacuous pass is NOT a pass)

Marked explicitly per the task contract:

- **`audit_isolation`** — near-tautology (fixed allowlist ⇒ mutated fields are never read; can only
  observe `fp_identical=True`). **FAIL.**
- **`lifecycle_preservation`** — tautology on fabricated anchor defaults absent from the fixture.
  **FAIL.**
- **`projection_boundary`** (tamper leg) — tautology (mutates a local string, never the object).
  **FAIL.**

`determinism`, `semantic_sensitivity`, `admission_boundary`, and `no_production_effect` are **not**
tautologies — each exercises a path that could have failed, and did not.

---

## 6. What this spike PROVES vs. what it does NOT prove

**Proves (conservatively):**
- pyoxigraph 0.5.9 exposes and correctly computes RDFC-1.0 for well-formed input (64/64 W3C eval
  vectors; verified, not assumed).
- A **substance-derived, blank-node-bootstrapped** Claim IRI is mechanically feasible: two
  syntactically different serializations of the same asserted content converge to one fingerprint
  (`e69fb077…`, 490 canonical bytes, independently recomputed via `shasum`).
- Over the encoding profile actually tested, the fingerprint does not over-normalize (IRIs/Unicode/
  literals stay distinct across ~560 cases).
- The pipeline has **no production effect** (mechanically checked, and confirmed pure).

**Does NOT prove:**
- **It does NOT prove RDFC-1.0 conformance.** pyoxigraph 0.5.9 **fails** the §4.4.3 DoS-defense MUST
  (poison graph `#test074c` never terminates; SIGKILL rc=137) and 21 MapTests are unverified. Safe
  only for synthetic/trusted input. **Not safe for any untrusted claim graph (incl. JC's) without an
  external timeout / blank-node-count cap.**
- **It does NOT prove "no loss of existing semantics."** The opposite: the 5-field substance model
  **drops** real KOI claim substance (quantity, unit, credit_class_id, SDGs, methodology) and
  **merges** ledger-distinct impact claims under one IRI (A1).
- **It does NOT prove the Claim is immutable.** The `AcceptedClaim` object is mutable and can desync
  from its own fingerprint (B2).
- **It does NOT prove lifecycle/anchor-reference preservation.** Those identifiers are fabricated
  defaults, not preserved data (B1).
- **It does NOT prove byte-parity with KOI's production anchor hash.** The BLAKE2b value is a stand-in,
  not verified against `koi-processor`'s `ledger_anchor.py` (that repo was out of bounds).
- The fingerprint `e69fb077…` is stable **only** against this exact encoding profile (spike-scoped
  namespace `https://example.org/ns/claim#`, `claim_type` as a plain literal). Changing the namespace
  or promoting `claim_type` to an IRI changes the bytes — expected, and a decision for the ADR.

---

## 7. Provenance / caveats

- **Orchestrator template bug:** the task specified the working dir and date as the literal string
  `undefined`. No repo path was guessed; work was confined to the existing scratch dir
  `/Users/darrenzal/projects/RegenAI/scratch/jc-koi-canon-spike`, and the date resolved to 2026-07-14
  from session context. This matches the fixture's `asserted_at`.
- **Independent verification performed for this report:** recomputed `canonical.nq` → 490 bytes,
  `shasum -a 256` = `e69fb077…` (matches build + IRI suffix); `canon_a.nq` → 131 bytes,
  `4172ff12…` (matches foundation proof); confirmed `pyoxigraph 0.5.9` in the venv; re-ran the
  collision, lifecycle-fabrication, and mutability findings against the real `adapter.py` and
  reproduced the adversary's bytes (`e69fb077…` collision; `984b1d1b…` desync; shared
  `orn:koi.claim:fixture-001`). Every hash in this document was computed by running code — none
  invented.
- **Constraints honored:** offline; synthetic fixture only; no production DB, no Regen ledger, no live
  claims API, no ledger tx, no claim creation, no anchoring. `koi-processor` and `regen-data-standards`
  were read-only referenced (for the real `ClaimCreateRequest` shape) and **not modified**. No repo
  outside the spike dir was touched. Only the two reproduction snippets above were executed this
  session (ephemeral, no files written outside this RESULT.md and the ADR).

---

*Adversarial artifacts:* `attacks/audit-isolation/`, `attacks/semantic-sensitivity/`,
`attacks/boundaries-and-claims/`. *Foundation proofs:* `proof.py`, `conformance.py`, `poison.py`,
`survey.py`. *Adapter under test:* `adapter.py`. *Fixture:* `fixture.yaml`.
