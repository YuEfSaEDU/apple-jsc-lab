// PoC 000 — SANITY / CONTROL
// Purpose: prove the harness pipeline end-to-end (build jsc at pinned commit, run, print verdict lines).
// Expected: RESULT sanity(6*7==42): true  and exit code 0.
const x = 6 * 7;
if (x === 42) {
    print("RESULT sanity(6*7==42): true");
} else {
    print("RESULT sanity(6*7==42): false");
    throw new Error("sanity failed");
}
print("RESULT engine-is-jsc: " + (typeof print === "function"));
