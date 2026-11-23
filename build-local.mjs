import { open, readFile, writeFile, rename } from 'node:fs/promises';
import { leafFeatures, classifyLeaf } from './public/leaf-model.mjs';

const [pixels, manifest, mode] = process.argv.slice(2);
const labels = JSON.parse((await readFile(manifest,'utf8')).replace(/^\uFEFF/,''));
if (!Array.isArray(labels) || !labels.some(row => row.crop === 'Tomato') ||
    !labels.some(row => row.crop !== 'Tomato')) {
  throw new Error('Expected PlantVillage images from tomato and other crop folders');
}
const file = await open(pixels);
const bytes = Buffer.alloc(64*64*4);
const rows = [];
try {
  for (const label of labels) {
    const { bytesRead } = await file.read(bytes);
    if (bytesRead !== bytes.length) throw new Error('Missing image pixels');
    rows.push({ ...label, ...leafFeatures(bytes) });
  }
} finally { await file.close(); }
if (mode === '--validate') {
  const model = JSON.parse(await readFile('public/model.json','utf8'));
  const counts = new Map();
  for (const row of rows) {
    const prediction = classifyLeaf(row,model);
    const key = row.crop==='Tomato'?row.condition:'Other crops';
    const stat = counts.get(key) || { cropCorrect:0, conditionCorrect:0, uncertain:0, total:0 };
    stat.total++;
    if (prediction.crop === (row.crop==='Tomato'?'tomato':'other')) stat.cropCorrect++;
    if (prediction.species===row.crop && prediction.condition===row.condition) stat.conditionCorrect++;
    if (prediction.crop==='uncertain' || (row.crop==='Tomato' && prediction.crop==='tomato' && !prediction.condition)) stat.uncertain++;
    counts.set(key,stat);
  }
  console.table(Object.fromEntries(counts));
} else {
  await writeFile('public/model.json.tmp',JSON.stringify(rows));
  await rename('public/model.json.tmp','public/model.json');
  console.log('Built local references:',rows.length);
}
