import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { yoloEnvironment, yoloPython } from './local-detector.mjs';

function run(command, args, quiet = false) {
  const result = spawnSync(command, args, { stdio: quiet ? 'ignore' : 'inherit', windowsHide: true });
  if (result.error && result.error.code !== 'ENOENT') throw result.error;
  return result.status === 0;
}

function requireRun(command, args) {
  if (!run(command, args)) throw new Error('Command failed: ' + args.join(' '));
}

try {
  if (!existsSync(yoloPython)) {
    const candidates = process.platform === 'win32'
      ? [['py', '-3.12'], ['py', '-3'], ['python'], ['python3']]
      : [['python3.12'], ['python3'], ['python']];
    const probe = 'import sys, venv; sys.exit(0 if sys.version_info >= (3, 10) else 1)';
    const launcher = candidates.find(([command, ...args]) => run(command, [...args, '-c', probe], true));
    if (!launcher) throw new Error('Install Python 3.12 with venv support, then rerun npm run setup:yolo.');
    const [command, ...args] = launcher;
    requireRun(command, [...args, '-m', 'venv', yoloEnvironment]);
  }

  const check = 'import ultralytics; assert ultralytics.__version__ == "8.4.216"';
  if (!run(yoloPython, ['-c', check], true)) {
    if (!run(yoloPython, ['-m', 'pip', '--version'], true)) {
      requireRun(yoloPython, ['-m', 'ensurepip', '--upgrade']);
    }
    if (process.platform !== 'darwin' && !run(yoloPython, ['-c', 'import torch, torchvision'], true)) {
      requireRun(yoloPython, ['-m', 'pip', 'install', '--index-url',
        'https://download.pytorch.org/whl/cpu', 'torch', 'torchvision']);
    }
    requireRun(yoloPython, ['-m', 'pip', 'install', 'ultralytics==8.4.216']);
  }
  requireRun(yoloPython, ['-c', check]);
  console.log('YOLO Python environment is ready. Start or restart the app with npm start.');
} catch (error) {
  console.error('YOLO setup failed:', error.message);
  process.exitCode = 1;
}
