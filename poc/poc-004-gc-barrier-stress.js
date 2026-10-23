//@flags:
// PoC 004 — Store-barrier/GC race stress on the variant-forensics hot clusters
// (ArrayPush/ArrayUnshift/MultiPutByOffset shapes; cf. fixes 2620d0db, f641af0b).
// Negative expected on HEAD; catches regressions of the barrier class under explicit GC.

function out(s){ print(s); }
if (typeof gc !== "function") { out("RESULT gc-exposed: false (need --exposeGC-style shell)"); }
else {
  out("RESULT gc-exposed: true");
  let anomalies = 0;

  // A: unshift-heavy growth with GC between waves (f641af0b shape)
  function unshiftWaves() {
    const a = [];
    const sentinel = { tag: "S" };
    for (let wave = 0; wave < 40; wave++) {
      for (let i = 0; i < 200; i++) a.unshift({ w: wave, i, s: sentinel });
      gc();
    }
    let bad = 0;
    for (const el of a) { if (!el || el.s !== sentinel || el.s.tag !== "S") bad++; }
    return bad;
  }
  anomalies += unshiftWaves();
  out("RESULT unshift-waves-bad-elements(0): " + (anomalies === 0));

  // B: property-store pattern after allocation churn (MultiPutByOffset realloc shape)
  function propChurn() {
    let bad = 0;
    for (let round = 0; round < 30; round++) {
      const holder = { a: 1 };
      const fresh = [];
      for (let i = 0; i < 50; i++) { holder["p" + i] = { r: round, i }; fresh.push(holder["p" + i]); }
      gc();
      for (let i = 0; i < 50; i++) { if (!holder["p" + i] || holder["p" + i].r !== round) bad++; }
    }
    return bad;
  }
  const b2 = propChurn();
  out("RESULT prop-churn-bad(0): " + (b2 === 0));

  // C: hot loop through JIT tiers with GC mid-flight (DFG/FTL on)
  function jitLoop() {
    const arr = new Array(1000).fill(0).map((_, i) => ({ v: i }));
    let sum = 0;
    for (let it = 0; it < 200000; it++) {
      if (it === 100000) gc();
      const o = arr[it % 1000];
      sum = (sum + o.v) >>> 0;
    }
    const expect = (() => { let s = 0; for (let it = 0; it < 200000; it++) s = (s + (it % 1000)) >>> 0; return s; })();
    return sum === expect;
  }
  out("RESULT jit-loop-consistent: " + jitLoop());
  out("RESULT poc004-done: true");
}
