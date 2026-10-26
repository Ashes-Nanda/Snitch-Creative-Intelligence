// Copies the recorded live analyses (data/ai-analyses.json, written by the local analysis server) into
// public/data/ai-analyses-snapshot.json, so a static deployment can show them without calling a model.
// Run after analysing locally: npm run snapshot:analyses
import { readFileSync, writeFileSync } from 'node:fs'

const source = new URL('../data/ai-analyses.json', import.meta.url)
const target = new URL('../public/data/ai-analyses-snapshot.json', import.meta.url)

const records = Object.values(JSON.parse(readFileSync(source, 'utf8')))
  // A record mid-analysis has no settled result to show.
  .filter((r) => r.status === 'completed' || r.status === 'failed')
  .sort((a, b) => a.creativeId.localeCompare(b.creativeId))

const models = [...new Set(records.map((r) => r.current?.modelVersion).filter(Boolean))]
const analysedAt = records.map((r) => r.current?.createdAt).filter(Boolean).sort()

const snapshot = {
  generatedAt: new Date().toISOString(),
  models,
  analysedFrom: analysedAt[0] ?? null,
  analysedTo: analysedAt.at(-1) ?? null,
  records,
}
writeFileSync(target, `${JSON.stringify(snapshot, null, 2)}\n`)
const completed = records.filter((r) => r.status === 'completed').length
console.log(`Wrote ${records.length} records (${completed} completed) from ${models.join(', ') || 'no model'} to public/data/ai-analyses-snapshot.json`)
