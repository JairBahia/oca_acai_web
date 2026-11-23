import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const base = 'http://127.0.0.1:31987';
let server;
before(async () => {
  server = spawn(process.execPath, ['server.js'], { cwd: import.meta.dirname, env: { ...process.env, PORT: '31987', ADMIN_UIDS: '' }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Servidor não iniciou');
});
after(() => server?.kill());
test('documentação e página inicial são servidas', async () => {
  assert.equal((await fetch(base)).status, 200);
  const adminPage = await fetch(base + '/admin');
  assert.equal(adminPage.status, 200);
  assert.match(await adminPage.text(), /Painel administrativo/);
  const docs = await (await fetch(base + '/api/openapi.json')).json();
  assert.equal(docs.openapi, '3.0.3');
  assert.ok(docs.paths['/api/orders']);
  assert.equal((await fetch(base + '/api/docs/')).status, 200);
});
test('rotas administrativas exigem autenticação', async () => {
  for (const [path, method] of [['/api/orders', 'GET'], ['/api/products', 'POST'], ['/api/products/item', 'PUT'], ['/api/products/item', 'DELETE'], ['/api/orders/item/status', 'PATCH']]) {
    assert.equal((await fetch(base + path, { method })).status, 401);
  }
});
test('pedido inválido é recusado antes de acessar o banco', async () => {
  const response = await fetch(base + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nomeCliente: '', mesa: '', itens: [] }) });
  assert.equal(response.status, 400);
});
