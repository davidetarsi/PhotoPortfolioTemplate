// Batch orchestration: names assigned upfront, fixed-concurrency pool,
// manifest written ONCE at end of batch, beforeunload guard in between.
import { normalizeFilename, assignUniqueName } from './naming.js';

/**
 * Attaches a beforeunload guard to prevent accidental page close during upload.
 * @param {Window} [win] - Window object (default: window).
 * @returns {Function} Detach function to remove the guard.
 */
export function attachBeforeUnloadGuard(win = window) {
  const handler = e => { e.preventDefault(); e.returnValue = ''; };
  win.addEventListener('beforeunload', handler);
  return () => win.removeEventListener('beforeunload', handler);
}

/**
 * Runs a batch upload with fixed concurrency and progress tracking.
 * Prevents page close during upload and writes manifest once at end.
 * @param {Object} config - Configuration object.
 * @param {Array<File>} config.files - Files to upload.
 * @param {Array<Object>} config.existingManifest - Existing photo manifest entries.
 * @param {Function} config.processFile - Async processor for each file.
 * @param {Function} config.uploadPhoto - Async uploader(name, blob).
 * @param {Function} config.putManifest - Async manifest writer(entries).
 * @param {Function} [config.onProgress] - Progress callback(name, status).
 * @param {Function} [config.attachGuard] - Guard attacher function.
 * @param {number} [config.concurrency] - Number of concurrent uploads (default: 3).
 * @returns {Promise<{uploaded: Array, failed: Array, manifest: Array}>} Upload results.
 */
export async function runBatch({
  files,
  existingManifest,
  processFile,
  uploadPhoto,     // async (name, blob) => void
  putManifest,     // async (entries) => void
  onProgress = () => {},
  attachGuard = attachBeforeUnloadGuard,
  concurrency = 3,
}) {
  // 1. Names assigned BEFORE any upload: dedup across manifest ∪ batch.
  const taken = new Set(existingManifest.map(e => e.name));
  const jobs = files.map(f => {
    const name = assignUniqueName(normalizeFilename(f.name), taken);
    taken.add(name);
    return { file: f, name };
  });

  const uploaded = [];
  const failed = [];
  const detach = attachGuard();
  try {
    // 2. Fixed-concurrency pool.
    let next = 0;
    async function workerLoop() {
      while (next < jobs.length) {
        const job = jobs[next++];
        try {
          onProgress(job.name, 'processing');
          const { blob, width, height, capturedAt, uploadedAt } = await processFile(job.file);
          onProgress(job.name, 'uploading');
          await uploadPhoto(job.name, blob);
          uploaded.push({ job, entry: { name: job.name, width, height, capturedAt, uploadedAt } });
          onProgress(job.name, 'done');
        } catch (error) {
          console.error(`Upload of ${job.name} failed:`, error);
          failed.push({ name: job.name, file: job.file, error });
          onProgress(job.name, 'failed');
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, workerLoop));

    // 3. Manifest: file selection order, only successful uploads, ONE write.
    const jobIndex = new Map(jobs.map((j, i) => [j, i]));
    uploaded.sort((a, b) => jobIndex.get(a.job) - jobIndex.get(b.job));
    const entries = uploaded.map(u => u.entry);
    const manifest = [...existingManifest, ...entries];
    await putManifest(manifest);
    return { uploaded: entries, failed, manifest };
  } finally {
    detach();
  }
}
