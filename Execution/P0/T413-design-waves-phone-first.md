# T413: the design waves check the phone first, on emulated devices

## Task ID

T413

## Date

2026-10-07

## What changed

The owner asked whether the design waves V1 to V6 (T369) consider the mobile view, and then asked for a stricter rule. Before this task every session looked at a desktop browser narrowed to 380 px: no touch, no device pixel ratio, no Safari engine, and nothing about landscape, the on-screen keyboard, safe areas or a collapsing address bar. Now every one of the 43 session prompts carries a "Phone first" block in the shared design wave rules, and each session checks three emulated devices with Playwright's device descriptors: an iPhone 13 in WebKit (the Safari engine), a Pixel 5 in Chromium plus a 360 by 740 small-Android pass, and a 1280 by 800 desktop. On the phones each session checks landscape, tap-only use, the on-screen keyboard (input focused, viewport 40 percent shorter), the safe areas, dvh instead of vh for full-height layouts, thumb reach of the main action, tap targets, and that no swipe is the only way to do something.

Each surface header now has an "On a phone" line saying what the phone moment on that surface is, for example the day planner used standing in the street and the outdoor pages opened again at the trailhead. The V1 briefs walk the phones first and write each plan item phone first; the V2 direction gains a phone section (breakpoints, safe areas, dvh, the thumb zone, gestures, landscape, the keyboard, and what desktop adds); V5 checks every phone rule on both phones; V6 plays the whole journey on the iPhone first, and the release opens the preview on all three devices and pairs the gallery by device. Screenshot names end in the device instead of a width.

WebKit was not installed in the Playwright cache (only Chromium). It is now (webkit-2359), and an emulated iPhone 13 loaded the app at 390 px wide. Sessions are told never to run a browser install themselves. WebKit on Windows is close to iOS Safari but not the same, so each session lists what only a real phone can prove in an owner row.

## Files touched

**Modified:**
- Execution/_queue/design_waves.py (the phone block, the PHONE line per surface, the device wording in V1, V2, V5 and V6)
- Execution/_WAVES.md (regenerated)
- Execution/_OPEN.md (row T413-a)

**Created:**
- Execution/P0/T413-design-waves-phone-first.md

Outside the repos: the Playwright WebKit browser in %LOCALAPPDATA%\ms-playwright\webkit-2359.

## Commands run

```
npx playwright install webkit
node <scratch probe>        # WebKit, devices['iPhone 13'], ?tab=places: [390, 664, 0, page title]
python Execution/_queue/waves_md.py
```

## Config and secrets set

None.

## Before/after measurements

| Measure | Before | After | Source |
|---|---|---|---|
| Session prompts with the phone rules | 0 of 43 | 43 of 43 | grep "Phone first (T413)" in _WAVES.md |
| Surface headers with an "On a phone" line | 0 of 40 | 40 of 40 | grep in _WAVES.md |
| Browser engines in the Playwright cache | 1 (Chromium) | 2 (Chromium, WebKit) | %LOCALAPPDATA%\ms-playwright |

## What broke and how it was fixed

Nothing broke.

## What is still open

Emulation is not a phone. After V6, the owner opens the preview on a real iPhone and a real Android phone (T413-a); each session will also have listed its own real-phone checks in an owner row.

## Rollback procedure

Revert the T413 merge commit on main and regenerate _WAVES.md with `python Execution/_queue/waves_md.py`. WebKit can stay in the cache or be removed with `npx playwright uninstall` (it removes every browser).
