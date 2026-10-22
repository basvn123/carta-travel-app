# T557 notes: Ask Carta on device (WebGPU, WebLLM)

Batch T550 to T558, task T557 only. App repo commit `6001479` on `p11-ask-carta` (worktree `wt/p11-ask-carta-app`). Not pushed, not deployed.

## What changed

- `src/lib/ask/onDevice.js` (new, main thread, no React). The module generate.js already expects as `onDevice`.
  - `isSupported(): Promise<boolean>`: `navigator.gpu`, an adapter from `requestAdapter()`, the adapter has `shader-f16` (both q4f16_1 models need it), and `navigator.deviceMemory >= 4` when the browser reports it. Memoised.
  - `isInstalled(): Promise<boolean>`: reads Cache Storage directly (`webllm/model` for `tensor-cache.json` and every shard it lists, `webllm/wasm` for the model library), the same keys WebLLM writes, so the check never loads WebLLM.
  - `install({ onProgress }): Promise<void>`: the only path that downloads. Sets the opt-in, loads WebLLM by dynamic import, starts the worker, loads the model. `onProgress({ progress: 0..1, text })`. Rejects with `reason: 'unsupported'` on a device that fails `isSupported()`.
  - `isReady(): boolean`: engine loaded in this tab.
  - `ensureLoaded({ onProgress }?): Promise<boolean>`: loads from the cache only, and only when opted in, supported and `isInstalled()`; never downloads. The panel should call it on open so `isReady()` turns true without a click.
  - `generate({ system, user, onToken, signal }): Promise<string>`: streams each piece to `onToken`; rejects with `reason: 'off'` when not loaded; honours `AbortSignal` (calls `interruptGenerate()` and rejects with `name: 'AbortError'`); one answer at a time (a new call stops the previous one). `max_tokens` is `MAX_ANSWER_TOKENS` (380) and temperature 0.2, the same as the server. The trailing `/no_think` of the system prompt is dropped (neither model reads it); for Gemma the system text goes into the user turn.
  - `remove(): Promise<void>`: unloads, terminates the worker, deletes the `webllm/model`, `webllm/config` and `webllm/wasm` caches, clears the opt-in.
  - `isOptedIn()`, `setOptIn(on)`: localStorage key `carta.ask.onDevice.v1` (`'1'` or absent), every access in try/catch.
  - `ON_DEVICE_MODEL = { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 1.5B', sizeMb: 845 }`.
  - Also exported for tests and tooling: `MODELS`, `modelBase()`, `modelRecord()`, `appConfig()`, `messagesFor()`, `OPT_IN_KEY`, `DEFAULT_MODEL_BASE`, `LIB_VERSION`.
  - Dev only (`import.meta.env.DEV`): `window.__askOnDevice` with the functions above plus `useModel('qwen'|'gemma')`, `model()` and `timed(system, user)`. Verified absent from the production build.
