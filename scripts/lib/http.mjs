const UA = "NexusQ/1.0 (public market data snapshots)";

/** Bounded retries include body parsing, not just receipt of HTTP headers. */
export async function get(url, asJson = true, { retries = 3, timeout = 15000, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    let delay = 750 * attempt;
    try {
      const response = await fetchImpl(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(timeout) });
      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        const error = new Error(`HTTP ${response.status}`);
        error.retryable = retryable;
        const retryAfter = Number(response.headers.get("retry-after"));
        if (Number.isFinite(retryAfter) && retryAfter > 0) delay = Math.min(retryAfter * 1000, 15000);
        throw error;
      }
      return await (asJson ? response.json() : response.text());
    } catch (error) {
      if (attempt === retries || error.retryable === false) {
        // Never copy a credential-bearing URL into logs or public health records.
        throw new Error(error.message.replace(/(api_key=)[^&\s]+/gi, "$1[redacted]"));
      }
      await sleep(delay);
    }
  }
}

export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }));
  return results;
}
