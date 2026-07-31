import inspect

print("="*70); print("PYOXIGRAPH")
import pyoxigraph
print("version:", pyoxigraph.__version__)
print("has CanonicalizationAlgorithm:", hasattr(pyoxigraph, "CanonicalizationAlgorithm"))
if hasattr(pyoxigraph, "CanonicalizationAlgorithm"):
    ca = pyoxigraph.CanonicalizationAlgorithm
    print("members:", [m for m in dir(ca) if not m.startswith("_")])
    print("CanonicalizationAlgorithm doc:", inspect.getdoc(ca))
print("Dataset.canonicalize doc:", inspect.getdoc(pyoxigraph.Dataset.canonicalize))

print("="*70); print("PYLD")
from pyld import jsonld
import pyld
print("version:", getattr(pyld, "__version__", "?"))
src = inspect.getsource(jsonld.JsonLdProcessor.normalize)
import re
print("algorithm strings referenced in normalize():")
for m in sorted(set(re.findall(r"URDNA\d+|URGNA\d+|RDFC[-_]?1\.?0?", src))):
    print("   ", m)
print("--- normalize() algorithm-handling excerpt ---")
for line in src.splitlines():
    if "algorithm" in line.lower():
        print(line.rstrip())

print("="*70); print("RDFLIB")
import rdflib
print("version:", rdflib.__version__)
from rdflib import compare
print("rdflib.compare public API:", [x for x in dir(compare) if not x.startswith("_")])
print("to_isomorphic doc:", (inspect.getdoc(compare.to_isomorphic) or "")[:400])
print("mentions RDFC/URDNA in rdflib.compare source:",
      sorted(set(re.findall(r"URDNA\d+|RDFC[-_]?1\.?0?|Hogan", inspect.getsource(compare)))))
