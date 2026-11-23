import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function startDetector() {
  const windows = process.platform === 'win32';
  const venv = fileURLToPath(new URL(windows
    ? './datasets/.leaf-venv/Scripts/python.exe' : './datasets/.leaf-venv/bin/python', import.meta.url));
  const yoloVenv = fileURLToPath(new URL(windows
    ? './datasets/.yolo-venv/Scripts/python.exe' : './datasets/.yolo-venv/bin/python', import.meta.url));
  const configured = process.env.YOLO_WEIGHTS?.trim();
  const checkpoint = configured ? resolve(configured) : fileURLToPath(new URL('./datasets/yolo/best.pt', import.meta.url));
  const weights = existsSync(checkpoint) ? checkpoint : '';
  if (configured && !weights) console.warn('YOLO checkpoint was not found:', checkpoint);
  const python = process.env.PYTHON_EXECUTABLE?.trim() ||
    ([...(weights ? [yoloVenv] : []), venv].find(existsSync));
  const pending = new Map();
  let child;
  let ready = false;
  let nextId = 0;
  function stopped(error) {
    if (error && !child) console.warn('Python verifier unavailable:', error.code || error.message);
    else if (child) console.warn('Python verifier unavailable. Browser analysis remains available.');
    child = undefined;
    ready = false;
    for (const finish of pending.values()) finish(null);
  }
  try {
    const launcher = python || (windows ? 'py' : 'python3');
    const args = python || !windows ? [] : ['-3'];
    child = spawn(launcher, [...args, '-u', fileURLToPath(new URL('./detect-local.py', import.meta.url))], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      env: { ...process.env, YOLO_WEIGHTS: weights }
    });
    child.on('error', stopped);
    child.on('exit', () => stopped());
    child.stdin.on('error', () => stopped());
    child.stderr.on('data', data => console.warn('Python verifier:', data.toString().trim()));
    createInterface({ input: child.stdout }).on('line', line => {
      let message;
      try { message = JSON.parse(line); }
      catch { return console.warn('Ignored an invalid response from the Python verifier.'); }
      if (message.ready) {
        ready = true;
        console.log(message.engine === 'yolo' ? 'Local YOLO classifier ready.' : 'Python leaf verifier ready.');
      } else {
        pending.get(message.id)?.(message.result);
      }
    });
    process.on('exit', () => child?.kill());
  } catch (error) {
    stopped(error);
  }

  return image => {
    if (!ready || !child || pending.size >= 4) return Promise.resolve(null);
    const id = ++nextId;
    return new Promise(resolve => {
      const finish = result => {
        clearTimeout(timeout);
        pending.delete(id);
        resolve(result);
      };
      const timeout = setTimeout(() => finish(null), 4000);
      pending.set(id, finish);
      child.stdin.write(JSON.stringify({ id, image: image.toString('base64') }) + '\n');
    });
  };
}
