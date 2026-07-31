"""
PROOF: RDFC-1.0 canonicalization + application-level SHA-256 digest.

PROFILE: RDFC-1.0 canonicalization (pyoxigraph 0.5.9), digest = SHA-256 over the
canonical N-Quads serialization (UTF-8 bytes, lowercase hex).

The spec's INTERNAL SHA-256 (blank-node labelling) is NOT this digest. This digest
is computed by us, separately, over the canonical N-Quads output bytes.
"""
import hashlib
import pyoxigraph as ox

# Trivial 2-triple graph with a blank node:
#   <claim/1> prov:wasAttributedTo _:b   .
#   _:b       foaf:name           "JC"   .
GRAPH_A = """\
<http://example.org/claim/1> <http://www.w3.org/ns/prov#wasAttributedTo> _:assertor .
_:assertor <http://xmlns.com/foaf/0.1/name> "JC" .
"""

# Same graph, different blank-node label + reversed line order.
# An RDFC-1.0-correct impl MUST produce byte-identical canonical output.
GRAPH_B = """\
_:zzz9 <http://xmlns.com/foaf/0.1/name> "JC" .
<http://example.org/claim/1> <http://www.w3.org/ns/prov#wasAttributedTo> _:zzz9 .
"""


def canonicalize(nq: str) -> bytes:
    """RDFC-1.0 canonical N-Quads form, as UTF-8 bytes."""
    ds = ox.Dataset()
    for quad in ox.parse(nq, format=ox.RdfFormat.N_QUADS):
        ds.add(quad)
    ds.canonicalize(ox.CanonicalizationAlgorithm.RDFC_1_0)
    raw = ox.serialize(ds, format=ox.RdfFormat.N_QUADS).decode("utf-8")
    # Spec: canonical form = serialized quads sorted in code point order.
    lines = sorted(l for l in raw.split("\n") if l.strip())
    return "".join(l + "\n" for l in lines).encode("utf-8")


def digest(canon: bytes) -> str:
    """Application-level fingerprint: SHA-256 over canonical N-Quads bytes."""
    return hashlib.sha256(canon).hexdigest()


print(f"pyoxigraph {ox.__version__} | algorithm = CanonicalizationAlgorithm.RDFC_1_0\n")

for name, src in (("GRAPH_A", GRAPH_A), ("GRAPH_B (relabelled + reordered)", GRAPH_B)):
    canon = canonicalize(src)
    print(f"--- {name} ---")
    print("canonical N-Quads:")
    print(canon.decode("utf-8"), end="")
    print(f"bytes    : {len(canon)}")
    print(f"SHA-256  : {digest(canon)}\n")

a, b = canonicalize(GRAPH_A), canonicalize(GRAPH_B)
print("=" * 64)
print(f"canonical bytes identical : {a == b}")
print(f"digests identical         : {digest(a) == digest(b)}")
print("=> isomorphic graphs converge to one fingerprint (the property a claim IRI needs)")
