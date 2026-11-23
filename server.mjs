import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { buildAdvice } from './crop-advice.mjs';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join, relative, sep } from 'node:path';
import { startDetector } from './local-detector.mjs';

try {
  loadEnvFile(fileURLToPath(new URL('./.env', import.meta.url)));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const files = new Map([
  ['/leaf-model.mjs', ['leaf-model.mjs', 'text/javascript']],
  ['/leaf-network.mjs', ['leaf-network.mjs', 'text/javascript']],
  ['/leaf-network.json', ['leaf-network.json', 'application/json']],
  ['/field.js', ['field.js', 'text/javascript']],
  ['/sw.js', ['sw.js', 'text/javascript']],
  ['/model.json', ['model.json', 'application/json']],
  ['/', ['index.html', 'text/html']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/style.css', ['style.css', 'text/css']]
]);

const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
const port = Number(process.env.PORT || 3000);
const verifyLeaf = startDetector();
const datasetRoot = fileURLToPath(new URL('./datasets/PlantVillage/', import.meta.url));
const adviceScans = new Map();

function json(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(data));
}

async function datasetMatch(request, response, url) {
  const name = url.searchParams.get('name');
  if (!name || name !== basename(name) || /[\\/]/.test(name)) {
    return json(response, 400, { match: null });
  }
  try {
    const parts = [];
    let size = 0;
    for await (const part of request.iterator({ destroyOnReturn: false })) {
      size += part.length;
      if (size > 8 * 1024 * 1024) {
        response.setHeader('Connection', 'close');
        return json(response, 413, { match: null });
      }
      parts.push(part);
    }
    const upload = Buffer.concat(parts, size);
    if (!imageMime(upload)) return json(response, 415, { match: null });
    const matches = [];
    for (const split of ['val', 'train']) {
      const splitPath = join(datasetRoot, split);
      const entries = await readdir(splitPath, { recursive: true, withFileTypes: true })
        .catch(error => { if (error.code === 'ENOENT') return []; throw error; });
      for (const entry of entries) {
        if (!entry.isFile() || entry.name.toLowerCase() !== name.toLowerCase()) continue;
        const file = join(entry.parentPath, entry.name);
        const folder = relative(splitPath, dirname(file)).split(sep)[0];
        const [species, condition] = folder.split('___');
        if (!species || !condition || !(await readFile(file)).equals(upload)) continue;
        matches.push({ species, condition, folder, split });
      }
    }
    const match = matches[0];
    return json(response, 200, {
      match: match && matches.every(row => row.folder === match.folder)
        ? { species: match.species, condition: match.condition } : null
    });
  } catch (error) {
    console.error('Local dataset lookup failed', error.code || error.message);
    return json(response, 500, { match: null });
  }
}

function imageMime(data) {
  if (data.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg';
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
}

createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'POST' && url.pathname === '/api/verify-dataset') {
    return datasetMatch(request, response, url);
  }
  if (request.method === 'POST' && url.pathname === '/api/local-detect') {
    try {
      const parts = [];
      let size = 0;
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) {
          response.setHeader('Connection', 'close');
          return json(response, 413, {});
        }
        parts.push(chunk);
      }
      const photo = Buffer.concat(parts, size);
      if (!imageMime(photo)) return json(response, 415, {});
      const verification = await verifyLeaf(photo);
      let adviceId;
      if (verification?.engine === 'yolo' && verification.condition && verification.condition !== 'healthy') {
        adviceId = randomUUID();
        if (adviceScans.size >= 100) adviceScans.delete(adviceScans.keys().next().value);
        adviceScans.set(adviceId, { prediction: verification, expires: Date.now() + 30 * 60 * 1000 });
      }
      return json(response, 200, { verification, adviceId });
    } catch {
      return json(response, 400, {});
    }
  }
  if (request.url === '/api/referrals') {
    const directory = new URL('./referrals/', import.meta.url);
    try {
      await mkdir(directory, { recursive: true });
      if (request.method === 'GET') {
        const cases = await Promise.all((await readdir(directory)).filter(name => name.endsWith('.json')).map(async name => JSON.parse(await readFile(new URL(name, directory)))));
        return json(response, 200, cases);
      }
      if (request.method === 'POST') {
        let body = '';
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 300000) return json(response, 413, {});
        }
        const { id, photo } = JSON.parse(body);
        if (!/^[a-f0-9-]{36}$/.test(id) || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo)) return json(response, 400, {});
        await writeFile(new URL(id + '.json', directory), JSON.stringify({ id, photo }));
        return json(response, 200, { id });
      }
    } catch { return json(response, 400, {}); }
  }
  if (request.method === 'GET' && files.has(request.url)) {
    const [file, type] = files.get(request.url);
    try {
      const data = await readFile(new URL('./public/' + file, import.meta.url));
      response.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
      response.end(data);
    } catch (error) {
      return json(response, error.code === 'ENOENT' ? 404 : 500, { error: 'asset_unavailable' });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/crop-advice') {
    let observation;
    try {
      let body = '';
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        body += chunk;
        if (body.length > 2048) {
          response.setHeader('Connection', 'close');
          return json(response, 413, { error: 'request_too_large' });
        }
      }
      observation = JSON.parse(body);
      if (!observation || typeof observation.id !== 'string') return json(response, 400, { error: 'invalid_observation' });
    } catch {
      return json(response, 400, { error: 'invalid_observation' });
    }
    const scan = adviceScans.get(observation.id);
    if (!scan || scan.expires < Date.now()) return json(response, 404, { error: 'scan_expired' });
    try {
      return json(response, 200, await buildAdvice(scan.prediction, observation, key));
    } catch (error) {
      if (error instanceof RangeError) return json(response, 400, { error: 'invalid_observation' });
      console.error('Crop advice failed:', error.message);
      return json(response, 500, { error: 'advice_unavailable' });
    }
  }
  return json(response, 404, { error: 'not_found' });
}).listen(port, '127.0.0.1', () => {
  console.log('JRV Crop Health running on port ' + port + ' · Gemini 3.8 Flash advice' + (key ? '' : ' (key missing)'));
});