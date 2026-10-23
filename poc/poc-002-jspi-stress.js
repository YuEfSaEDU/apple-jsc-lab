//@flags: --useJSPI=true
// PoC 002 — JSPI stack-switching stress (WasmGcAudit latent hazards W1/W2; jsc-provable smoke)
// Targets: suspend/resume lifetimes, throw-during-suspend, nested promising calls, stack limit edges.
// Oracle: no crash, consistent results; prints RESULT lines for what completes.

function out(s){ print(s); }
let ok = 0, fail = 0;
function T(name, fn) {
const bytes = new Uint8Array([0,97,115,109,1,0,0,0,
  1,6,1,96,1,127,1,127,              // type section: content 6: 1 type, (i32)->(i32)
  2,11,1,3,101,110,118,3,105,110,99,0,0, // import env.inc
  3,2,1,0,                            // func 0
  7,7,1,3,114,117,110,0,0,           // export "run"
  10,8,1,6,0,32,0,16,0,11]);         // code: body size 6: local.get 0; call 0; end

T("jspi-available", () => typeof WebAssembly.Suspending === "function" && typeof WebAssembly.promising === "function");

if (typeof WebAssembly.Suspending === "function") {
  const mod = new WebAssembly.Module(bytes);
  let n = 0;
  const suspending = new WebAssembly.Suspending((x) => { n++; return Promise.resolve(x + 1); });
  const inst = new WebAssembly.Instance(mod, { env: { inc: suspending } });
  const promisingRun = WebAssembly.promising(inst.exports.run);
  // T1: basic suspend/resume
  let p1 = promisingRun(41);
  T("t1-basic-is-promise", () => p1 instanceof Promise);
  p1.then(v => {
    out("RESULT t1-resume-value(" + v + "==42): " + (v === 42));
    // T2: rapid nested calls
    return Promise.all([promisingRun(1), promisingRun(2), promisingRun(3)]).then(vs => {
      out("RESULT t2-concurrent([2,3,4]): " + JSON.stringify(vs));
      // T3: rejection propagation through the stack switch
      const bad = new WebAssembly.Suspending(() => Promise.reject(new Error("boom")));
      const inst2 = new WebAssembly.Instance(mod, { env: { inc: bad } });
      const badRun = WebAssembly.promising(inst2.exports.run);
      return badRun(0).then(
        () => out("RESULT t3-rejection-propagated: false (resolved!)"),
        e => out("RESULT t3-rejection-propagated: " + (e.message === "boom")));
    });
  }).catch(e => out("RESULT chain-error: " + e));
  // T4: suspend during deep JS recursion on same stack
  let deep = 0;
  function rec(k){ deep++; return k === 0 ? promisingRun(deep) : rec(k-1); }
  const r = rec(200);
  if (r && r.then) r.then(v => out("RESULT t4-deep-recursion-resume(" + v + "): true")).catch(e => out("RESULT t4: EX " + e));
  // T5: many outstanding suspensions (slicer/assimilate pressure)
  const many = [];
  for (let i = 0; i < 500; i++) many.push(promisingRun(i));
  Promise.all(many).then(vs => {
    let allOk = vs.length === 500 && vs[499] === 500;
    out("RESULT t5-500-outstanding: " + allOk);
    out("RESULT jspi-stress-summary(ok-" + ok + ",fail-" + fail + "): true");
  }).catch(e => out("RESULT t5: EX " + e));
} else {
  out("RESULT jspi-unavailable: true (flag off — pipeline-only)");
}
