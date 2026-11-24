import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const enabled = process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST;
test('fluxo integrado com emuladores isolados', { skip: !enabled, timeout: 60000 }, async () => {
  const projectId = 'demo-oca-local';
  const app = initializeApp({ projectId }, 'integration');
  const db = getFirestore(app);
  const server = spawn(process.execPath, ['server.js'], { cwd: import.meta.dirname, env: { ...process.env, FIREBASE_PROJECT_ID: projectId, ALLOW_ANY_AUTHENTICATED_ADMIN: 'true', PORT: '31989' }, stdio: 'ignore' });
  const base = 'http://127.0.0.1:31989';
  const controllers = [];
  try {
    let ready = false;
    for (let i=0;i<100;i++) { try { if ((await fetch(base)).ok) { ready=true; break; } } catch {} await new Promise(r=>setTimeout(r,100)); }
    assert.ok(ready, 'API não iniciou');
    const signup = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email:'professor@example.test', password:'senha-teste-123', returnSecureToken:true }) });
    assert.equal(signup.status,200);
    const { idToken } = await signup.json();
    const admin = { Authorization:`Bearer ${idToken}` };
    const json = { ...admin, 'Content-Type':'application/json' };
    const product = { name:'Açaí de teste', description:'Somente no emulador', category:'Açaí', ingredients:'Açaí', price:12.5, imagePath:'assets/images/acai.jpg' };
    assert.equal((await fetch(base+'/api/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(product)})).status,401);
    let response = await fetch(base+'/api/products',{method:'POST',headers:json,body:JSON.stringify(product)});
    assert.equal(response.status,201); const { id: productId } = await response.json();
    assert.ok((await (await fetch(base+'/api/products')).json()).some(p=>p.id===productId));
    response=await fetch(base+`/api/products/${productId}`,{method:'PUT',headers:json,body:JSON.stringify({...product,price:15})}); assert.equal(response.status,200);
    const image = Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+i3WQAAAAASUVORK5CYII=','base64'),Buffer.alloc(280000)]);
    response=await fetch(base+'/api/images',{method:'POST',headers:{...admin,'Content-Type':'image/png'},body:image}); assert.equal(response.status,201); const { imagePath }=await response.json();
    response=await fetch(base+imagePath); assert.equal(response.status,200); assert.deepEqual(Buffer.from(await response.arrayBuffer()),image);
    response=await fetch(base+'/api/images',{method:'POST',headers:{...admin,'Content-Type':'image/png'},body:'imagem inválida'}); assert.equal(response.status,400);
    response=await fetch(base+'/api/images',{method:'POST',headers:{...admin,'Content-Type':'image/png'},body:Buffer.alloc(4*1024*1024+1)}); assert.equal(response.status,413);
    response=await fetch(base+`/api/products/${productId}`,{method:'PUT',headers:json,body:JSON.stringify({...product,price:15,imagePath})}); assert.equal(response.status,200);
    const controller=new AbortController(); controllers.push(controller);
    const stream=await fetch(base+'/api/orders/stream',{headers:admin,signal:controller.signal}); assert.equal(stream.status,200);
    const reader=stream.body.getReader(); let pending='';
    async function nextEvent(){while(true){const ix=pending.indexOf('\n\n');if(ix>=0){const chunk=pending.slice(0,ix);pending=pending.slice(ix+2);const line=chunk.split('\n').find(s=>s.startsWith('data: '));if(line)return JSON.parse(line.slice(6));}else{const {value,done}=await reader.read();assert.equal(done,false,'Fluxo encerrou antes da atualização');pending+=new TextDecoder().decode(value);}}}
    await nextEvent();
    response=await fetch(base+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nomeCliente:'Pessoa de teste',mesa:'1',itens:[{produtoId:productId,quantidade:2}]})}); assert.equal(response.status,201); const order=await response.json();
    const received=await nextEvent();assert.ok(received.some(o=>o.id===order.id&&o.total===30));
    assert.equal((await fetch(base+`/api/orders/${order.id}`,{headers:{'X-Order-Token':'incorreto'}})).status,404);
    assert.equal((await fetch(base+`/api/orders/${order.id}/stream`,{headers:{'X-Order-Token':'incorreto'}})).status,404);
    const trackingController=new AbortController();controllers.push(trackingController);
    const tracking=await fetch(base+`/api/orders/${order.id}/stream`,{headers:{'X-Order-Token':order.token},signal:trackingController.signal}); assert.equal(tracking.status,200);
    const trackReader=tracking.body.getReader();let trackText='';while(!trackText.includes('"recebido"')) {const chunk=await trackReader.read();assert.equal(chunk.done,false);trackText+=new TextDecoder().decode(chunk.value);}
    response=await fetch(base+`/api/orders/${order.id}/status`,{method:'PATCH',headers:json,body:JSON.stringify({status:'pronto'})}); assert.equal(response.status,200);
    while(!trackText.includes('"pronto"')) {const chunk=await trackReader.read();assert.equal(chunk.done,false);trackText+=new TextDecoder().decode(chunk.value);}
    const saved=(await db.collection('pedidos').doc(order.id).get()).data();assert.equal(saved.status,'pronto');assert.equal(saved.historico.length,2);assert.equal(saved.historico[1].usuario,'professor@example.test');
    response=await fetch(base+`/api/products/${productId}`,{method:'DELETE',headers:admin});assert.equal(response.status,204);
  } finally { controllers.forEach(c=>c.abort());server.kill();await deleteApp(app); }
});
