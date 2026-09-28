#!/usr/bin/env node
// Verify the two R2 custom domains resolve and serve the expected object with
// the expected Cache-Control. Exits non-zero if either check fails.
//
// Task: Execution/P3/T044-r2-bucket-and-domains.md
// Run from continent-app/: node scripts/r2/verify.mjs
//
// This script needs no credentials. It only makes plain HTTPS requests to the
// two public custom domains, the same way a browser or the app would.

const checks = [
  {
    label: "img/ (cdn.carta-europetravel.com)",
    url: "https://cdn.carta-europetravel.com/img/_test/hello.txt",
    expectCacheControl: "public, max-age=31536000, immutable",
  },
  {
    label: "data/ (data.carta-europetravel.com)",
    url: "https://data.carta-europetravel.com/data/_test/hello.json",
    expectCacheControl: "public, max-age=300, must-revalidate",
  },
];

async function checkOne(check) {
  const result = { label: check.label, url: check.url, ok: false, reason: "" };
  let res;
  try {
    res = await fetch(check.url, { method: "GET", redirect: "follow" });
  } catch (err) {
    result.reason = `request failed before a response arrived: ${err.message}. This is what a domain that does not resolve yet, or has no DNS/certificate, looks like.`;
    return result;
  }

  const status = res.status;
  const cacheControl = res.headers.get("cache-control") || "";
  await res.arrayBuffer().catch(() => {});

  if (status !== 200) {
    result.reason = `expected HTTP 200, got ${status}`;
    return result;
  }
  if (cacheControl !== check.expectCacheControl) {
    result.reason = `expected Cache-Control "${check.expectCacheControl}", got "${cacheControl || "(none)"}"`;
    return result;
  }
  result.ok = true;
  return result;
}

const results = await Promise.all(checks.map(checkOne));

for (const r of results) {
  if (r.ok) {
    console.log(`PASS  ${r.label}\n      ${r.url}`);
  } else {
    console.log(`FAIL  ${r.label}\n      ${r.url}\n      ${r.reason}`);
  }
}

const failures = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failures}/${results.length} checks passed.`);
process.exit(failures > 0 ? 1 : 0);
