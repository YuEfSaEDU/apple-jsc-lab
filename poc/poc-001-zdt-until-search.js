//@flags: --useTemporal=true
// PoC 001 — HYP-AP-J01 probe: Temporal.ZonedDateTime.until() release-noop assertion.
// NOTE (post-triage 2026-10-23): J01 is Bugzilla-class (spec-correctness only) — this PoC
// is kept as a pipeline validator (control-vs-attack + RESULT lines), NOT a bounty claim.
// CONTROL: known-good UTC pair with hand-computed duration must match exactly.
// ATTACK: skew/high-offset zones x range-edge instants, largestUnit year|month.
// Oracle: sign(duration fields) must equal sign(epochNs(B) - epochNs(A)); any mismatch is an anomaly.

function signOf(v) {
    // Duration fields may be Number or BigInt depending on engine revision — normalize.
    if (typeof v === "bigint") return v < 0n ? -1 : (v > 0n ? 1 : 0);
    return v < 0 ? -1 : (v > 0 ? 1 : 0);
}

function check(label, zdtA, zdtB, largestUnit) {
    let out;
    try {
        out = zdtA.until(zdtB, { largestUnit });
    } catch (e) {
        return false; // RangeError = documented behavior
    }
    try {
        const ns = zdtB.toInstant().epochNanoseconds.subtract(zdtA.toInstant().epochNanoseconds);
        const nsSign = signOf(ns);
        const fields = ["years","months","weeks","days","hours","minutes","seconds","milliseconds","microseconds","nanoseconds"];
        let durSign = 0;
        for (const f of fields) {
            const s = signOf(out[f]);
            if (s !== 0) { if (durSign !== 0 && durSign !== s) { durSign = 2; } else { durSign = s; } }
        }
        const consistent = (durSign === 2) ? false : (durSign === nsSign);
        if (!consistent) {
            print("ANOMALY " + label + " largestUnit=" + largestUnit +
                  " nsDiff=" + ns.toString() +
                  " dur[y,m,d]=" + out.years + "," + out.months + "," + out.days);
            return true;
        }
        return false;
    } catch (e) {
        print("HARNESS-ERR " + label + " " + e);
        return false;
    }
}

// ---- CONTROL ----
let controlOk = true;
try {
    const a = Temporal.ZonedDateTime.from("2020-01-01T00:00:00+00:00[UTC]");
    const b = Temporal.ZonedDateTime.from("2021-03-05T06:30:00+00:00[UTC]");
    const d = a.until(b, { largestUnit: "year" });
    const ok = String(d.years) === "1" && String(d.months) === "2" && String(d.days) === "4" &&
               String(d.hours) === "6" && String(d.minutes) === "30";
    print("RESULT control(UTC until exact): " + ok);
    controlOk = ok;
} catch (e) {
    print("RESULT control(UTC until exact): false (" + e + ")");
    controlOk = false;
}

// ---- ATTACK ----
const ZONES = [
    "UTC","Antarctica/Casey","Asia/Kathmandu","Pacific/Chatham","Australia/Lord_Howe",
    "Pacific/Apia","Pacific/Pago_Pago","Pacific/Kiritimati","Asia/Colombo","Asia/Tehran",
    "Asia/Kabul","Asia/Yangon","Australia/Eucla","Pacific/Marquesas","Pacific/Gambier",
    "America/St_Johns","Asia/Kolkata","Africa/Cairo","America/Santiago","Australia/Adelaide",
    "Asia/Gaza","Europe/Dublin","Antarctica/Troll","Pacific/Norfolk","Asia/Jerusalem",
    "America/Havana","Australia/Sydney","Pacific/Auckland","America/Asuncion","Asia/Baku"
];
const DAYNS = 86400000000000n;
const NEAR_MAX = 99999999n * DAYNS;
const NEAR_MIN = -99999999n * DAYNS;
const EDGE_OFFSETS = [0n, 1n, 3600000000000n, -3600000000000n, DAYNS - 1n, -(DAYNS - 1n), 5400000000000n, -5400000000000n];

let anomalies = 0, tried = 0;
for (const zone of ZONES) {
    for (const base of [NEAR_MAX, NEAR_MIN, 0n, 50000000n * DAYNS, -50000000n * DAYNS]) {
        for (const off of EDGE_OFFSETS) {
            for (const off2 of [1n, DAYNS + 1n, -1n, -(DAYNS + 1n)]) {
                let a, b;
                try {
                    a = new Temporal.ZonedDateTime(base + off, zone);
                    b = new Temporal.ZonedDateTime(base + off + off2, zone);
                } catch (e) { continue; }
                for (const lu of ["year", "month"]) {
                    tried++;
                    if (check(zone, a, b, lu)) anomalies++;
                }
            }
        }
    }
}
print("tried=" + tried + " anomalies=" + anomalies);
print("RESULT zdt-until-consistency-anomaly-found: " + (anomalies > 0));
print("RESULT harness-control: " + controlOk);
if (!controlOk) throw new Error("control failed");
