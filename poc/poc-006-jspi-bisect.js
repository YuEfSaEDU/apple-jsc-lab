//@flags: --useJSPI=true
// PoC 006 — HYP-AP-JSPI-01 bisection: "JSPI stack scan failed: expected WasmToJS, got a non-Wasm frame"
// Thrown by poc-002 on t4 (suspension under 200-deep JS recursion) and t5 (500 concurrent suspensions).
// Goal: minimal repro + boundary (depth 1? 2? N concurrent?), and whether repetition ever escalates
// beyond a clean JS Error (crash hunt). Every line is verbatim truth from the run.

function out(s){ print(s); }
const R = (k,v) => out("RESULT " + k + ": " + v);

const bytes = new Uint8Array([0,97,115,109,1,0,0,0,1,6,1,96,1,127,1,127,2,11,1,3,101,110,118,3,105,110,99,0,0,3,2,1,0,7,7,1,3,114,117,110,0,0,10,8,1,6,0,32,0,16,0,11]);
const mod = new WebAssembly.Module(bytes);
const suspending = new WebAssembly.Suspending((x) => Promise.resolve(x + 1));
const inst = new WebAssembly.Instance(mod, { env: { inc: suspending } });
const promisingRun = WebAssembly.promising(inst.exports.run);

const attempt = (label, fn) => fn.then(
  v => R(label, "resolved " + v),
  e => R(label, "rejected " + e)
);

(async () => {
  // B1: baseline (control) — flat call
  await attempt("b1-flat-call", promisingRun(41));

  // B2: suspension with ONE intervening JS frame
  await attempt("b2-one-js-frame", (async () => { const inner = promisingRun(10); return (0,eval)("1"), inner; })());

  // B3: depth-controlled JS recursion below the promising call
  for (const depth of [1, 2, 5, 50, 200]) {
    const go = (d) => d === 0 ? promisingRun(depth) : go(d - 1);
    await attempt("b3-depth-" + depth, go(depth));
  }

  // B4: JS frames ABOVE the promising call (promise callback runs later, stack unwound)
  await attempt("b4-js-above", new Promise((res) => setTimeout(() => promisingRun(7).then(res, e => res("inner-rejected: " + e)), 0)).then(v => "outer " + v, e => "outer-rejected " + e));

  // B5: concurrency sweep
  for (const n of [2, 10, 100, 500, 2000]) {
    const ps = [];
    for (let i = 0; i < n; i++) ps.push(promisingRun(i));
    await attempt("b5-concurrent-" + n, Promise.all(ps).then(vs => "all " + vs.length + " last=" + vs[vs.length-1]));
  }

  // B6: repeat the failing shape (t4-style) — crash hunt (clean rejections expected)
  let rejected = 0, resolved = 0;
  for (let round = 0; round < 200; round++) {
    const go = (d) => d === 0 ? promisingRun(round) : go(d - 1);
    await go(200).then(() => resolved++, () => rejected++);
  }
  R("b6-repeat-200-rounds", "resolved=" + resolved + " rejected=" + rejected);

  // B7: recursion + concurrency combined (worst case)
  const ps = [];
  for (let i = 0; i < 50; i++) {
    const go = (d) => d === 0 ? promisingRun(i) : go(d - 1);
    ps.push(go(100));
  }
  await attempt("b7-combined", Promise.all(ps).then(vs => "all " + vs.length));

  R("poc006-done", "true");
})();
