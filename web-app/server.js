import express from 'express';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import swaggerUi from 'swagger-ui-express';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID || 'oca-do-acai-c155f' });
const db = getFirestore();
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));
const admins = new Set((process.env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean));
const allowAnyAuthenticatedAdmin = process.env.ALLOW_ANY_AUTHENTICATED_ADMIN === 'true';
const statuses = ['recebido', 'em preparo', 'pronto', 'entregue'];
const hash = s => createHash('sha256').update(s).digest('hex');
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const ensureCredentials = async () => { if (!process.env.FIRESTORE_EMULATOR_HOST) await applicationDefault().getAccessToken(); };
const database = fn => wrap(async (req, res, next) => { await ensureCredentials(); return fn(req, res, next); });
const clean = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const auth = wrap(async (req, res, next) => {
  const token = req.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: 'Faça login para continuar.' });
  try { req.user = await getAuth().verifyIdToken(token, true); }
  catch { return res.status(401).json({ error: 'Sessão inválida ou expirada.' }); }
  if (!allowAnyAuthenticatedAdmin && !admins.has(req.user.uid)) return res.status(403).json({ error: 'Conta sem permissão de administrador.' });
  next();
});
const product = data => {
  const name = clean(data.name, 120), description = clean(data.description, 1000), category = clean(data.category, 100), imagePath = clean(data.imagePath, 1000), ingredients = clean(data.ingredients, 1000), price = Number(data.price);
  if (!name || !description || !category || !imagePath || !Number.isFinite(price) || price < 0 || price > 10000) throw Object.assign(new Error('Preencha nome, descrição, categoria, imagem e preço válido.'), { status: 400 });
  if (!/^(assets\/images\/[\w.-]+|\/api\/images\/[a-f0-9]{32}\.(jpg|png|webp)|https:\/\/[^\s]+)$/i.test(imagePath)) throw Object.assign(new Error('Informe uma imagem enviada, endereço HTTPS ou imagem existente em assets/images.'), { status: 400 });
  return { name, description, category, imagePath, ingredients, price: Math.round(price * 100) / 100 };
};
const idParameter = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };
const body = schema => ({ required: true, content: { 'application/json': { schema } } });
const secured = [{ firebase: [] }];
const docs = { openapi: '3.0.3', info: { title: 'Oca do Açaí API', version: '1.0.0', description: 'Rotas administrativas exigem um ID token Firebase e UID autorizado no servidor.' }, components: { securitySchemes: { firebase: { type: 'http', scheme: 'bearer', bearerFormat: 'Firebase ID token' } }, schemas: {
  Product: { type: 'object', required: ['name', 'description', 'category', 'imagePath', 'price'], properties: { name: { type: 'string' }, description: { type: 'string' }, ingredients: { type: 'string' }, category: { type: 'string' }, imagePath: { type: 'string' }, price: { type: 'number', minimum: 0 } } },
  Order: { type: 'object', required: ['nomeCliente', 'mesa', 'itens'], properties: { nomeCliente: { type: 'string' }, mesa: { type: 'string' }, itens: { type: 'array', items: { type: 'object', required: ['produtoId', 'quantidade'], properties: { produtoId: { type: 'string' }, quantidade: { type: 'integer', minimum: 1, maximum: 99 } } } } } }
} }, paths: {
  '/api/products': { get: { summary: 'Listar cardápio', responses: { 200: { description: 'Produtos' } } }, post: { summary: 'Cadastrar produto', security: secured, requestBody: body({ $ref: '#/components/schemas/Product' }), responses: { 201: { description: 'Criado' }, 400: { description: 'Dados inválidos' }, 403: { description: 'Acesso negado' } } } },
  '/api/products/{id}': { put: { summary: 'Editar produto', security: secured, parameters: [idParameter], requestBody: body({ $ref: '#/components/schemas/Product' }), responses: { 200: { description: 'Atualizado' }, 404: { description: 'Não encontrado' } } }, delete: { summary: 'Excluir produto', security: secured, parameters: [idParameter], responses: { 204: { description: 'Excluído' } } } },
  '/api/orders': { post: { summary: 'Criar pedido', requestBody: body({ $ref: '#/components/schemas/Order' }), responses: { 201: { description: 'Pedido criado; guardar id e token de acompanhamento' }, 400: { description: 'Dados inválidos' } } }, get: { summary: 'Listar pedidos', security: secured, responses: { 200: { description: 'Pedidos' } } } },
  '/api/orders/{id}': { get: { summary: 'Acompanhar pedido', parameters: [idParameter, { name: 'X-Order-Token', in: 'header', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Estado do pedido' }, 404: { description: 'Pedido não encontrado' } } } },
  '/api/orders/{id}/status': { patch: { summary: 'Atualizar status e registrar histórico', security: secured, parameters: [idParameter], requestBody: body({ type: 'object', required: ['status'], properties: { status: { type: 'string', enum: statuses } } }), responses: { 200: { description: 'Atualizado' }, 400: { description: 'Status inválido' }, 404: { description: 'Não encontrado' } } } }
} };
docs.info.description = 'API REST do cardápio Oca do Açaí. As operações administrativas exigem token Firebase válido e autorização configurada no servidor. Horários são objetos Firestore Timestamp. As rotas de transmissão retornam eventos SSE em text/event-stream.';
docs.components.schemas.Error = { type: 'object', properties: { error: { type: 'string', example: 'Dados inválidos.' } } };
docs.components.schemas.Product.example = { name: 'Açaí pequeno', description: 'Açaí na tigela', ingredients: 'Açaí, banana', category: 'Açaí', imagePath: 'assets/images/acai.jpg', price: 18.5 };
docs.components.schemas.Order.example = { nomeCliente: 'Cliente de exemplo', mesa: 'Mesa 4', itens: [{ produtoId: 'produto123', quantidade: 2 }] };
docs.components.schemas.OrderResult = { type: 'object', properties: { id: { type: 'string', example: 'abc123' }, token: { type: 'string', description: 'Segredo de acompanhamento: mantenha privado.' } } };
const jsonResponse = (description, schema, example) => ({ description, content: { 'application/json': { schema, ...(example ? { example } : {}) } } });
const errorResponse = description => jsonResponse(description, { $ref: '#/components/schemas/Error' });
const idResult = { type: 'object', properties: { id: { type: 'string', example: 'produto123' } } };
const okResult = { type: 'object', properties: { ok: { type: 'boolean', example: true } } };
docs.paths['/api/products'].get.responses[200] = jsonResponse('Produtos do cardápio.', { type: 'array', items: { allOf: [{ $ref: '#/components/schemas/Product' }, idResult] } });
docs.paths['/api/products'].post.responses[201] = jsonResponse('Produto cadastrado.', idResult);
docs.paths['/api/products/{id}'].put.responses[200] = jsonResponse('Produto atualizado.', okResult);
docs.paths['/api/orders'].post.responses[201] = jsonResponse('Pedido registrado; o token é exibido apenas nesta resposta.', { $ref: '#/components/schemas/OrderResult' });
docs.paths['/api/orders'].get.responses[200] = jsonResponse('Pedidos mais recentes primeiro; contém identificação do cliente, itens, status e histórico.', { type: 'array', items: { type: 'object', additionalProperties: true } });
docs.paths['/api/orders/{id}'].get.responses[200] = jsonResponse('Acompanhamento do pedido, sem dados de autenticação.', { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string', enum: statuses }, total: { type: 'number' }, itens: { type: 'array', items: { type: 'object' } }, criadoEm: { type: 'object' } } });
docs.paths['/api/orders/{id}/status'].patch.responses[200] = jsonResponse('Status e histórico atualizados.', okResult);
docs.paths['/api/images'] = { post: { summary: 'Enviar imagem do cardápio', description: 'Requer administrador. Envie bytes JPEG, PNG ou WebP (máximo 4 MB). A imagem é armazenada no Firestore em partes.', security: secured, requestBody: { required: true, content: Object.fromEntries(['image/jpeg','image/png','image/webp'].map(type => [type, { schema: { type: 'string', format: 'binary' } }])) }, responses: { 201: jsonResponse('Imagem armazenada.', { type: 'object', properties: { imagePath: { type: 'string', example: '/api/images/0123456789abcdef0123456789abcdef.png' } } }), 400: errorResponse('Imagem inválida.'), 413: errorResponse('Arquivo excede 4 MB.') } } };
docs.paths['/api/images/{name}'] = { get: { summary: 'Exibir imagem enviada', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' }, example: '0123456789abcdef0123456789abcdef.png' }], responses: { 200: { description: 'Imagem JPEG, PNG ou WebP.', content: Object.fromEntries(['image/jpeg','image/png','image/webp'].map(type => [type, { schema: { type: 'string', format: 'binary' } }])) }, 404: errorResponse('Imagem não encontrada.') } } };
docs.paths['/api/orders/stream'] = { get: { summary: 'Acompanhar lista de pedidos em tempo real', description: 'Fluxo SSE com lista completa a cada mudança; reconectar ao encerrar.', security: secured, responses: { 200: { description: 'Eventos com listas de pedidos.', content: { 'text/event-stream': { schema: { type: 'string', example: 'data: [{"id":"abc123","status":"recebido"}]\n\n' } } } } } } };
docs.paths['/api/orders/{id}/stream'] = { get: { summary: 'Acompanhar um pedido em tempo real', description: 'Fluxo SSE para o cliente que possui o token de acompanhamento.', parameters: [idParameter, { name: 'X-Order-Token', in: 'header', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Eventos com situação atual do pedido.', content: { 'text/event-stream': { schema: { type: 'string', example: 'data: {"id":"abc123","status":"pronto"}\n\n' } } } }, 404: errorResponse('Pedido não encontrado ou token inválido.') } } };
for (const item of Object.values(docs.paths)) for (const operation of Object.values(item)) {
  if (operation.security) { operation.responses[401] = errorResponse('Token ausente, inválido, revogado ou expirado.'); operation.responses[403] = errorResponse('Conta sem permissão administrativa.'); }
  operation.responses[500] = errorResponse('Falha interna ou serviço de dados indisponível.');
}
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(docs));
app.get('/api/openapi.json', (_req, res) => res.json(docs));
// Arquivos são divididos em documentos para respeitar o limite do Firestore.
app.post('/api/images', auth, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '4mb' }), database(async (req, res) => {
  const bytes = req.body;
  const isJpeg = Buffer.isBuffer(bytes) && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = Buffer.isBuffer(bytes) && bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const isWebp = Buffer.isBuffer(bytes) && bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  const kind = isJpeg ? ['jpg','image/jpeg'] : isPng ? ['png','image/png'] : isWebp ? ['webp','image/webp'] : null;
  if (!kind || req.get('content-type')?.split(';')[0] !== kind[1]) return res.status(400).json({ error: 'Envie uma imagem JPEG, PNG ou WebP válida de até 4 MB.' });
  const name = `${randomBytes(16).toString('hex')}.${kind[0]}`;
  const imageRef = db.collection('imagensCardapio').doc(name), batch = db.batch(), chunkSize = 256 * 1024;
  batch.create(imageRef, { contentType: kind[1], size: bytes.length, createdAt: FieldValue.serverTimestamp() });
  for (let offset = 0, index = 0; offset < bytes.length; offset += chunkSize, index++) {
    batch.create(imageRef.collection('partes').doc(String(index).padStart(4, '0')), { bytes: bytes.subarray(offset, offset + chunkSize) });
  }
  await batch.commit();
  res.status(201).json({ imagePath: `/api/images/${name}` });
}));
app.get('/api/images/:name', database(async (req, res) => {
  const name = req.params.name;
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) return res.status(404).json({ error: 'Imagem não encontrada.' });
  const ref = db.collection('imagensCardapio').doc(name), metadata = await ref.get();
  if (!metadata.exists) return res.status(404).json({ error: 'Imagem não encontrada.' });
  const chunks = await ref.collection('partes').orderBy('__name__').get();
  const bytes = Buffer.concat(chunks.docs.map(doc => Buffer.from(doc.data().bytes)));
  if (bytes.length !== metadata.data().size) return res.status(500).json({ error: 'Não foi possível carregar a imagem.' });
  res.type(metadata.data().contentType).set('Cache-Control', 'public, max-age=86400').set('X-Content-Type-Options', 'nosniff').send(bytes);
}));
app.get('/api/products', database(async (_req, res) => { const snap = await db.collection('cardapio').get(); res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.category || '').localeCompare(b.category || '', 'pt-BR'))); }));
app.post('/api/products', auth, database(async (req, res) => { const ref = await db.collection('cardapio').add(product(req.body)); res.status(201).json({ id: ref.id }); }));
app.put('/api/products/:id', auth, database(async (req, res) => { const ref = db.collection('cardapio').doc(req.params.id); if (!(await ref.get()).exists) return res.status(404).json({ error: 'Produto não encontrado.' }); await ref.update(product(req.body)); res.json({ ok: true }); }));
app.delete('/api/products/:id', auth, database(async (req, res) => { await db.collection('cardapio').doc(req.params.id).delete(); res.sendStatus(204); }));
app.post('/api/orders', wrap(async (req, res) => {
  const nomeCliente = clean(req.body.nomeCliente, 100), mesa = clean(req.body.mesa, 60), items = req.body.itens;
  if (!nomeCliente || !mesa || !Array.isArray(items) || !items.length || items.length > 50) return res.status(400).json({ error: 'Informe nome, mesa e itens válidos.' });
  const ids = new Set(); for (const item of items) { if (typeof item.produtoId !== 'string' || !item.produtoId || item.produtoId.includes('/') || ids.has(item.produtoId) || !Number.isInteger(item.quantidade) || item.quantidade < 1 || item.quantidade > 99) return res.status(400).json({ error: 'Itens inválidos.' }); ids.add(item.produtoId); }
  await ensureCredentials();
  const token = randomBytes(32).toString('base64url'), ref = db.collection('pedidos').doc();
  await db.runTransaction(async tx => {
    const refs = items.map(i => db.collection('cardapio').doc(i.produtoId)); const snapshots = await tx.getAll(...refs);
    let cents = 0; const itens = snapshots.map((snap, index) => { if (!snap.exists) throw Object.assign(new Error('Um produto não está mais disponível.'), { status: 400 }); const data = snap.data(), price = Number(data.price); if (!Number.isFinite(price) || price < 0) throw Object.assign(new Error('Preço indisponível.'), { status: 400 }); const quantidade = items[index].quantidade, unit = Math.round(price * 100); cents += unit * quantidade; return { produtoId: snap.id, nome: data.name, quantidade, precoUnitario: unit / 100, subtotal: unit * quantidade / 100 }; });
    tx.create(ref, { nomeCliente, mesa, itens, total: cents / 100, status: 'recebido', criadoEm: FieldValue.serverTimestamp(), trackingHash: hash(token), historico: [{ status: 'recebido', data: Timestamp.now(), usuario: 'cliente' }], userId: 'web', userEmail: 'visitante' });
  });
  res.status(201).json({ id: ref.id, token });
}));
function eventStream(res, listen) {
  res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(': conectado\n\n');
  const stop = listen(data => { if (!res.destroyed) res.write(`data: ${JSON.stringify(data)}\n\n`); }, () => { if (!res.destroyed) res.end(); });
  const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': sinal\n\n'); }, 20000);
  // Revalida o token ao reconectar, inclusive após revogação ou expiração.
  const lifetime = setTimeout(() => res.end(), 5 * 60 * 1000);
  res.on('close', () => { clearInterval(heartbeat); clearTimeout(lifetime); stop(); });
}
app.get('/api/orders/stream', auth, database(async (_req, res) => {
  eventStream(res, (send, fail) => db.collection('pedidos').orderBy('criadoEm', 'desc').onSnapshot(snapshot => {
    send(snapshot.docs.map(doc => { const { trackingHash, ...data } = doc.data(); return { id: doc.id, ...data }; }));
  }, fail));
}));
app.get('/api/orders', auth, database(async (_req, res) => { const snap = await db.collection('pedidos').orderBy('criadoEm', 'desc').get(); res.json(snap.docs.map(d => { const { trackingHash, ...data } = d.data(); return { id: d.id, ...data }; })); }));
app.get('/api/orders/:id/stream', database(async (req, res) => {
  const ref = db.collection('pedidos').doc(req.params.id), initial = await ref.get(), actual = hash(req.get('x-order-token') || '');
  const expected = initial.exists ? initial.data().trackingHash : '';
  if (typeof expected !== 'string' || expected.length !== actual.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) return res.status(404).json({ error: 'Pedido não encontrado.' });
  eventStream(res, (send, fail) => ref.onSnapshot(doc => {
    if (!doc.exists) return fail();
    const d = doc.data(); send({ id: doc.id, status: d.status, total: d.total, itens: d.itens, criadoEm: d.criadoEm });
  }, fail));
}));
app.get('/api/orders/:id', database(async (req, res) => { const snap = await db.collection('pedidos').doc(req.params.id).get(), token = req.get('x-order-token') || ''; const expected = snap.exists ? snap.data().trackingHash : ''; const actual = hash(token); if (!expected || expected.length !== actual.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) return res.status(404).json({ error: 'Pedido não encontrado.' }); const d = snap.data(); res.json({ id: snap.id, status: d.status, total: d.total, itens: d.itens, criadoEm: d.criadoEm }); }));
app.patch('/api/orders/:id/status', auth, database(async (req, res) => { const status = clean(req.body.status, 30); if (!statuses.includes(status)) return res.status(400).json({ error: 'Status inválido.' }); const ref = db.collection('pedidos').doc(req.params.id); await db.runTransaction(async tx => { const snap = await tx.get(ref); if (!snap.exists) throw Object.assign(new Error('Pedido não encontrado.'), { status: 404 }); tx.update(ref, { status, historico: FieldValue.arrayUnion({ status, data: Timestamp.now(), usuario: req.user.email || req.user.uid }) }); }); res.json({ ok: true }); }));
const root = path.dirname(fileURLToPath(import.meta.url));
app.use('/assets/images', express.static(path.join(root, '../assets/images')));
app.get(['/admin', '/admin/'], (_req, res) => res.sendFile(path.join(root, 'public', 'index.html')));
app.use(express.static(path.join(root, 'public')));
app.use((err, _req, res, _next) => { console.error(err.message); const status = err.status || 500; res.status(status).json({ error: status === 413 ? 'Imagem excede o limite de 4 MB.' : err.status ? err.message : 'Não foi possível concluir a operação.' }); });
app.listen(Number(process.env.PORT) || 3000, () => console.log('Oca web iniciada'));
