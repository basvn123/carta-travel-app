/*
 * Ask Carta, on device (T557): the Web Worker that runs the open model.
 *
 * WebLLM (@mlc-ai/web-llm, Apache-2.0) does the WebGPU work here, off the
 * main thread, so the map and the panel stay smooth while the model loads
 * and writes. lib/ask/onDevice.js starts this worker only after the
 * traveller switched the feature on; nothing here is in the main bundle.
 */
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
