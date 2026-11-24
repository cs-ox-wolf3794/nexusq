import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps unit fixtures independent of mutable production publications',()=>{
  const directory=new URL('./',import.meta.url);
  // publication.test exercises the actual publication contract intentionally;
  // all branch/behavior tests use explicit, deterministic inputs instead.
  for(const name of readdirSync(directory).filter(name=>name.endsWith('.test.ts')&&!['publication.test.ts','fixture-isolation.test.ts'].includes(name))) {
    expect(readFileSync(new URL(name,directory),'utf8'),`${name} must use fixed test inputs`).not.toMatch(/(?:readFile(?:Sync)?|new URL)\s*\([^;\n]*public\/data|from\s*['"][^'"]*public\/data/);
  }
});
