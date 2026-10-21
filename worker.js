// worker.js — cleans large texts off the main thread so the page stays responsive (module worker).
import { scanClean } from './cleaner.js';

self.onmessage = (e) => {
  const { id, text, opts } = e.data;
  try {
    const result = scanClean(text, opts, (value) => self.postMessage({ id, type: 'progress', value }));
    self.postMessage({ id, type: 'done', result });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: String((err && err.message) || err) });
  }
};
