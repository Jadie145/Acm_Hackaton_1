import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, extname, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const [input, limit = '2', base = 'http://127.0.0.1:3000'] = args.filter(arg => arg !== '--dry-run');
const count = Number(limit);
if (!input || !Number.isSafeInteger(count) || count < 1) {
  console.error('Usage: node evaluate.mjs <dataset-directory-or-image> [photos-per-label] [app-url] [--dry-run]');
  process.exit(1);
}

const mimeTypes = new Map([['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp']]);
const root = resolve(input);
const single = (await stat(root)).isFile();
const groups = new Map();
const discovered = new Map();
const unknown = new Set();

function expectedLabel(name) {
  const normalized = name.toLowerCase().replace(/[^a-z]/g, '');
  if (/^tomato(?:leaf)?earlyblight(?:leaf)?$/.test(normalized)) return 'early_blight';
  if (/^tomato(?:healthy(?:leaf)?|leaf(?:healthy)?)$/.test(normalized)) return 'no_visible_symptoms';
  if (/^tomato(?:leaf)?(?:septorialeafspot|bacterialspot|lateblight|leafmold|mold|spidermites(?:twospottedspidermite)?|targetspot|(?:tomato)?mosaicvirus|(?:tomato)?yellowleafcurlvirus|yellowvirus)(?:leaf)?$/.test(normalized)) return 'uncertain';
}

function record(file) {
  const mime = mimeTypes.get(extname(file).toLowerCase());
  if (!mime) return;
  const sourceFolder = basename(dirname(file));
  let folder = dirname(file);
  let expected = expectedLabel(basename(folder));
  while (!expected && (single || folder !== root) && dirname(folder) !== folder) {
    folder = dirname(folder);
    expected = expectedLabel(basename(folder));
  }
  const classFolder = expected ? basename(folder) : null;
  const row = { file, relativePath: relative(single ? dirname(root) : root, file), sourceFolder, classFolder, expected: expected ?? null };
  const folderPath = dirname(file);
  const previous = discovered.get(folderPath);
  if (previous) previous.images++;
  else discovered.set(folderPath, { ...row, images: 1 });
  if (!expected) unknown.add(folderPath);
  if (expected || single) {
    const group = groups.get(expected) ?? [];
    group.push({ ...row, mime });
    groups.set(expected, group);
  }
}

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (entry.isFile()) record(path);
  }
}

if (single) record(root);
else await collect(root);
if (unknown.size) console.warn('No label mapping for image folders:', JSON.stringify([...unknown].sort()));
if (dryRun) {
  for (const row of discovered.values()) console.log(JSON.stringify(row));
  console.log(JSON.stringify({ root, folders: discovered.size, mappedImages: [...groups].filter(([label]) => label).reduce((sum, [, files]) => sum + files.length, 0) }));
}
if (!groups.size) {
  console.error('No evaluable images. Discovered image folders:', JSON.stringify([...discovered.keys()].sort()));
  process.exit(1);
}
if (dryRun) process.exit(0);

const status = await fetch(new URL('/api/status', base), { signal: AbortSignal.timeout(5000) });
if (!status.ok || !(await status.json()).live) throw new Error('Start the app with GEMINI_API_KEY and check the evaluator URL.');

const totals = { correct: 0, incorrect: 0, abstained_on_supported_case: 0, api_errors: 0, unscored: 0 };
for (const [expected, files] of groups) {
  files.sort((left, right) => left.file.localeCompare(right.file));
  const sampleCount = Math.min(count, files.length);
  const selected = Array.from({ length: sampleCount }, (_, index) =>
    files[Math.floor((index + 0.5) * files.length / sampleCount)]);
  if (expected === 'uncertain' && !selected.some(row => /septoria/i.test(row.classFolder))) {
    const septoria = files.find(row => /septoria/i.test(row.classFolder));
    if (septoria) selected[0] = septoria;
  }
  for (const { mime, ...row } of selected) {
    try {
      const response = await fetch(new URL('/api/analyze', base), {
        method: 'POST', headers: { 'Content-Type': mime }, body: await readFile(row.file),
        signal: AbortSignal.timeout(55000)
      });
      const result = await response.json();
      if (!response.ok) {
        totals.api_errors++;
        console.log(JSON.stringify({ ...row, outcome: 'api_errors', status: response.status, ...result }));
        continue;
      }
      const { label: actual, ...diagnostics } = result;
      if (!['early_blight', 'no_visible_symptoms', 'uncertain'].includes(actual)) throw new Error('Invalid prediction label');
      const outcome = !row.expected ? 'unscored' : actual === row.expected ? 'correct' :
        actual === 'uncertain' ? 'abstained_on_supported_case' : 'incorrect';
      totals[outcome]++;
      console.log(JSON.stringify({ ...row, actual, outcome, ...diagnostics }));
    } catch (error) {
      totals.api_errors++;
      console.log(JSON.stringify({ ...row, outcome: 'api_errors', error: error.message }));
    }
  }
}
console.log(JSON.stringify({ root, ...totals }));
if (totals.api_errors) process.exitCode = 1;
