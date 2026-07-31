# Claim substance & canonicalization spike — 2026-07-14

This is the evidence base for **[ADR 0001 — Claim substance & content-addressed canonicalization](https://github.com/regen-network/regen-data-standards/pull/56)** in `regen-data-standards`. The ADR cited it as a local path, which meant nobody but its author could read it. That was a defect in the ADR; this directory fixes it.

Everything here is offline and synthetic. `fixture.yaml` carries an explicit non-production header — `example.org` URIs, no live claim identifiers, no private evidence, no funded anchor path. Nothing here touches a real database, the Regen ledger, or the live claims API.

## What it tested

Whether a content-addressed identity for a `Claim` can be computed such that two materially different claims never collide, the computation is deterministic across engines, and it is safe to run on untrusted input.

## The three findings

**1. Substance collision — the load-bearing one.** A naïve substance set of five fields — `(claimant, subject, statement, claim_type, asserted_at)` — drops `quantity`, `unit`, credit class, impact and methodology. Two materially different impact claims produced an identical fingerprint:

```
A  quantity=100  creditClass=C04  unit=tonnes     -> fp e69fb077…
B  quantity=5    creditClass=C05  unit=kilograms  -> fp e69fb077…   (IDENTICAL)
```

KOI's incumbent BLAKE2b-256 anchor keeps A and B distinct. The proposed identity was *less* discriminating than the thing it would have replaced. This is what drives the ADR's D1 substance definition.

**2. DoS non-conformance.** pyoxigraph 0.5.9's RDFC-1.0 passes the runnable W3C eval vectors but does not satisfy the §4.4.3 DoS-defence MUST — a poison "clique" graph does not terminate (SIGKILL after >90s). Since claim graphs can arrive from outside, this is a live surface, not a theoretical one. It is why the ADR's D4 guard is mandatory rather than advisory.

**3. Timestamp lexical-vs-value.** The fingerprint is taken over the *lexical* form of `xsd:dateTime`, so four representations of the same instant mint four different identities. Hence D3's normalisation rule.

## Re-running it

```
python3 -m venv .venv && . .venv/bin/activate
pip install pyoxigraph==0.5.9 pyyaml
python run.py          # the three findings
python conformance.py  # W3C RDFC-1.0 eval vectors
python poison.py       # finding 2 — expect it NOT to terminate; kill it
pytest test_spike.py
```

`attacks/` holds the adversarial probes: collision search, injectivity fuzzing, boundary conditions, and audit isolation.

## Reading it against the ADR as it now stands

The spike was run while the ADR recommended **D2-b** (JCS over a typed projection). That recommendation has since been **withdrawn** in favour of **D2-a** (RDFC-1.0), because `MsgAttest.content_hashes` is typed `repeated ContentHash.Graph` — so a claim anchored as `ContentHash.Raw` can never be attested on-chain. See the [D2 thread on PR #56](https://github.com/regen-network/regen-data-standards/pull/56).

That reversal does not touch findings 1 and 3, which are about *which fields* enter the projection and how values are normalised — both algorithm-independent. It makes finding 2 more load-bearing, not less: under D2-a we actually run RDFC-1.0 on the serving path, so the DoS guard becomes a release gate.

`ADR-jc-koi-canonicalization-profile.md` is the spike's own contemporaneous write-up and predates that reversal. It is preserved as run rather than edited after the fact; read the ADR in `regen-data-standards` for the current position.
