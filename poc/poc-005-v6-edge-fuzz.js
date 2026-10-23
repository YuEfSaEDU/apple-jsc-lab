//@flags: --useFTLJIT=true
// PoC 005 — HYP-AP-V6 differential fuzz: KnownCellUse edge group (SkipScope/GetGetter/GetSetter/
// UnwrapGlobalProxy) under polymorphic inlining + tier-up + GC pressure.
// Shape mirrors CVE-2025-31206's PoC class (2a545562709): alternating object shapes driving an
// inlined edge past its FixupPhase assumption. Oracle: crash / any output line is verbatim truth.

function out(s){ print(s); }
let sink = 0;

// --- Lane 1: GetGetter/GetSetter via getOwnPropertyDescriptor fast paths ---
function lane1(arg) {
  const d = Object.getOwnPropertyDescriptor(arg, "x");
  if (d) { sink += (d.get ? 1 : 0) + (d.set ? 2 : 0) + (typeof d.value === "number" ? 4 : 0); }
  return sink;
}
const withAccessor = {};
Object.defineProperty(withAccessor, "x", { get: function(){ return 1; }, set: function(v){ sink += v; }, configurable: true });
const plainObj = { x: 41 };
const plainObjB = { x: 42, y: 43 };
for (let i = 0; i < 200000; i++) {
  lane1(withAccessor); lane1(plainObj); lane1(plainObjB);
  if (i === 100000) { if (typeof gc === "function") gc(); }
}

// --- Lane 2: SkipScope via with-statement scope chains + closures ---
function lane2(o) {
  with (o) { return (function(){ try { return x + (typeof arguments).length; } catch (e) { return 0; } })(); }
}
// NOTE: parse guard below — with-scope lane must be syntactically isolated
try {
  const scopeObj = { x: 7 };
  for (let i = 0; i < 100000; i++) { sink += lane2(scopeObj); lane2({ x: i & 7 }); }
} catch (e) { out("lane2 setup: " + e); }

// --- Lane 3: 290834-style alternating-shape inlining churn ---
function lane3(arg) {
  return arg.test ? (arg.test.length | 0) : 0;
}
for (let i = 0; i < 100000; i++) {
  lane3({ test: "padEnd" });
  lane3(/123/);
  lane3(new String("zz"));
  lane3({ test: { length: 3 } });
  if ((i & 8191) === 0 && typeof gc === "function") gc();
}

// --- Lane 4: UnwrapGlobalProxy — cross-realm global access via Proxy(globalThis)-like churn ---
const realmProxy = new Proxy(globalThis, {});
function lane4(g) { return g.Math ? g.Math.floor(1.5) : 0; }
for (let i = 0; i < 100000; i++) { sink += lane4(globalThis); sink += lane4(realmProxy); }

out("RESULT v6-fuzz-completed(no-crash): true sink=" + sink);
