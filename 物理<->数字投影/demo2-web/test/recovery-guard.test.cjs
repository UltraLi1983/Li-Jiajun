const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/app/scenePersistence.ts'), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
const draftKey = 'demo2.factoryScene.draft.v1';
const backupKey = 'demo2.factoryScene.draft.backup.v1';
const draft = JSON.stringify({schemaVersion:'demo2-scene-draft-v1',revision:3,savedAt:'2026-10-30T00:00:00.000Z',scenario:{id:'original-scene',layout:{backgroundDataUrl:'data:image/png;base64,ORIGINAL'},storageAreas:[],deliveryPoints:[],pathNetwork:{nodes:[],segments:[]}}});

function loadPersistence(failBackup = false) {
  const contents = new Map([[draftKey, draft]]);
  const localStorage = {
    getItem: key => contents.get(key) ?? null,
    setItem: (key, value) => { if (failBackup && key === backupKey) throw new Error('quota'); contents.set(key, value); },
    removeItem: key => contents.delete(key)
  };
  const fixtureExports = {};
  new Function('exports', 'window', compiled)(fixtureExports, {localStorage});
  return {api: fixtureExports, contents};
}

test('切换样板前备份原场景，随后可完整恢复含图片的草稿', () => {
  const {api, contents} = loadPersistence();
  assert.equal(api.clearSceneDraft(), true);
  assert.equal(contents.has(draftKey), false);
  assert.equal(contents.get(backupKey), draft);
  assert.equal(api.restoreSceneBackup().scenario.layout.backgroundDataUrl, 'data:image/png;base64,ORIGINAL');
  assert.equal(contents.get(draftKey), draft);
});

test('备份失败时保留当前草稿', () => {
  const {api, contents} = loadPersistence(true);
  assert.equal(api.clearSceneDraft(), false);
  assert.equal(contents.get(draftKey), draft);
});
