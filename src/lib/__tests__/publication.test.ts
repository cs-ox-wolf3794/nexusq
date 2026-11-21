import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { publishSnapshot } from "../../../scripts/lib/snapshot.mjs";

const root = path.resolve("node_modules/.tmp");
async function temporary() { await mkdir(root, { recursive: true }); return mkdtemp(path.join(root, "publication-test-")); }
async function cleanup(directory: string) {
  if (path.dirname(path.resolve(directory)) !== root) throw new Error("Unexpected test path");
  await rm(directory, { recursive: true, force: true });
}
async function hashes(directory: string) {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  return Promise.all(names.map(async (name) => [name, createHash("sha256").update(await readFile(path.join(directory, name))).digest("hex")]));
}

describe("publication failure behavior", () => {
  it("leaves every published byte unchanged when all upstream sources fail", async () => {
    const directory = await temporary();
    try {
      for (const name of (await readdir("public/data")).filter((n) => n.endsWith(".json"))) await copyFile(path.join("public/data", name), path.join(directory, name));
      const before = await hashes(directory);
      const mock = path.join(directory, "offline.mjs");
      await writeFile(mock, "globalThis.fetch = async () => new Response(null, { status: 404 });");
      expect(() => execFileSync(process.execPath, ["--import", "tsx", "--import", pathToFileURL(mock).href, "scripts/refresh-data.mjs"], {
        env: { ...process.env, NEXUSQ_DATA_DIR: directory, EIA_API_KEY: "" }, stdio: "pipe", timeout: 15000,
      })).toThrow();
      expect(await hashes(directory)).toEqual(before);
    } finally { await cleanup(directory); }
  }, 20000);

  it("rejects an invalid staged publication before copying files", async () => {
    const staging = await temporary(), destination = await temporary();
    try {
      await writeFile(path.join(destination, "catalog.json"), "original");
      await writeFile(path.join(staging, "catalog.json"), JSON.stringify({ generated: "one", series: [{ id: "BRENT" }] }));
      await writeFile(path.join(staging, "quality.json"), JSON.stringify({ generated: "two", series: {} }));
      await expect(publishSnapshot(staging, destination)).rejects.toThrow("generations");
      expect(await readFile(path.join(destination, "catalog.json"), "utf8")).toBe("original");
    } finally { await cleanup(staging); await cleanup(destination); }
  });

  it("does not overwrite the day's first-issued ledger record", async () => {
    const directory = await temporary();
    try {
      const history = path.join(directory, "history");
      await mkdir(history);
      const file = path.join(history, `${new Date().toISOString().slice(0, 10)}.json`);
      await writeFile(file, '{"original":"first-issued forecast"}');
      execFileSync(process.execPath, ["--import", "tsx", "scripts/snapshot-signals.ts"], { env: { ...process.env, NEXUSQ_DATA_DIR: directory }, stdio: "pipe" });
      expect(await readFile(file, "utf8")).toBe('{"original":"first-issued forecast"}');
    } finally { await cleanup(directory); }
  });
});
