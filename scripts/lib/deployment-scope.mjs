/** Only generated JSON can reuse a previously successful application-code check. */
export function dataOnlyChanges(paths) {
  return Array.isArray(paths) && paths.every(name=>typeof name==='string'
    && /^public\/data\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.json$/.test(name));
}
