import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

// 仅用于重新生成随应用分发的音频；需要 macOS say 和 ffmpeg。
const root = resolve(import.meta.dirname, '..');
const source = readFileSync(join(root, 'app.js'), 'utf8');
const scenarios = runInNewContext(`${source.slice(0, source.indexOf('const STORAGE_KEY'))}\nSCENARIOS;`);
const output = join(root, 'audio');
const temporary = mkdtempSync(join(tmpdir(), 'english-coach-audio-'));
mkdirSync(output, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
}
function renderSpeech(text, voice, file) {
  const aiff = `${file}.aiff`;
  run('say', ['-v', voice, '-r', '175', '-o', aiff, text]);
  if (statSync(aiff).size < 8192) throw new Error(`System voice produced empty audio: ${voice}`);
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', aiff, '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', file]);
}
function encode(input, target, concat = false) {
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...(concat ? ['-f', 'concat', '-safe', '0'] : []), '-i', input, '-af', 'loudnorm=I=-19:TP=-3:LRA=9', '-c:a', 'aac', '-b:a', '128k', target]);
}

try {
  const silence = join(temporary, 'silence.wav');
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '0.45', '-c:a', 'pcm_s16le', silence]);
  for (const scenario of scenarios) {
    const parts = [];
    for (const [index, [speaker, line]] of scenario.dialogue.entries()) {
      const voice = ['Maya', 'Sam'].includes(speaker) ? 'Samantha' : 'Daniel';
      const file = join(temporary, `${scenario.id}-${index}.wav`);
      renderSpeech(line, voice, file);
      if (parts.length) parts.push(silence);
      parts.push(file);
    }
    const list = join(temporary, `${scenario.id}-list.txt`);
    writeFileSync(list, parts.map(file => `file '${file}'`).join('\n'));
    encode(list, join(output, `${scenario.id}-dialogue.m4a`), true);
    for (const [index, turn] of scenario.turns.entries()) {
      const wav = join(temporary, `${scenario.id}-role-${index}.wav`);
      renderSpeech(turn.line, scenario.id === 'delivery' ? 'Samantha' : 'Daniel', wav);
      encode(wav, join(output, `${scenario.id}-role-${index}.m4a`));
    }
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
