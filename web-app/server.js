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
const statuses = ['recebido', 'em preparo', 'pronto', 'entregue'];
const hash = s => createHash('sha256').update(s).digest('hex');
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const database = fn => wrap(async (req, res, next) => { await applicationDefault().getAccessToken(); return fn(req, res, next); });
const clean = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const auth = wrap(async (req, res, next) => {
  const token = req.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: 'Faça login para continuar.' });
  try { req.user = await getAuth().verifyIdToken(token, true); }
  catch { return res.status(401).json({ error: 'Sessão inválida ou expirada.' }); }
  if (!admins.has(req.user.uid)) return res.status(403).json({ error: 'Conta sem permissão de administrador.' });
  next();
});
const product = data => {
  const name = clean(data.name, 120), description = clean(data.description, 1000), category = clean(data.category, 100), imagePath = clean(data.imagePath, 1000), ingredients = clean(data.ingredients, 1000), price = Number(data.price);
  if (!name || !description || !category || !imagePath || !Number.isFinite(price) || price < 0 || price > 10000) throw Object.assign(new Error('Preencha nome, descrição, categoria, imagem e preço válido.'), { status: 400 });
  if (!/^(assets\/images\/[\w.-]+|https:\/\/[^\s]+)$/i.test(imagePath)) throw Object.assign(new Error('Imagem deve ser um endereço HTTPS ou imagem existente em assets/images.'), { status: 400 });
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
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(docs));
app.get('/api/openapi.json', (_req, res) => res.json(docs));
app.get('/api/products', database(async (_req, res) => { const snap = await db.collection('cardapio').get(); res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.category || '').localeCompare(b.category || '', 'pt-BR'))); }));
app.post('/api/products', auth, database(async (req, res) => { const ref = await db.collection('cardapio').add(product(req.body)); res.status(201).json({ id: ref.id }); }));
app.put('/api/products/:id', auth, database(async (req, res) => { const ref = db.collection('cardapio').doc(req.params.id); if (!(await ref.get()).exists) return res.status(404).json({ error: 'Produto não encontrado.' }); await ref.update(product(req.body)); res.json({ ok: true }); }));
app.delete('/api/products/:id', auth, database(async (req, res) => { await db.collection('cardapio').doc(req.params.id).delete(); res.sendStatus(204); }));
app.post('/api/orders', wrap(async (req, res) => {
  const nomeCliente = clean(req.body.nomeCliente, 100), mesa = clean(req.body.mesa, 60), items = req.body.itens;
  if (!nomeCliente || !mesa || !Array.isArray(items) || !items.length || items.length > 50) return res.status(400).json({ error: 'Informe nome, mesa e itens válidos.' });
  const ids = new Set(); for (const item of items) { if (typeof item.produtoId !== 'string' || !item.produtoId || item.produtoId.includes('/') || ids.has(item.produtoId) || !Number.isInteger(item.quantidade) || item.quantidade < 1 || item.quantidade > 99) return res.status(400).json({ error: 'Itens inválidos.' }); ids.add(item.produtoId); }
  await applicationDefault().getAccessToken();
  const token = randomBytes(32).toString('base64url'), ref = db.collection('pedidos').doc();
  await db.runTransaction(async tx => {
    const refs = items.map(i => db.collection('cardapio').doc(i.produtoId)); const snapshots = await tx.getAll(...refs);
    let cents = 0; const itens = snapshots.map((snap, index) => { if (!snap.exists) throw Object.assign(new Error('Um produto não está mais disponível.'), { status: 400 }); const data = snap.data(), price = Number(data.price); if (!Number.isFinite(price) || price < 0) throw Object.assign(new Error('Preço indisponível.'), { status: 400 }); const quantidade = items[index].quantidade, unit = Math.round(price * 100); cents += unit * quantidade; return { produtoId: snap.id, nome: data.name, quantidade, precoUnitario: unit / 100, subtotal: unit * quantidade / 100 }; });
    tx.create(ref, { nomeCliente, mesa, itens, total: cents / 100, status: 'recebido', criadoEm: FieldValue.serverTimestamp(), trackingHash: hash(token), historico: [{ status: 'recebido', data: Timestamp.now(), usuario: 'cliente' }], userId: 'web', userEmail: 'visitante' });
  });
  res.status(201).json({ id: ref.id, token });
}));
app.get('/api/orders', auth, database(async (_req, res) => { const snap = await db.collection('pedidos').orderBy('criadoEm', 'desc').limit(200).get(); res.json(snap.docs.map(d => { const { trackingHash, ...data } = d.data(); return { id: d.id, ...data }; })); }));
app.get('/api/orders/:id', database(async (req, res) => { const snap = await db.collection('pedidos').doc(req.params.id).get(), token = req.get('x-order-token') || ''; const expected = snap.exists ? snap.data().trackingHash : ''; const actual = hash(token); if (!expected || expected.length !== actual.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) return res.status(404).json({ error: 'Pedido não encontrado.' }); const d = snap.data(); res.json({ id: snap.id, status: d.status, total: d.total, itens: d.itens, criadoEm: d.criadoEm }); }));
app.patch('/api/orders/:id/status', auth, database(async (req, res) => { const status = clean(req.body.status, 30); if (!statuses.includes(status)) return res.status(400).json({ error: 'Status inválido.' }); const ref = db.collection('pedidos').doc(req.params.id); await db.runTransaction(async tx => { const snap = await tx.get(ref); if (!snap.exists) throw Object.assign(new Error('Pedido não encontrado.'), { status: 404 }); tx.update(ref, { status, historico: FieldValue.arrayUnion({ status, data: Timestamp.now(), usuario: req.user.email || req.user.uid }) }); }); res.json({ ok: true }); }));
const root = path.dirname(fileURLToPath(import.meta.url));
app.use('/assets/images', express.static(path.join(root, '../assets/images')));
app.get(['/admin', '/admin/'], (_req, res) => res.sendFile(path.join(root, 'public', 'index.html')));
app.use(express.static(path.join(root, 'public')));
app.use((err, _req, res, _next) => { console.error(err.message); res.status(err.status || 500).json({ error: err.status ? err.message : 'Não foi possível concluir a operação.' }); });
app.listen(Number(process.env.PORT) || 3000, () => console.log('Oca web iniciada'));
