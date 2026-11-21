import path from "node:path";
import { buildManifest, validateSnapshot, verifyManifest } from "./lib/snapshot.mjs";

const directory = path.resolve(process.env.NEXUSQ_DATA_DIR ?? "public/data");
await validateSnapshot(directory);
if (process.argv.includes("--manifest")) await buildManifest(directory);
await verifyManifest(directory);
console.log("Validated catalog, observations, QC and forecast consistency.");
