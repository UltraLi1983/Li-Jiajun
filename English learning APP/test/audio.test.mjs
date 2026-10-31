import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = readdirSync(join(root, 'audio')).filter(name => name.endsWith('.m4a'));

test('every training audio file contains a playable recording', () => {
  assert.equal(files.length, 8);
  for (const name of files) {
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size', '-of', 'json', join(root, 'audio', name)], { encoding: 'utf8' });
    assert.equal(probe.status, 0, `${name}: ${probe.stderr}`);
    const { duration, size } = JSON.parse(probe.stdout).format;
    assert.ok(Number(duration) > (name.includes('dialogue') ? 15 : 2), `${name} has no usable speech duration`);
    assert.ok(Number(size) > 30000, `${name} is unexpectedly small`);
  }
});
