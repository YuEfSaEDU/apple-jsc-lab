# apple-jsc-lab — executed-proof harness for Apple Security Bounty (WebKit/JavaScriptCore)

Public-CI proof-of-run lab per reproducible-evidence discipline. No vendor accounts, no network
traffic to Apple: every PoC is plain JS run by a `jsc` shell built from the public WebKit source
at the commit pinned in `webkit-version.txt` (audited base for the accompanying report).

## Convention
- `poc/*.js` files run in filename order; each prints `RESULT <claim>: true|false` lines and a
  non-zero exit code on unexpected behavior.
- The GitHub Actions run URL + verbatim log block are attached to the report as the executed proof.
- `poc-000-sanity.js` is the CONTROL scenario (must always pass); candidate PoCs are the ATTACK
  scenario and print what the engine actually did (crash/OOB/incorrect result), never an assumption.

## Reproduce locally (Linux)
```
sudo apt install cmake ninja-build ruby-full python3 perl gperf bison flex libicu-dev pkg-config
git clone https://github.com/WebKit/WebKit.git && cd WebKit
git checkout $(cat ../webkit-version.txt 2>/dev/null || echo main)
./Tools/Scripts/build-jsc --jsc-only --release
./WebKitBuild/Release/bin/jsc ../poc/poc-000-sanity.js
```
