import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const [directory, limit = '2', base = 'http://127.0.0.1:3001'] = process.argv.slice(2);
const count = Number(limit);
if (!directory || !Number.isInteger(count) || count < 1) {
  console.error('Usage: node evaluate.mjs <dataset-directory> [photos-per-class] [app-url]');
  process.exit(1);
}

const classes = new Map([
  ['earlyblight', 'early_blight'],
  ['healthy', 'no_visible_symptoms'],
  ['septorialeafspot', 'uncertain']
]);
const mimeTypes = new Map([['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['png', 'image/png']]);
const samples = new Map();

async function collect(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const label = path.split(/[\\/]/).at(-1).toLowerCase().replace(/[^a-z]/g, '');
  if (label.startsWith('tomato') && classes.has(label.slice(6))) {
    const images = entries.filter(entry => entry.isFile() && mimeTypes.has(entry.name.split('.').at(-1).toLowerCase()))
      .map(entry => join(path, entry.name));
    samples.set(label, [...(samples.get(label) || []), ...images]);
  }
  for (const entry of entries) {
    if (entry.isDirectory()) await collect(join(path, entry.name));
  }
}

await collect(directory);
for (const label of classes.keys()) {
  if (!samples.get('tomato' + label)?.length) throw new Error('Missing class: tomato ' + label);
}

const status = await fetch(new URL('/api/status', base), { signal: AbortSignal.timeout(5000) });
if (!status.ok || !(await status.json()).live) throw new Error('Start the app with a Gemini API key first.');

const totals = { correct: 0, incorrect: 0, abstained_on_supported_case: 0, api_errors: 0 };
for (const [label, files] of samples) {
  const expected = classes.get(label.slice(6));
  files.sort();
  // Sample across the sorted list so the run is reproducible.
  const sampleCount = Math.min(count, files.length);
  for (let index = 0; index < sampleCount; index++) {
    const file = files[Math.floor((index + 0.5) * files.length / sampleCount)];
    try {
      const response = await fetch(new URL('/api/analyze', base), {
        method: 'POST',
        headers: { 'Content-Type': mimeTypes.get(file.split('.').at(-1).toLowerCase()) },
        body: await readFile(file),
        signal: AbortSignal.timeout(55000)
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const { label: actual } = await response.json();
      const outcome = actual === expected ? 'correct' :
        actual === 'uncertain' ? 'abstained_on_supported_case' : 'incorrect';
      totals[outcome]++;
      console.log(JSON.stringify({ file, expected, actual, outcome }));
    } catch (error) {
      totals.api_errors++;
      console.log(JSON.stringify({ file, expected, error: error.message }));
    }
  }
}
console.log(JSON.stringify({ dataset: 'PlantVillage', ...totals }));
if (totals.api_errors) process.exitCode = 1;
