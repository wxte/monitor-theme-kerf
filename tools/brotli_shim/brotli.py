"""
Stand-in for the `brotli` Python module, for machines without it: fontTools'
WOFF2 writer needs brotli.compress, and Node ships Brotli in its zlib. Only
used by tools/woff2.py when `import brotli` fails.
"""
import subprocess

MODE_GENERIC, MODE_TEXT, MODE_FONT = 0, 1, 2

_JS = r"""
const z = require("zlib"); const chunks = [];
process.stdin.on("data", (c) => chunks.push(c)).on("end", () => {
  const [op, mode, quality, lgwin] = process.argv.slice(1).map(Number);
  const buf = Buffer.concat(chunks);
  const out = op ? z.brotliDecompressSync(buf) : z.brotliCompressSync(buf, { params: {
    [z.constants.BROTLI_PARAM_MODE]: mode, [z.constants.BROTLI_PARAM_QUALITY]: quality,
    [z.constants.BROTLI_PARAM_LGWIN]: lgwin, [z.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } });
  process.stdout.write(out);
});
"""

def _run(data, *args):
    return subprocess.run(["node", "-e", _JS, *map(str, args)], input=bytes(data), capture_output=True, check=True).stdout

def compress(data, mode=MODE_GENERIC, quality=11, lgwin=22, lgblock=0):
    return _run(data, 0, mode, quality, lgwin)

def decompress(data):
    return _run(data, 1, 0, 0, 0)

class error(Exception):
    pass
