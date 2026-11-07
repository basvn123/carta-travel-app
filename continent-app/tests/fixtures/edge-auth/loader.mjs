// T1164 (C10): module resolve hook for the Edge Function auth tests
// (tests/edgeAuth.test.mjs). The Edge Functions are Deno code that import
// `npm:@supabase/supabase-js@2` and `npm:stripe@17`; under Node those two
// specifiers resolve to the local stubs beside this file, so the real
// handlers run with no network and no Supabase project.
const STUBS = {
  'npm:@supabase/supabase-js': new URL('./supabase-stub.mjs', import.meta.url).href,
  'npm:stripe': new URL('./stripe-stub.mjs', import.meta.url).href,
};

export async function resolve(specifier, context, next) {
  for (const [prefix, url] of Object.entries(STUBS)) {
    if (specifier === prefix || specifier.startsWith(`${prefix}@`)) return { url, shortCircuit: true };
  }
  if (specifier.startsWith('npm:') || specifier.startsWith('jsr:') || /^https?:/.test(specifier)) {
    throw new Error(`edge-auth loader: no stub for ${specifier}; add one beside loader.mjs`);
  }
  return next(specifier, context);
}
