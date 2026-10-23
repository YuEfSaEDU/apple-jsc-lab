// PoC 001 — HYP-AP-J01: Temporal.ZonedDateTime.until() release-noop assertion probe
// Claim (source): ZonedDateTimeCore.cpp:176-227 — the day-correction loop's `ASSERT(success)`
// is a no-op in release jsc; if a skewed zone keeps adjustedTimeDiff sign == sign for all
// corrected candidates, an unvalidated intermediateDate feeds combineDateAndTimeDuration.
// Observable (if hit): duration result inconsistent with epoch-ns difference of the same pair,
// or an exception other than the documented RangeError paths.
//
// CONTROL: known-good zone (UTC) pair with hand-computed expected duration -> must match exactly.
// ATTACK: skew/high-offset zones x range-edge instants, largestUnit:'year' and 'month'.
// Verdict lines are printed from what the run actually produced.

function check(label, zdtA, zdtB, largestUnit, expectedNsSign) {
    let out;
    try {
        out = zdtA.until(zdtB, { largestUnit });
    } catch (e) {
        // RangeError is a documented behavior for out-of-range durations: record, not a finding.
        print("EX " + label + " " + e.name);
        return false;
    }
    // Sanity invariant: sign of the duration must equal sign of epochNs(B) - epochNs(A).
    const ns = zdtB.toInstant().epochNanoseconds.subtract(zdtA.toInstant().epochNanoseconds);
    // Duration sign via any non-zero field (Temporal.Duration has no total() in all builds).
    let durNeg = false, durPos = false;
    for (const f of ["years","months","weeks","days","hours","minutes","seconds","milliseconds","microseconds","nanoseconds"]) {
        if (out[f] < 0n) durNeg = true;
        if (out[f] > 0n) durPos = true;
    }
    const nsNeg = ns < 0n, nsPos = ns > 0n;
    const consistent = (ns === 0n) ? (!durNeg && !durPos) : (nsNeg === durNeg && nsPos === durPos);
    if (!consistent) {
        print("ANOMALY " + label + " largestUnit=" + largestUnit +
              " nsDiff=" + ns.toString() +
              " dur[y,m,d,h,mi,s]=" + out.years + "," + out.months + "," + out.days + "," + out.hours + "," + out.minutes + "," + out.seconds);
        return true;
    }
    return false;
}

// ---- CONTROL ----
let controlOk = true;
try {
    const a = Temporal.ZonedDateTime.from("2020-01-01T00:00:00+00:00[UTC]");
    const b = Temporal.ZonedDateTime.from("2021-03-05T06:30:00+00:00[UTC]");
    const d = a.until(b, { largestUnit: "year" });
    const ok = d.years === 1n && d.months === 2n && d.days === 4n && d.hours === 6n && d.minutes === 30n;
    print("RESULT control(UTC until exact): " + ok);
    controlOk = ok;
} catch (e) {
    print("RESULT control(UTC until exact): false (" + e + ")");
    controlOk = false;
}

// ---- ATTACK: skew zones x edge instants ----
const ZONES = [
    "UTC","Antarctica/Casey","Asia/Kathmandu","Pacific/Chatham","Australia/Lord_Howe",
    "Pacific/Apia","Pacific/Pago_Pago","Pacific/Kiritimati","Asia/Colombo","Asia/Tehran",
    "Asia/Kabul","Asia/Yangon","Australia/Eucla","Pacific/Marquesas","Pacific/Gambier",
    "America/St_Johns","Asia/Kolkata","Africa/Cairo","America/Santiago","Australia/Adelaide",
    "Asia/Gaza","Europe/Dublin","Antarctica/Troll","Pacific/Norfolk","Asia/Jerusalem",
    "America/Havana","Australia/Sydney","Pacific/Auckland","America/Asuncion","Asia/Baku"
];
// Near-max temporal range: +/- 1e8 days of epoch (273790 years); also mid-range fold/gap dates.
const DAYNS = 86400000000000n;
const NEAR_MAX = 99999999n * DAYNS;   // ~1 day inside the positive edge
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
                } catch (e) { continue; } // out-of-range instant: documented, skip
                tried++;
                for (const lu of ["year", "month"]) {
                    if (check(zone + "@" + base.toString() + "+" + off.toString(), a, b, lu)) anomalies++;
                    tried++;
                }
            }
        }
    }
}
print("tried=" + tried + " anomalies=" + anomalies);
print("RESULT zdt-until-consistency-anomaly-found: " + (anomalies > 0));
if (!controlOk) { print("RESULT harness-control: FAILED"); throw new Error("control failed"); }
print("RESULT harness-control: true");
