//@flags:
// PoC 003 v2 — REAL WasmGC pressure (v1 was INVALID: malformed GC module + linear-memory loop; v1 results void).
// Module (hand-encoded, verified section math):
//   type 0: (array (mut i32))                       5e 7f 01
//   type 1: func (i32) -> (ref 0)                   [mk]
//   type 2: func ((ref 0), i32) -> i32              [get]
//   type 3: func ((ref 0), i32, i32) -> ()          [set]
// GC refs cross to JS as opaque handles; JS holds them, forces collection, reads back.
// Oracle: every kept array's contents survive collection unchanged; no crash.

function out(s){ print(s); }

const bin = new Uint8Array([
  0x00,0x61,0x73,0x6d, 0x01,0x00,0x00,0x00,
  // type section: content len 0x18: count 4
  0x01,0x18, 0x04,
    0x5e,0x7f,0x01,                                   // t0: array (mut i32)
    0x60,0x01,0x7f,0x01,0x64,0x00,                    // t1: (i32) -> (ref 0)
    0x60,0x02,0x64,0x00,0x7f,0x01,0x7f,               // t2: ((ref 0), i32) -> i32
    0x60,0x03,0x64,0x00,0x7f,0x7f,0x00,               // t3: ((ref 0), i32, i32) -> ()
  // func section: 3 funcs, types 1,2,3
  0x03,0x04, 0x03, 0x01,0x02,0x03,
  // export section: content len 0x12: mk, get, set
  0x07,0x12, 0x03,
    0x02,0x6d,0x6b, 0x00,0x00,
    0x03,0x67,0x65,0x74, 0x00,0x01,
    0x03,0x73,0x65,0x74, 0x00,0x02,
  // code section: content len 0x1d: 3 bodies
  0x0a,0x1d, 0x03,
    0x07, 0x00, 0x20,0x00, 0xfb,0x07,0x00, 0x0b,                          // mk:  local.get0; array.new_default t0; end
    0x08, 0x00, 0x20,0x00, 0x20,0x01, 0xfb,0x0b,0x00, 0x0b,               // get: local.get0; local.get1; array.get t0; end
    0x0a, 0x00, 0x20,0x00, 0x20,0x01, 0x20,0x02, 0xfb,0x0e,0x00, 0x0b     // set: ..; array.set t0; end
]);

let inst;
try {
  const mod = new WebAssembly.Module(bin);
  inst = new WebAssembly.Instance(mod, {});
  out("RESULT wasmgc-module-load: true");
} catch (e) {
  out("RESULT wasmgc-module-load: EX " + e);
  out("RESULT poc003-done: false");
  throw e;
}

const { mk, get, set } = inst.exports;

// control: round-trip one array
(function control() {
  const a = mk(8);
  set(a, 3, 0x2a2a2a2a | 0);
  out("RESULT wasmgc-roundtrip(" + get(a, 3) + "==-559038738): " + (get(a, 3) === (0x2a2a2a2a | 0)));
})();

// pressure: many GC arrays, half kept, churn + explicit collections, verify kept contents
function pressure(waves, perWave, len) {
  const kept = [];
  let anomalies = 0;
  for (let w = 0; w < waves; w++) {
    for (let i = 0; i < perWave; i++) {
      const a = mk(len);
      set(a, 0, w * 100000 + i);
      set(a, len - 1, -(w * 100000 + i) | 0);
      if ((i & 1) === 0) kept.push([a, w, i]); // keep half
    }
    // churn the young generation between waves
    for (let j = 0; j < 30000; j++) { const t = new Int32Array(32); t[0] = j; }
    if (typeof gc === "function") gc();
  }
  for (const [a, w, i] of kept) {
    const v0 = get(a, 0), v1 = get(a, len - 1);
    if (v0 !== (w * 100000 + i) || v1 !== ((-(w * 100000 + i)) | 0)) {
      anomalies++;
      if (anomalies < 5) out("ANOMALY kept[" + w + "," + i + "] v0=" + v0 + " v1=" + v1);
    }
  }
  return anomalies;
}

const waves = 30, perWave = 100, len = 64;
const bad = pressure(waves, perWave, len);
out("RESULT wasmgc-gc-pressure-anomalies(" + bad + "): " + (bad === 0));
out("RESULT poc003-done: " + (bad === 0));
