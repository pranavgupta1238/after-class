// Each resource settles independently. A slow staff lookup must not hide reports.
export function createAdminLoader({ request, onChange, timeoutMs = 10000, freshMs = 30000 }) {
  const entries = new Map();
  let generation = 0;
  function load(key, { force = false } = {}) {
    const previous = entries.get(key);
    if (previous?.promise) return previous.promise;
    if (!force && previous?.loaded && Date.now() - previous.updatedAt < freshMs) return Promise.resolve();
    const currentGeneration = generation;
    const controller = new AbortController();
    const entry = { ...previous, loading: true, error: '', controller };
    entries.set(key, entry);
    // Install the promise before notifying the UI, so re-entrant calls deduplicate too.
    entry.promise = Promise.resolve().then(async () => {
      let timer;
      try {
        const data = await Promise.race([
          request(key, controller.signal),
          new Promise((_, reject) => { timer = setTimeout(() => {
            reject(new Error('This is taking too long. Please retry.'));
            controller.abort();
          }, timeoutMs); })
        ]);
        if (currentGeneration !== generation) return;
        Object.assign(entry, { data, loaded: true, updatedAt: Date.now() });
      } catch (error) {
        if (currentGeneration !== generation) return;
        entry.error = error.message || 'Could not load this section.';
      } finally {
        clearTimeout(timer);
        if (currentGeneration === generation) {
          entry.loading = false;
          entry.promise = null;
          onChange(key, entry);
        }
      }
    });
    onChange(key, entry);
    return entry.promise;
  }
  function reset() {
    generation++;
    for (const entry of entries.values()) entry.controller?.abort();
    entries.clear();
  }
  return { load, reset };
}
