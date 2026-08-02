import { load, dump } from "js-yaml";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import deepmerge from "@fastify/deepmerge";

const MAP_POOL_FILE = new URL("../map-pools.yml", import.meta.url);
const MAP_POOL_OUTPUT_DIR = new URL(
    process.env.CI ? "../../map-pools-deploy/" : "../output/",
     import.meta.url);

const merger = deepmerge();
const pools = await readFile(MAP_POOL_FILE, "utf-8")
    .then((data) => load(data)) as MapPoolFile;
const groupsAndPools = new Map<string, MapPoolFile>();

// Map#getOrInsert is available natively in Node.js v26+, this polyfill backports it 
// for older versions of Node.js running on dev machines/CI
Map.prototype.getOrInsert ??= function <K, V>(this: Map<K, V>, key: K, defaultValue: V): V {
    if (!this.has(key)) {
        this.set(key, defaultValue);
    }

    return this.get(key) as V;
};


for (const [poolName, mapList] of Object.entries(pools.pools)) {
    const { overrides, groups = ["default"], ...rest } = mapList;
    for (const group of groups) {
        const pool = overrides?.[group] ? merger(rest, overrides[group]) : rest;
        groupsAndPools.getOrInsert(group, {
            pools: {},
        }).pools[poolName] = pool;
    }
}

await mkdir(MAP_POOL_OUTPUT_DIR, { recursive: true });

for (const [group, groupPools] of groupsAndPools.entries()) {
    const outputFile = new URL(`./${group}.yml`, MAP_POOL_OUTPUT_DIR);
    await writeFile(outputFile, dump(groupPools), "utf-8");
    console.log(`Wrote ${outputFile}`);
}

const NOTICE =
`# Map Pools
This branch contains the live files used by backend servers. It is automatically generated from the \`master\` branch. Please, do not edit this branch directly.
`;

await writeFile(new URL("./README.md", MAP_POOL_OUTPUT_DIR), NOTICE);

interface MapList {
    maps: string[] | MapList;
}

interface MapPool {
    groups?: string[];
    maps: string[] | MapList;
    overrides?: Record<string, MapPool>;
}

interface MapPoolFile {
    pools: Record<string, MapPool>;
}
