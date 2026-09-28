const { test } = require('node:test');
const assert = require('node:assert');
const { createHandler, validateManifest } = require('../api/register.js');
const validManifest = require('./fixture-valid-manifest.json');

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function encode(obj) {
  return Buffer.from(JSON.stringify(obj, null, 2)).toString('base64');
}

function fakeRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    }
  };
  return res;
}

function fakeGithub({ files = {}, putStatus = 201 } = {}) {
  const calls = { gets: [], puts: [] };
  return {
    calls,
    async getFile(path) {
      calls.gets.push(path);
      if (!(path in files)) return null;
      return { content: encode(files[path]), sha: 'fakesha' };
    },
    async putFile(path, content, message) {
      calls.puts.push({ path, content, message });
      return { status: putStatus, data: {} };
    }
  };
}

function monthPath(agentId) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `manifests/${year}/${month}/${agentId}.json`;
}

test('valid new manifest is accepted and written without sha', async () => {
  const github = fakeGithub();
  const handler = createHandler(github);
  const res = fakeRes();

  await handler({ method: 'POST', body: clone(validManifest) }, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.status, 'accepted');
  assert.strictEqual(github.calls.puts.length, 1);
  assert.strictEqual(github.calls.puts[0].path, monthPath('the-diplomat'));
});

test('oversized Content-Length is rejected before the body parser or GitHub', async () => {
  const github = fakeGithub();
  const res = fakeRes();
  await createHandler(github)({
    method: 'POST', headers: { 'content-length': '65537' },
    get body() { throw new Error('must not parse'); }
  }, res);
  assert.strictEqual(res.statusCode, 413);
  assert.deepStrictEqual(github.calls, { gets: [], puts: [] });
});

test('UTF-8 storage limit cannot be bypassed by missing or small Content-Length', async () => {
  for (const headers of [{}, { 'content-length': '1' }]) {
    const github = fakeGithub();
    const res = fakeRes();
    const body = clone(validManifest);
    body['x-padding'] = 'é'.repeat(33 * 1024);
    await createHandler(github)({ method: 'POST', headers, body }, res);
    assert.strictEqual(res.statusCode, 413);
    assert.deepStrictEqual(github.calls, { gets: [], puts: [] });
  }
});

test('exactly 64 KiB of stored JSON is accepted; one more byte is rejected', async () => {
  const body = clone(validManifest);
  body['x-padding'] = '';
  body['x-padding'] = 'a'.repeat(65536 - Buffer.byteLength(JSON.stringify(body, null, 2)));
  for (const [suffix, expected] of [['', 200], ['a', 413]]) {
    const github = fakeGithub();
    const res = fakeRes();
    await createHandler(github)({ method: 'POST', body: { ...body, 'x-padding': body['x-padding'] + suffix } }, res);
    assert.strictEqual(res.statusCode, expected);
    assert.strictEqual(github.calls.puts.length, expected === 200 ? 1 : 0);
    if (expected === 413) assert.strictEqual(github.calls.gets.length, 0);
  }
});

test('deep extension objects and arrays are rejected without a stack overflow or GitHub request', async () => {
  for (const wrap of [(v) => ({ nested: v }), (v) => [v]]) {
    const body = clone(validManifest);
    let nested = {};
    for (let i = 0; i < 10000; i++) nested = wrap(nested);
    body['x-nested'] = nested;
    const github = fakeGithub();
    const res = fakeRes();
    await createHandler(github)({ method: 'POST', body }, res);
    assert.strictEqual(res.statusCode, 413);
    assert.deepStrictEqual(github.calls, { gets: [], puts: [] });
  }
});

test('invalid JSON from the runtime parser returns 400 without GitHub access', async () => {
  const github = fakeGithub();
  const res = fakeRes();
  await createHandler(github)({
    method: 'POST', get body() { throw new SyntaxError('Invalid JSON'); }
  }, res);
  assert.strictEqual(res.statusCode, 400);
  assert.deepStrictEqual(github.calls, { gets: [], puts: [] });
});

test('depth limit includes the root and permits exactly 32 container levels', async () => {
  for (const [levels, expected] of [[32, 200], [33, 413]]) {
    const body = clone(validManifest);
    let nested = {};
    for (let i = 2; i < levels; i++) nested = { nested };
    body['x-nested'] = nested;
    const github = fakeGithub();
    const res = fakeRes();
    await createHandler(github)({ method: 'POST', body }, res);
    assert.strictEqual(res.statusCode, expected);
    assert.strictEqual(github.calls.puts.length, expected === 200 ? 1 : 0);
  }
});

test('CORS preflight does not parse or validate a submission', async () => {
  const github = fakeGithub();
  const res = fakeRes();
  await createHandler(github)({
    method: 'OPTIONS', headers: { 'content-length': '999999' },
    get body() { throw new Error('must not parse'); }
  }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.headers['Access-Control-Allow-Origin'], '*');
  assert.deepStrictEqual(github.calls, { gets: [], puts: [] });
});

