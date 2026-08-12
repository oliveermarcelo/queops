import { chromium } from 'playwright';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@queopspiramides.com.br';
const ADMIN_PASS = process.env.ADMIN_PASS ?? 'DemoQueops2026!';
const log=[]; const ok=m=>log.push('  OK  '+m); const fail=m=>log.push('FALHA '+m);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await (await b.newContext()).newPage();

// 1) entra no painel e edita o preço de um produto
await p.goto(BASE+'/admin',{waitUntil:'networkidle'});
await p.fill('#admin-email',ADMIN_EMAIL);
await p.fill('#admin-pass',ADMIN_PASS);
await p.click('button[type=submit]');
await p.waitForTimeout(2500);

const novoPreco = 1234.56;
const res = await p.evaluate(async (preco) => {
  const s = await (await fetch('/api/session')).json();
  const st = await (await fetch('/api/admin/state')).json();
  const prod = st.products.find(x => x.id === 'placa-de-cobre-m-1001');
  const r = await fetch('/api/admin/products', {
    method:'POST',
    headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrfToken},
    body: JSON.stringify({ ...prod, price: preco }),
  });
  return { status: r.status, antes: prod.price, body: await r.json() };
}, novoPreco);
res.status === 200 ? ok(`preço alterado no painel: R$ ${res.antes} → R$ ${novoPreco}`) : fail('falha ao salvar: '+res.status);

// 2) a vitrine (outra "aba") reflete o novo preço
await p.goto(BASE,{waitUntil:'networkidle'});
await p.waitForTimeout(1200);
const catalogo = await p.evaluate(async()=> (await (await fetch('/api/catalog')).json()).products.find(x=>x.id==='placa-de-cobre-m-1001'));
catalogo.price === novoPreco ? ok('vitrine lê o preço novo do banco') : fail('vitrine ainda em '+catalogo.price);

const texto = await p.locator('body').innerText();
texto.includes('1.234,56') ? ok('preço novo renderizado na home') : fail('preço não apareceu na home');

// 3) exclusão some da vitrine
const del = await p.evaluate(async()=>{
  const s = await (await fetch('/api/session')).json();
  const r = await fetch('/api/admin/products/placa-de-cobre-m-1001',{method:'DELETE',headers:{'X-CSRF-Token':s.csrfToken}});
  const cat = await (await fetch('/api/catalog')).json();
  return { status:r.status, aindaExiste: cat.products.some(x=>x.id==='placa-de-cobre-m-1001') };
});
!del.aindaExiste ? ok('produto excluído some do catálogo público') : fail('produto continua na vitrine');

// restaura
await p.evaluate(async(preco)=>{
  const s = await (await fetch('/api/session')).json();
  const st = await (await fetch('/api/admin/state')).json();
  const prod = st.products.find(x=>x.id==='placa-de-cobre-m-1001');
  await fetch('/api/admin/products',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrfToken},body:JSON.stringify({...prod,price:preco,active:true})});
}, res.antes);
ok('estado original restaurado');

await b.close();
console.log(log.join('\n'));
const f=log.filter(l=>l.startsWith('FALHA')).length;
console.log(f?`\n${f} falha(s)`:'\nPainel e vitrine estão na mesma base de dados');
process.exit(f?1:0);
