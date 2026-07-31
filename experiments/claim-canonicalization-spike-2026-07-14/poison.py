import sys, time, pyoxigraph as ox
ds = ox.Dataset()
for q in ox.parse(path="rdf-canon-main/tests/rdfc10/test074-in.nq", format=ox.RdfFormat.N_QUADS):
    ds.add(q)
t0 = time.time()
try:
    ds.canonicalize(ox.CanonicalizationAlgorithm.RDFC_1_0)
    print(f"ACCEPTED (no refusal) after {time.time()-t0:.1f}s")
except Exception as ex:
    print(f"REFUSED after {time.time()-t0:.1f}s: {type(ex).__name__}: {ex}")