test('missing required field is rejected with 400', async () => {
  const github = fakeGithub();
  const handler = createHandler(github);
  const res = fakeRes();
  const manifest = clone(validManifest);
  delete manifest.stopping_authority;

  await handler({ method: 'POST', body: manifest }, res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.status, 'rejected');
  assert.ok(res.body.errors.some((e) => e.includes('stopping_authority')));
  assert.strictEqual(github.calls.puts.length, 0);
});

test('stores_personal_data=true without retention is rejected (conditional rule)', async () => {
  const github = fakeGithub();
  const handler = createHandler(github);
  const res = fakeRes();
  const manifest = clone(validManifest);
  manifest.data_handling.stores_personal_data = true;
  delete manifest.data_handling.retention;

  await handler({ method: 'POST', body: manifest }, res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.status, 'rejected');
  assert.strictEqual(github.calls.puts.length, 0);
});

test('wrong manifest_version is rejected', async () => {
  const github = fakeGithub();
  const handler = createHandler(github);
  const res = fakeRes();
  const manifest = clone(validManifest);
  manifest.manifest_version = '2.0';

  await handler({ method: 'POST', body: manifest }, res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(github.calls.puts.length, 0);
});

test('identical resubmission in same month is idempotent (200, no write)', async () => {
  const manifest = clone(validManifest);
  const github = fakeGithub({ files: { [monthPath('the-diplomat')]: manifest } });
  const handler = createHandler(github);
  const res = fakeRes();

  await handler({ method: 'POST', body: clone(manifest) }, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.status, 'already_registered');
  assert.strictEqual(github.calls.puts.length, 0);
});

test('different manifest for existing agent_id in same month is rejected (409, no overwrite)', async () => {
  const stored = clone(validManifest);
  const github = fakeGithub({ files: { [monthPath('the-diplomat')]: stored } });
  const handler = createHandler(github);
  const res = fakeRes();
  const attacker = clone(validManifest);
  attacker.purpose.description = 'tampered declaration';

  await handler({ method: 'POST', body: attacker }, res);

  assert.strictEqual(res.statusCode, 409);
  assert.strictEqual(res.body.status, 'rejected');
  assert.strictEqual(github.calls.puts.length, 0);
});

test('agent_id registered in a previous month is rejected via registry lookup', async () => {
  const github = fakeGithub({
    files: {
      'registry.json': {
        registry_version: '1.0',
        generated_at: '2026-06-26T13:26:53Z',
        agents: ['manifests/2026/03/the-diplomat.json']
      }
    }
  });
  const handler = createHandler(github);
  const res = fakeRes();

  await handler({ method: 'POST', body: clone(validManifest) }, res);

  assert.strictEqual(res.statusCode, 409);
  assert.strictEqual(github.calls.puts.length, 0);
});

test('registry lookup is case-insensitive', async () => {
  const github = fakeGithub({
    files: {
      'registry.json': {
        registry_version: '1.0',
        generated_at: '2026-06-26T13:26:53Z',
        agents: ['manifests/2026/03/the-diplomat.json']
      }
    }
  });
  const handler = createHandler(github);
  const res = fakeRes();
  const manifest = clone(validManifest);
  manifest.agent_id = 'The-Diplomat';

  await handler({ method: 'POST', body: manifest }, res);

  assert.strictEqual(res.statusCode, 409);
  assert.strictEqual(github.calls.puts.length, 0);
});

test('concurrent creation race (GitHub 422) maps to 409', async () => {
  const github = fakeGithub({ putStatus: 422 });
  const handler = createHandler(github);
  const res = fakeRes();

  await handler({ method: 'POST', body: clone(validManifest) }, res);

  assert.strictEqual(res.statusCode, 409);
  assert.strictEqual(res.body.status, 'rejected');
});

test('non-POST method returns 405', async () => {
  const handler = createHandler(fakeGithub());
  const res = fakeRes();

  await handler({ method: 'GET' }, res);

  assert.strictEqual(res.statusCode, 405);
});

test('validateManifest accepts all five published dataset manifests', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(
    __dirname,
    '..',
    '..',
    'agent-manifest-dataset',
    'manifests',
    '2026',
    '03'
  );
  if (!fs.existsSync(dir)) return; // dataset clone not present in CI
  for (const f of fs.readdirSync(dir)) {
    const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
    assert.deepStrictEqual(await validateManifest(m), [], `${f} should be valid`);
  }
});

test('GitHub auth/config failure surfaces as 500, not as duplicate', async () => {
  const github = {
    calls: { puts: [] },
    async getFile() {
      return { message: 'Requires authentication' }; // what a non-200 used to return
    },
    async putFile() {
      throw new Error('should not be reached');
    }
  };
  // With the hardened getFile contract, a real client throws instead;
  // simulate that behavior directly:
  github.getFile = async () => {
    throw new Error('GitHub read failed (401)');
  };
  const handler = createHandler(github);
  const res = fakeRes();
  await handler({ method: 'POST', body: clone(validManifest) }, res);
  assert.strictEqual(res.statusCode, 500);
  assert.match(res.body.message, /GitHub read failed/);
});
