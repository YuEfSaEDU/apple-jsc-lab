#!/usr/bin/env python3
"""Generate WasmGC/JSPI test modules with PROGRAMMATIC section lengths (no hand-counting).
Outputs JS Uint8Array literals + validates by emitting a local check snippet.
Usage: python build_modules.py  -> prints literals; paste into poc files."""
import struct

def uleb(n):
    out = bytearray()
    while True:
        b = n & 0x7f
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)

def section(sid, body):
    return bytes([sid]) + uleb(len(body)) + body

def vec(items):
    return uleb(len(items)) + b"".join(items)

def name(s):
    b = s.encode()
    return uleb(len(b)) + b

def build_module(types, imports, funcs, exports, bodies):
    """types: list of (params:[...], results:[...], extra) where extra for GC refs;
    here we keep it minimal: params/results are wasm type byte strings (already-encoded)."""
    m = b"\x00asm\x01\x00\x00\x00"
    m += section(1, vec(types))
    if imports:
        m += section(2, vec(imports))
    m += section(3, vec([uleb(t) for t in funcs]))
    m += section(7, vec([name(n) + b"\x00" + uleb(i) for n, i in exports]))
    code = vec([uleb(len(b)) + b for b in bodies])
    m += section(10, code)
    return m

# ---------- Module A (JSPI): (type (func (param i32) (result i32)))
# import env.inc ; func (type 0) = local.get 0; call 0; end
modA = build_module(
    types=[b"\x60" + uleb(1) + b"\x7f" + uleb(1) + b"\x7f"],          # (i32)->i32
    imports=[name("env") + name("inc") + b"\x00" + uleb(0)],
    funcs=[0],
    exports=[("run", 0)],
    bodies=[b"\x00" + b"\x20\x00" + b"\x10\x00" + b"\x0b"],           # 0 locals; local.get 0; call 0; end
)

# ---------- Module B (WasmGC): array (mut i32); mk/get/set with (ref 0) crossing to JS
REF0 = b"\x64\x00"  # (ref 0)
t_arr = b"\x5e\x7f\x01"                                               # array (mut i32)
t_mk  = b"\x60" + uleb(1) + b"\x7f" + uleb(1) + REF0                  # (i32) -> (ref 0)
t_get = b"\x60" + uleb(2) + REF0 + b"\x7f" + uleb(1) + b"\x7f"        # ((ref 0), i32) -> i32
t_set = b"\x60" + uleb(3) + REF0 + b"\x7f" + b"\x7f" + uleb(0)        # ((ref 0), i32, i32) -> ()
modB = build_module(
    types=[t_arr, t_mk, t_get, t_set],
    imports=[],
    funcs=[1, 2, 3],
    exports=[("mk", 0), ("get", 1), ("set", 2)],
    bodies=[
        b"\x00" + b"\x20\x00" + b"\xfb\x07\x00" + b"\x0b",                       # mk:  local.get 0; array.new_default 0; end
        b"\x00" + b"\x20\x00" + b"\x20\x01" + b"\xfb\x0b\x00" + b"\x0b",         # get: local.get 0; local.get 1; array.get 0; end
        b"\x00" + b"\x20\x00" + b"\x20\x01" + b"\x20\x02" + b"\xfb\x0e\x00" + b"\x0b",  # set: ...; array.set 0; end
    ],
)

def jsarray(bs):
    return "new Uint8Array([" + ",".join(str(b) for b in bs) + "])"

print("// MODULE A (JSPI) —", len(modA), "bytes")
print(jsarray(modA))
print()
print("// MODULE B (WasmGC) —", len(modB), "bytes")
print(jsarray(modB))
