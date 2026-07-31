"""
Run the official W3C rdf-canon (RDFC-1.0) test suite against pyoxigraph.

Scope note (honesty): pyoxigraph exposes canonical *output* but NOT the issued-
identifier map, so RDFC10MapTest entries cannot be run and are reported SKIPPED,
not passed.
"""
import json, pathlib, traceback
import pyoxigraph as ox

TESTS = pathlib.Path("rdf-canon-main/tests")
manifest = json.load(open(TESTS / "manifest.jsonld"))

ALGO = {
    None: ox.CanonicalizationAlgorithm.RDFC_1_0,
    "SHA256": ox.CanonicalizationAlgorithm.RDFC_1_0_SHA_256,
    "SHA384": ox.CanonicalizationAlgorithm.RDFC_1_0_SHA_384,
}


def canonical_nquads(path: pathlib.Path, hash_algorithm) -> str:
    """Canonicalize an N-Quads file and return the RDFC-1.0 canonical form.

    Per spec, the canonical form is the serialized quads sorted in code point
    order, so sorting the lines here is spec-mandated, not a fudge.
    """
    ds = ox.Dataset()
    for quad in ox.parse(path=str(path), format=ox.RdfFormat.N_QUADS):
        ds.add(quad)
    ds.canonicalize(ALGO[hash_algorithm])
    raw = ox.serialize(ds, format=ox.RdfFormat.N_QUADS).decode("utf-8")
    lines = sorted(l for l in raw.split("\n") if l.strip())
    return "".join(l + "\n" for l in lines)


results = {"PASS": [], "FAIL": [], "SKIP": []}

for entry in manifest["entries"]:
    tid, ttype = entry["id"], entry["type"]
    action = TESTS / entry["action"]
    halg = entry.get("hashAlgorithm")

    if ttype == "rdfc:RDFC10MapTest":
        results["SKIP"].append((tid, "pyoxigraph does not expose the issued-identifier map"))
        continue

    if ttype == "rdfc:RDFC10NegativeEvalTest":
        # Poison graph: a conformant impl must refuse (complexity limit), not hang.
        try:
            canonical_nquads(action, halg)
            results["FAIL"].append((tid, "poison graph was accepted; expected refusal"))
        except Exception as ex:
            results["PASS"].append((tid, f"correctly refused: {type(ex).__name__}"))
        continue

    # rdfc:RDFC10EvalTest
    try:
        got = canonical_nquads(action, halg)
        want = (TESTS / entry["result"]).read_text()
        want = "".join(l + "\n" for l in sorted(l for l in want.split("\n") if l.strip()))
        if got == want:
            results["PASS"].append((tid, f"hash={halg or 'SHA256(default)'}"))
        else:
            results["FAIL"].append((tid, f"output mismatch\n--got--\n{got}\n--want--\n{want}"))
    except Exception:
        results["FAIL"].append((tid, "EXCEPTION\n" + traceback.format_exc()))

print("=" * 72)
print("W3C rdf-canon (RDFC-1.0) test suite  vs  pyoxigraph", ox.__version__)
print("=" * 72)
for tid, msg in results["FAIL"]:
    print(f"FAIL {tid}: {msg}")
n_eval = sum(1 for e in manifest["entries"] if e["type"] != "rdfc:RDFC10MapTest")
print(f"\nPASS   : {len(results['PASS'])} / {n_eval} runnable")
print(f"FAIL   : {len(results['FAIL'])}")
print(f"SKIP   : {len(results['SKIP'])}  (MapTests — API does not expose the map)")
