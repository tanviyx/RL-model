// Helpers shared by trainQTable.mjs and evaluate.mjs
import path from "path";
import { fileURLToPath } from "url";
import { mulberry32, poisson } from "../services/demand.js";

export const toolsDir = path.dirname(fileURLToPath(import.meta.url));
export const configDir = path.join(toolsDir, "../config");

/** --key value  |  --flag  |  repeated --key a --key b -> array */
export const parseArgs = (argv) => {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    const val = next === undefined || next.startsWith("--") ? true : next;
    if (val !== true) i++;
    out[key] = key in out ? [].concat(out[key], val) : val;
  }
  return out;
};

export const hashSeed = (...parts) => {
  let h = 2166136261;
  for (const ch of parts.join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/**
 * Pre-generate arrivals for `steps` simulated seconds so that every policy in an
 * evaluation sees exactly the same traffic.
 *   rateFn  : (secondsOfDay) -> {ns, ew} veh/s, or null for the synthetic source
 *   spawnRate: per-second arrival chance for the synthetic source
 */
export const genArrivals = ({ rateFn, startSec, steps, rng, spawnRate = 0.4 }) => {
  const ns = new Uint8Array(steps);
  const ew = new Uint8Array(steps);
  for (let t = 0; t < steps; t++) {
    if (!rateFn) {
      ns[t] = rng() < spawnRate ? 1 : 0;
      ew[t] = rng() < spawnRate ? 1 : 0;
    } else {
      const r = rateFn(startSec + t);
      ns[t] = poisson(r.ns, rng);
      ew[t] = poisson(r.ew, rng);
    }
  }
  return { ns, ew };
};

export { mulberry32 };