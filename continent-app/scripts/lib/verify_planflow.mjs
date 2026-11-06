// T1089: shared driver for the one-question Plan flow (src/planner/flow). Every
// question screen has an h2.pf-title and one primary Continue (the first screen
// "Skip, ask me"). stepToTitle presses it until the screen titled `re` shows.
export async function startNewTrip(page, base) {
  await page.goto(`${base.replace(/\/$/, '')}/?tab=plan`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('.pf-open-start').first().click({ timeout: 60000 });
  await page.locator('h2.pf-title').first().waitFor({ timeout: 30000 });
}

export async function stepToTitle(page, re, max = 14) {
  for (let i = 0; i < max; i += 1) {
    const t = (await page.locator('h2.pf-title').first().textContent({ timeout: 30000 }).catch(() => '')) || '';
    if (re.test(t)) return t;
    const next = page.locator('.btn-primary.btn-block:visible').first();
    await next.click({ timeout: 15000 });
    await page.waitForTimeout(700);
  }
  throw new Error(`never reached a screen titled ${re}`);
}
