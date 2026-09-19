"""Dev tool: run the loader over the tester's document corpus and report,
per file, how the text was obtained and how much of it there is. Not part of
the service. Usage (from the repo root):
  docker compose run --rm --no-deps -v $PWD/tester/fixtures:/fixtures:ro \
    -v $PWD/doc-service/tools:/usr/app/tools doc-service python tools/scan_corpus.py [subdir]
"""
import pathlib
import sys
import time

sys.path.insert(0, "/usr/app/src")
import loader  # noqa: E402

root = pathlib.Path("/fixtures/documents")
only = sys.argv[1] if len(sys.argv) > 1 else None
for path in sorted(root.rglob("*")):
    if not path.is_file() or (only and only not in str(path)):
        continue
    started = time.time()
    try:
        doc = loader.load(path.read_bytes(), filename=path.name)
        sources = {p.source for p in doc.pages}
        print(f"{path.relative_to(root)!s:75} {doc.kind:5} pages={len(doc.pages):2} src={'+'.join(sorted(sources)):10} chars={len(doc.text):6} {time.time()-started:4.1f}s")
    except Exception as error:  # noqa: BLE001
        print(f"{path.relative_to(root)!s:75} FAILED {type(error).__name__}: {str(error)[:60]}")
