"""Convert font files to WOFF2: python3 tools/woff2.py in.woff [...] (writes in.woff2 beside each)."""
import os, sys
try:
    import brotli  # noqa: F401
except ImportError:
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "brotli_shim"))
from fontTools.ttLib import TTFont

for path in sys.argv[1:]:
    f = TTFont(path)
    f.flavor = "woff2"
    out = os.path.splitext(path)[0] + ".woff2"
    f.save(out)
    print(f"{path} {os.path.getsize(path)} -> {out} {os.path.getsize(out)}")