- `src/lib/ask/onDevice.worker.js` (new): `WebWorkerMLCEngineHandler` from `@mlc-ai/web-llm`, started with `new Worker(new URL('./onDevice.worker.js', import.meta.url), { type: 'module' })`.
- `@mlc-ai/web-llm` `0.2.85` exact (Apache-2.0, checked in its LICENSE; one dependency, `loglevel`, MIT). 0.2.86 exists but is 11 days old; 0.2.85 is six weeks old. `package.json` (one line) and `package-lock.json`.
- Model URLs: `VITE_ASK_MODEL_BASE`, default `https://data.carta-europetravel.com/ask/model/`. WebLLM appends `resolve/main/` to any model URL without a `/resolve/x/` part, so the data host keeps the Hugging Face folder shape:
  - weights: `<base><model id>/resolve/main/<file>`
  - library: `<base>libs/v0_2_84/base/<lib>.wasm` (`LIB_VERSION` is WebLLM 0.2.85's `modelVersion`; a test fails if a package upgrade changes it)
  - `VITE_ASK_MODEL_BASE=hf npm run dev` reads Hugging Face and `raw.githubusercontent.com` instead (dev has no CSP). A base starting with `/` is made absolute with `location.origin`. `VITE_ASK_MODEL=gemma` builds with Gemma instead.
- `public/_headers`: `'wasm-unsafe-eval'` added to `script-src`, a comment bullet in the CSP amendment list, and the stale usage figures corrected (29 rules of 100, CSP line 1,025 of 2,000). Diff of the policy line: `script-src 'self';` became `script-src 'self' 'wasm-unsafe-eval';`. Nothing else. `worker-src 'self' blob:` was already there; `connect-src` already has the data host. The built worker chunk contains no `eval(` or `new Function(`; it does call `WebAssembly.instantiate(Streaming)`, which is what needs the keyword (the worker gets the `/*` CSP from its own response).
- `tests/askOnDevice.test.mjs` (new, 8 tests): opt-in with a fake and a throwing localStorage; `isSupported` false without `navigator.gpu`, without shader-f16, under 4 GB, with no or a throwing adapter, true with all; `generate` rejects when not ready and `ensureLoaded` does nothing when not opted in; model URLs from the default base, a custom base, `hf` and a relative base; `LIB_VERSION` and both library and model ids present in the pinned WebLLM; the `/no_think` and Gemma prompt shape; `isInstalled` against a fake Cache Storage.

## Measurements

Fast NOPUBLIC builds with `wt/vite.t557.mjs` (the app's own config, `publicDir: false`, private cache; `T557_PROBE=1` adds a static import of onDevice.js to `src/main.jsx`, `T557_PROBE=2` a dynamic one, to show what the panel's import will cost). Built from clean temporary worktrees of `master` (ac73e46) and `p11-ask-carta` HEAD (13fe808).

| Build | Entry chunk raw | Entry gzip -9 |
|---|---|---|
| master | 814,483 B | 255,526 B |
| branch before T557 | 814,483 B | 255,534 B |
| with T557, as committed (nothing imports it yet) | 814,483 B | 255,534 B (identical) |
| with T557, panel imports it dynamically (probe 2) | 814,595 B (+112) | 255,579 B (+45) |
| with T557, panel imports it statically (probe 1) | 819,201 B (+4,718) | 257,543 B (+2,009) |

WebLLM is never in the entry. Its chunks, fetched only after the opt-in:

| Chunk | Raw | gzip -9 |
|---|---|---|
| `onDevice-*.js` (this module, when dynamically imported) | 4,677 B | 2,218 B |
| `lib-*.js` (WebLLM on the main thread, for `CreateWebWorkerMLCEngine`) | 5,904,839 B | 2,123,851 B |
| `onDevice.worker-*.js` (WebLLM in the worker) | 6,039,700 B | 2,148,029 B |

Model download, from the Hugging Face file listing: Qwen2.5-1.5B-Instruct-q4f16_1-MLC is 39 files, 839.5 MiB (30 shards), plus a 5.0 MiB library: about 845 MiB. Gemma 2 2B q4f16_1 is 50 files, 1,423.8 MiB (42 shards), plus 5.0 MiB: about 1,429 MiB. WebLLM 0.2.85 ships no Gemma 3 1B build, so Gemma 2 2B is the documented alternative. VRAM per WebLLM's own records: about 1.6 GB (Qwen) and 1.9 GB (Gemma).

`npm test`: 616 of 616 pass (8 new). `npx eslint` on both new source files: clean.

## What broke

- My own cleanup emptied the worktree's `node_modules`. I removed the two temporary build worktrees with `git worktree remove --force` after a `rmdir` of their `node_modules` junction failed on a forward-slash path; git followed the junction and deleted the contents of `wt/p11-ask-carta-app/node_modules` (a real folder there, not a junction as the brief said). I restored it at once with `npm ci` from the lockfile: 230 packages, the same package set as `continent-app/node_modules` plus `@mlc-ai/web-llm` and `loglevel`; only the `.vite`, `.cache` and `.t4xx` cache folders are gone and rebuild on their own. `npm test` after the restore: 616 of 616. Any agent that ran a command in that worktree during the few minutes it was empty may have seen a missing-module error and should simply rerun. Lesson for the next task: delete a junction with `cmd /c rmdir "C:\path\with\backslashes"` and check it is gone before `git worktree remove`.
- Nothing else. The entry chunk is unchanged as committed.

## Still open (for the register)

- **T557-a (user): upload the model to R2.** The data host serves the bucket root (data files sit under `/data/`), so the keys go under `ask/model/` at the bucket root, outside `push-data.mjs`'s `data/` prefix and safe from its prune. With the T045 rclone variables set (`RCLONE_CONFIG_R2_*`), in PowerShell:

  ```powershell
  $id  = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'
  $lib = 'Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm'
  $dir = "C:\carta-ask-model\$id"
  New-Item -ItemType Directory -Force $dir, C:\carta-ask-model\libs | Out-Null
  $files = @('mlc-chat-config.json','tensor-cache.json','ndarray-cache.json','tokenizer.json','tokenizer_config.json','vocab.json','merges.txt') + (0..29 | ForEach-Object { "params_shard_$_.bin" })
  foreach ($f in $files) { curl.exe -fL -o "$dir\$f" "https://huggingface.co/mlc-ai/$id/resolve/main/$f" }
  curl.exe -fL -o "C:\carta-ask-model\libs\$lib" "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/$lib"
  rclone copy $dir "R2:carta/ask/model/$id/resolve/main" --header-upload "Cache-Control: public, max-age=31536000, immutable" --progress
  rclone copyto "C:\carta-ask-model\libs\$lib" "R2:carta/ask/model/libs/v0_2_84/base/$lib" --header-upload "Cache-Control: public, max-age=31536000, immutable" --header-upload "Content-Type: application/wasm"
  curl.exe -sI -H "Origin: https://www.carta-europetravel.com" "https://data.carta-europetravel.com/ask/model/$id/resolve/main/tensor-cache.json"
  curl.exe -sI "https://data.carta-europetravel.com/ask/model/libs/v0_2_84/base/$lib"
  ```

  The two checks must show 200, `access-control-allow-origin` for the site (the bucket CORS in `scripts/r2/data-cors.json` already covers every key for GET and HEAD) and `content-type: application/wasm` on the library. Exact file list for Qwen: `mlc-chat-config.json`, `tensor-cache.json`, `ndarray-cache.json` (older name, kept for safety), `tokenizer.json`, `tokenizer_config.json`, `vocab.json`, `merges.txt`, `params_shard_0.bin` to `params_shard_29.bin`, and the library above: 38 objects, about 845 MiB, well inside R2's free 10 GB. For Gemma (only if the bake-off picks it): `$id = 'gemma-2-2b-it-q4f16_1-MLC'`, `$lib = 'gemma-2-2b-it-q4f16_1_cs1k-webgpu.wasm'`, files `mlc-chat-config.json`, `tensor-cache.json`, `ndarray-cache.json`, `tokenizer.json`, `tokenizer.model`, `tokenizer_config.json`, `params_shard_0.bin` to `params_shard_41.bin`, and build with `VITE_ASK_MODEL=gemma`.
- **T557-b (user): review the CSP change** (`'wasm-unsafe-eval'` in `script-src`, nothing else). It allows WebAssembly compilation on every page, not JavaScript eval. `vercel.json` (the rollback host) is not changed, so on Vercel the on-device answer would fail to load and fall back to the server; harmless.
- **T557-c (next task): the panel must import onDevice.js dynamically.** A static import costs the entry +4.7 KB raw, +2.0 KB gzip (over the 1 KB budget); a dynamic `import('../lib/ask/onDevice.js')` costs +112 B. Read the opt-in key directly (`localStorage.getItem('carta.ask.onDevice.v1') === '1'`) to decide whether to import it at all, then call `ensureLoaded()` and pass the module as `onDevice` to `writeAnswer`. `install()` only from a click that names the size (`ON_DEVICE_MODEL.sizeMb`), and `remove()` from the same control.
- **T557-d (next task): WebLLM ships twice once opted in** (2.1 MB gzip on the main thread for the worker client, 2.1 MB gzip in the worker), because the package is one 6.5 MB module that cannot be tree-shaken to the client. A small hand-written message protocol (the worker runs `MLCEngine` and posts pieces) would remove the main-thread copy. Small next to the 845 MiB model, so not done here.
- **T557-e (user): Gemma licence.** Qwen2.5-1.5B-Instruct is Apache-2.0. Gemma 2 is under Google's Gemma Terms of Use, open weights but not an OSI licence, with use restrictions that pass on to users. Choose Gemma only knowing that; the credit line belongs on the Ask panel either way (UI task).
- **T557-f (next task): `shader-f16` is required for both models.** WebLLM's own Qwen record omits `required_features`, but a q4f16 model needs f16 shaders; I set it so an unsupported device is told no up front. If the end check shows devices without shader-f16 that should qualify, add the q4f32_1 Qwen build (about 1.1 GB) as their model instead.

## Bake-off: Qwen2.5-1.5B against Gemma 2 2B (end check, in the browser)

WebGPU does not run in node, so the comparison runs in desktop Chrome (and one Android phone with WebGPU) on the dev server:

1. `cd wt/p11-ask-carta-app`, then `$env:VITE_ASK_MODEL_BASE='hf'; npm run dev` (or the R2 base once T557-a is done, to test the real path).
2. In the console: `await __askOnDevice.install({ onProgress: (p) => console.log(p.progress, p.text) })`. Note the download time and that a reload followed by `await __askOnDevice.ensureLoaded()` takes no network (Network panel shows no shard requests).
3. Take 18 questions from `tests/fixtures/ask-golden.json`: three per language, mixing find, budget, when and compare. Ask each in the Ask panel. For the numbers, run against the pack the panel built (the UI should expose it in dev as `window.__askLastPack`; if it does not, ask through the panel and time by eye):
   ```js
   const ctx = await import('/src/lib/ask/context.js');
   const ver = await import('/src/lib/ask/verify.js');
   const p = window.__askLastPack;
   const r = await __askOnDevice.timed(ctx.systemPrompt(p.lang), ctx.userPrompt(p));
   const v = ver.verifyAnswer(r.text, p, []);
   ({ model: r.model, firstTokenMs: r.firstTokenMs, totalMs: r.totalMs, withdrawn: v.withdrawn, failed: v.failed?.length })
   ```
4. `await __askOnDevice.useModel('gemma')`, then `install()` again, and repeat step 3 with the same questions.
5. Per model, write down: answers withdrawn by the verifier, sentences kept against written, first piece in ms, whole answer in ms, answers in the wrong language, and memory in the Chrome task manager.
6. Rule: keep Qwen unless Gemma keeps at least 10 points more sentences with at most twice the first-piece time; Qwen downloads 580 MiB less and is Apache-2.0. Finish with `await __askOnDevice.remove()` and check Application > Cache Storage is empty.

## Rollback

`git -C wt/p11-ask-carta-app revert 6001479` removes both modules, the test, the dependency and the CSP keyword in one commit; nothing else depends on them yet (generate.js treats a missing `onDevice` as "use the server"). Then `npm install` to drop the package from `node_modules`. If the model was uploaded: `rclone purge R2:carta/ask/model`. On a traveller's device the files stay in Cache Storage until they press the remove control or clear site data; they are inert without the code.

## What the end check must look at

- The Ask panel at phone and desktop width, in Chrome with WebGPU: the on-device control offers the download with its size and starts nothing by itself; progress shows during install; an answer streams on device (Network panel: no `/api/ask/answer` request); stopping mid-answer works; a new question stops the old one; reload then ask works with no shard requests; remove empties Cache Storage and the next answer comes from the server.
- The same panel in Firefox or Safari without WebGPU (or with `navigator.gpu` missing): no on-device offer, answers from the server.
- A production-like build (`npm run build && npm run preview` is not under the Pages CSP, so check on a preview deploy): the console shows no CSP violation for `wasm-unsafe-eval`, `worker-src` or `connect-src` while installing and answering, and `window.__askOnDevice` is undefined.
- Every other screen once at desktop width to confirm the CSP change broke nothing (map, item page 3D toggle, photos, sign-in).
