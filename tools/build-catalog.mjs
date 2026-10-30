#!/usr/bin/env node
/**
 * Build `data/models.json` — the offline snapshot of Puter's model catalogue.
 *
 * Source: https://api.puter.com/puterai/chat/models/details
 * (the exact endpoint `puter.ai.listModels()` calls).
 *
 *   node tools/build-catalog.mjs            # fetch and write
 *   node tools/build-catalog.mjs --input x.json
 */
import { readFile, writeFile } from 'node:fs/promises';
import { buildCatalog } from '../js/lib/catalog.js';

const SOURCE = 'https://api.puter.com/puterai/chat/models/details';
const args = process.argv.slice(2);
const inputFlag = args.indexOf('--input');
const inputPath = inputFlag !== -1 ? args[inputFlag + 1] : null;

async function loadPayload() {
  if (inputPath) {
    return JSON.parse(await readFile(inputPath, 'utf8'));
  }
  const res = await fetch(SOURCE, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`catalogue fetch failed: HTTP ${res.status}`);
  return res.json();
}

function trim(model) {
  const description = model.description
    ? model.description.replace(/\s+/g, ' ').slice(0, 420).trim()
    : null;
  return {
    key: model.key,
    id: model.id,
    name: model.name,
    vendor: model.vendor,
    providers: model.providers,
    primaryProvider: model.primaryProvider,
    context: model.context,
    maxTokens: model.maxTokens,
    toolCall: model.toolCall,
    modalities: model.modalities,
    inputPrice: model.inputPrice,
    outputPrice: model.outputPrice,
    free: model.free,
    reasoning: model.reasoning,
    effort: model.effort,
    description,
    releaseDate: model.releaseDate,
    knowledge: model.knowledge,
    openWeights: model.openWeights,
    responsesApi: model.responsesApi,
    offers: model.offers,
  };
}

const payload = await loadPayload();
const entries = Array.isArray(payload) ? payload : payload.models ?? [];
const catalog = buildCatalog(entries, { generatedAt: new Date().toISOString(), source: SOURCE });
catalog.models = catalog.models.map(trim);
catalog.stats = {
  models: catalog.models.length,
  vendors: [...new Set(catalog.models.map((m) => m.vendor))].length,
  withEffort: catalog.models.filter((m) => m.effort.mode === 'reasoning_effort' || m.effort.mode === 'thinking').length,
  fixedReasoning: catalog.models.filter((m) => m.effort.mode === 'fixed').length,
  free: catalog.models.filter((m) => m.free).length,
};

await writeFile(new URL('../data/models.json', import.meta.url), JSON.stringify(catalog));
console.log(
  `wrote data/models.json — ${catalog.stats.models} models from ${catalog.totalEntries} catalogue entries`,
  catalog.stats,
);
