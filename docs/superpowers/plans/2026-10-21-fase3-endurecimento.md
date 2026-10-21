# Fase 3 — Endurecimento: plano de execução

> **Para quem executar:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Passos usam checkbox (`- [ ]`).

**Objetivo:** fechar as brechas que sobram depois das Fases 1 e 2: segredo no repositório, dependências vulneráveis (`xlsx` sem correção), ausência de cabeçalhos de segurança e de limite de requisições, regras abertas no Firestore, e falta de testes que exercitem os fluxos de dinheiro de ponta a ponta.

**Arquitetura:** primeiro um repositório de dados **em memória** (`DATA_BACKEND=memory`, proibido em produção) e um harness de teste, para que as rotas possam ser testadas de verdade sem tocar em banco (e sem o processo de teste pendurar). Sobre ele entram os testes dos fluxos de dinheiro, os testes de cabeçalhos/limite/CORS e, por último, a divisão do `app.ts` com uma "foto" da tabela de rotas como rede de segurança. Limite de requisições é um módulo próprio, puro (sem dependência nova). Cabeçalhos para o site estático vão em `vercel.json` (o Express só atende `/api` na Vercel); `helmet` cobre as respostas da API.

**Stack:** Express, TypeScript ESM, Vercel, Supabase, Firebase Auth, React/Vite, `node:test` via `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-20-seguranca-integridade-design.md` (Fase 3, itens 3.1 a 3.6). Regras de negócio que não podem mudar: `docs/superpowers/specs/2026-10-16-faltando-nf-design.md`.

## Passos do dono, ANTES de cada tarefa que os cita (não são código)
- **T1:** conferir na Vercel (Settings → Environment Variables) se `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` existem em Production e Preview. Se não existirem, hoje o push roda com a chave que está no repositório; criar as variáveis (com o par atual ou, melhor, um par novo) **antes** do deploy da T1, senão o push para de funcionar. Trocar o par invalida as inscrições de notificação: cada pessoa reativa as notificações uma vez.
- **T6/T7:** conferir que `DATA_BACKEND=supabase` está na Vercel (Production). Depois do deploy, publicar as novas regras do Firestore (Firebase Console → Firestore → Regras → colar o conteúdo de `firestore.rules` → Publicar).
- **T9:** restringir a chave de API do Firebase apenas por **Restrições de API** (Google Cloud Console → APIs e serviços → Credenciais → a chave "Browser key" → Restrições de API → Identity Toolkit API e Token Service API). NÃO usar referenciadores HTTP: o servidor chama o Identity Toolkit com essa chave, sem Referer, e todo login falharia (401).

## Rulings (decisões já tomadas, com custo se erradas)
- **Ordem:** a divisão do `app.ts` (T8) vem por último e depois dos testes de fluxo (T4), que servem de rede de segurança. Pode ser pulada sem afetar o resto. Custo se errado: nenhum além de `app.ts` continuar grande.
- **CSP começa em modo "somente relatório"** (`Content-Security-Policy-Report-Only`): não bloqueia nada, só registra no console do navegador o que quebraria. Os outros cabeçalhos já valem de verdade. Motivo: o login Google (popup do Firebase), fontes, imagens externas e push são fáceis de quebrar com CSP rígida. Custo se errado: a política só protege depois de uma segunda rodada (trocar para modo ativo após você navegar o sistema sem relatos).
- **Não definir `Cross-Origin-Opener-Policy: same-origin`:** quebra o login por popup do Google. Custo se errado: nenhum.
- **Limite de requisições por instância** (memória), com valores generosos: 600/min por IP (escritórios compartilham IP), 300/min por pessoa logada, 20/min por pessoa nas rotas de IA/importação. Configuráveis por variável de ambiente. Custo se errado: limites altos demais não incomodam e baixos demais podem barrar uso legítimo (ajuste por variável, sem novo deploy de código).
- **`xlsx` → `exceljs`:** o módulo novo mora em `src/shared/spreadsheet.ts` (assim os testes do projeto o alcançam). Datas em células continuam saindo como número serial do Excel (igual ao comportamento antigo do `xlsx`, para não mudar o que as telas recebem). **Arquivos `.xls` antigos deixam de ser lidos** (o `exceljs` só lê `.xlsx`); a tela avisa para salvar como `.xlsx`. Custo se errado: quem ainda usa `.xls` precisa converter.
- **Firestore "negar tudo":** o front só usa o Firestore para ligar/desligar a rede (nenhuma leitura/gravação). O backend em produção usa Supabase. `DATA_BACKEND=firestore` com o SDK de cliente (sem Admin) deixa de funcionar com essas regras; só vale localmente com credenciais de administrador. Custo se errado: reverter o arquivo de regras e republicar.
- **Tamanho de corpo:** `BODY_LIMIT` padrão `4mb` na Vercel (limite real da plataforma é 4,5 MB) e `10mb` fora dela; erro 413 com mensagem em português. Custo se errado: nenhum, a Vercel já recusava acima de 4,5 MB, só que sem mensagem clara.
- **Chave de API do Firebase no repositório** (`firebase-applet-config.json`, `config.ts`) é pública por desenho (todo site Firebase a expõe); a proteção é a restrição por API (passo do dono em T9; **não** por referenciador HTTP, pois o servidor usa a mesma chave), não removê-la do código.

## Restrições globais
- Imports relativos em `src/backend` e `src/shared` terminam em `.js` (nos arquivos de teste, `.ts`, como os existentes).
- Arquivos do working tree têm CRLF (`core.autocrlf=true`); edite com Edit/scripts que preservem as quebras.
- `tsconfig` não é `strict`: interfaces com campos opcionais, não uniões discriminadas.
- Mensagens para o usuário em português.
- Testes: só os direcionados — `npx tsx --test "src/shared/*.test.ts" "src/backend/**/*.test.ts"` (sem `routes.reminders.test.ts` quando ele pendurar) e `npx tsc --noEmit`. Nunca `npm test` completo. `src/backend/data/routes.reminders.test.ts` só com `--test-name-pattern` e `timeout`.
- Nenhum teste novo toca em banco real: rotas só com `DATA_BACKEND=memory` (T4 em diante).
- Commits só quando o dono pedir. Nenhum deploy automático de regras do Firestore.

## Estrutura de arquivos
- Modificar `src/backend/config.ts` (+ criar `src/backend/config.test.ts`), `src/backend/services/pushService.ts`, `.env.example`, `README.md`, criar `.gitattributes`.
- Modificar `package.json`/`package-lock.json` (T2, T3, T5).
- Criar `src/shared/spreadsheet.ts`, `src/shared/spreadsheet.test.ts`, `src/shared/__fixtures__/*.xlsx` e `*.golden.json`; modificar `src/frontend/hooks/useExcel.ts`, `src/frontend/components/DREVendasView.tsx`.
- Criar `src/backend/data/memoryRepo.ts`, `src/backend/testing/harness.ts`, `src/backend/integration/money-flows.test.ts`; modificar `src/backend/data/index.ts`, `src/backend/app.ts`.
- Modificar `vercel.json`; criar `src/backend/vercelConfig.test.ts`, `src/backend/integration/http-hardening.test.ts`.
- Criar `src/backend/rateLimit.ts`, `src/backend/rateLimit.test.ts`.
- Modificar `firestore.rules`, `security_spec.md`.
- T8: criar `src/backend/http.ts`, `src/backend/routes/*.ts`, `src/backend/integration/route-table.test.ts` + `route-table.golden.json`.

---

### Tarefa 1: Configuração e segredos

**Arquivos:** modificar `src/backend/config.ts`, `src/backend/services/pushService.ts`, `.env.example`, `README.md`; criar `src/backend/config.test.ts`, `.gitattributes`.

**Interfaces:**
- Produz: `resolvePushConfig(env: NodeJS.ProcessEnv): { publicKey: string; privateKey: string; email: string }` (sem valores padrão para as chaves) e `PUSH_CONFIG = resolvePushConfig(process.env)`.

- [ ] **Passo 1: Teste que falha**

Criar `src/backend/config.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePushConfig } from './config.ts';

test('sem variáveis, as chaves VAPID ficam vazias (nenhuma chave embutida no código)', () => {
  const c = resolvePushConfig({} as any);
  assert.equal(c.publicKey, '');
  assert.equal(c.privateKey, '');
});

test('com variáveis, usa os valores e o contato configurável', () => {
  const c = resolvePushConfig({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_CONTACT_EMAIL: 'mailto:x@y.com' } as any);
  assert.deepEqual(c, { publicKey: 'pub', privateKey: 'priv', email: 'mailto:x@y.com' });
});

test('contato padrão continua o que já era', () => {
  assert.equal(resolvePushConfig({} as any).email, 'mailto:vitorisalves1@gmail.com');
});
```
Run: `npx tsx --test src/backend/config.test.ts` → FAIL (`resolvePushConfig` não existe).

- [ ] **Passo 2: Implementar**

Em `src/backend/config.ts`, trocar o bloco `export const PUSH_CONFIG = {...};` (linhas ≈ 126-130, com as chaves embutidas) por:

```ts
export function resolvePushConfig(env: NodeJS.ProcessEnv) {
  return {
    publicKey: (env.VAPID_PUBLIC_KEY || '').trim(),
    privateKey: (env.VAPID_PRIVATE_KEY || '').trim(),
    email: env.VAPID_CONTACT_EMAIL || 'mailto:vitorisalves1@gmail.com'
  };
}

export const PUSH_CONFIG = resolvePushConfig(process.env);
```
Run: `npx tsx --test src/backend/config.test.ts` → PASS.

- [ ] **Passo 3: O push sem chave não pode derrubar o servidor**

Ler `src/backend/services/pushService.ts` (`init`, `broadcast`) e o uso de `PUSH_CONFIG.publicKey` em `GET /api/notifications/vapid-key` (`app.ts`). Ajustar: se `publicKey` ou `privateKey` estiver vazio, `PushService.init()` registra `console.warn('[Push] VAPID não configurado: notificações push desativadas.')` e **não** chama `webpush.setVapidDetails`; `broadcast` vira no-op quando não inicializado. A rota `vapid-key` continua respondendo `{ publicKey: PUSH_CONFIG.publicKey }` (string vazia quando desativado). Conferir no front (`grep -rn "vapid-key" src/frontend`) que um `publicKey` vazio não gera erro: se o código assina o push com ele, acrescentar `if (!publicKey) return;` antes de assinar.

- [ ] **Passo 4: Avisos de configuração na subida**

Em `src/backend/app.ts`, logo depois do aviso de `DISABLE_PERMISSION_ENFORCEMENT` (bloco "ACESSO"), acrescentar:

```ts
if ((IS_VERCEL || process.env.NODE_ENV === 'production') && !process.env.SUPER_ADMIN_EMAIL) {
  console.warn('[Config] SUPER_ADMIN_EMAIL ausente: ninguém será admin. Defina a variável na Vercel.');
}
```
(`IS_VERCEL` já é importado em `app.ts`; confirme.)

- [ ] **Passo 5: Documentação e quebras de linha**

1. `.env.example`: acrescentar `VAPID_CONTACT_EMAIL=mailto:seu-email@exemplo.com` (comentário: contato exibido aos serviços de push) e reforçar o comentário das chaves VAPID: "Obrigatórias. Sem elas o push fica desativado. Nunca coloque as chaves no código."
2. `README.md`: na seção de configuração/Acesso, acrescentar "Checklist de produção" com: variáveis obrigatórias na Vercel (`SUPER_ADMIN_EMAIL`, `DATA_BACKEND=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `G_API_KEY`), `DISABLE_PERMISSION_ENFORCEMENT` **não** deve existir, e (anotado para a T9) restrição da chave do Firebase por domínio.
3. Criar `.gitattributes` com:

```
* text=auto
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.xlsx binary
*.pdf binary
```

- [ ] **Passo 6: Rodar**

Run: `npx tsc --noEmit` e `npx tsx --test src/backend/config.test.ts src/backend/auth/*.test.ts`
Expected: limpo / PASS.

- [ ] **Passo 7: Commit (somente se o dono pedir)**

```bash
git add .gitattributes .env.example README.md src/backend/config.ts src/backend/config.test.ts src/backend/services/pushService.ts src/backend/app.ts src/frontend
git commit -m "fix(config): remove chave VAPID embutida no código; avisos de configuração (Fase 3.6)"
```

---

### Tarefa 2: Dependências vulneráveis

**Arquivos:** modificar `package.json`, `package-lock.json`.

- [ ] **Passo 1: Registrar o ponto de partida**

Run: `npm audit --json` e anotar no relatório o total por severidade (hoje: 2 críticas, 15 altas, 12 moderadas, 3 baixas) e quais são diretas: `axios`, `esbuild`, `firebase-admin`, `postcss`, `vite`, `xlsx`.

- [ ] **Passo 2: Aplicar só as correções sem troca de versão maior**

Run: `npm audit fix` (**sem** `--force`). Anotar o que mudou (`git diff --stat package.json package-lock.json`).

- [ ] **Passo 3: Reauditar e listar o que sobrou**

Run: `npm audit`. O que ainda aparecer deve ser: `xlsx` (sem correção; tratado na T3) e `vite`/`esbuild` (correção exige Vite 8, versão maior; **não aplicar**, só informar ao dono: afeta apenas o servidor de desenvolvimento). Qualquer outra vulnerabilidade restante, descrever no relatório com o motivo.

- [ ] **Passo 4: Verificar que nada quebrou**

Run, nesta ordem: `npx tsc --noEmit`; `npx tsx --test "src/shared/*.test.ts" "src/backend/auth/*.test.ts" "src/backend/*.test.ts" "src/backend/services/*.test.ts" src/backend/data/supabaseRepo.test.ts src/backend/data/version.test.ts`; `npx vite build`; `npx esbuild src/backend/server.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/server.cjs` (o passo de servidor do `npm run build`).
Expected: tudo limpo e passando.

- [ ] **Passo 5: Commit (somente se o dono pedir)**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): npm audit fix sem trocas de versão maior (Fase 3.1)"
```

---

### Tarefa 3: Trocar `xlsx` por `exceljs`

**Arquivos:** criar `src/shared/spreadsheet.ts`, `src/shared/spreadsheet.test.ts`, `src/shared/__fixtures__/` (xlsx + golden), um script descartável `scripts/dev/make-xlsx-fixtures.ts`; modificar `src/frontend/hooks/useExcel.ts`, `src/frontend/components/DREVendasView.tsx`, `package.json`, `package-lock.json`.

**Interfaces:**
- Produz (em `src/shared/spreadsheet.ts`): `readSheetAsArrays(buffer: ArrayBuffer): Promise<any[][]>`, `readSheetAsObjects(buffer: ArrayBuffer): Promise<Record<string, any>[]>`, `buildXlsx(sheetName: string, rows: any[][], colWidths?: number[]): Promise<ArrayBuffer>`, `objectsToRows(objs: Record<string, any>[]): any[][]`.

**Por que o desenho é este:** o ganho de segurança só vale se as telas receberem os mesmos dados de antes. Por isso, **antes de remover o `xlsx`**, planilhas de exemplo são lidas com a biblioteca antiga para gerar resultados de referência ("golden"), e o módulo novo precisa reproduzi-los.

- [ ] **Passo 1: Instalar `exceljs` (ainda mantendo `xlsx`)**

Run: `npm install exceljs@4.4.0`

- [ ] **Passo 2: Gerar planilhas de exemplo e resultados de referência com o `xlsx` antigo**

Criar `scripts/dev/make-xlsx-fixtures.ts` (uso único; será apagado no passo 9) que, com `import * as XLSX from 'xlsx'` e `node:fs`, escreve em `src/shared/__fixtures__/`:
- `fornecedores.xlsx` — aba "Fornecedores", cabeçalho `Empresa Razão Social | Telefone | Produto | Preço | Categoria | Ultima Data Compra | Forma de Pagamento`, 4 linhas de dados incluindo: preço numérico, preço como texto `"1.234,56"`, uma linha totalmente vazia no meio, e uma célula vazia no meio de uma linha.
- `dre-vendas.xlsx` — duas linhas de título acima do cabeçalho, depois `Descrição | Vendedor | Quantidade | Valor`, 3 linhas de dados, uma célula de fórmula (`=C5*D5`), uma célula de data real (`new Date(2026,9,5)`), e uma célula com texto formatado.
Para cada arquivo, grava também `<nome>.objects.golden.json` = `XLSX.utils.sheet_to_json(ws)` e `<nome>.arrays.golden.json` = `XLSX.utils.sheet_to_json(ws, { header: 1 })`, ambos via `JSON.stringify(valor, (_k, v) => v === undefined ? null : v, 2)`.
Run: `npx tsx scripts/dev/make-xlsx-fixtures.ts`. Conferir que os 6 arquivos existem e são pequenos (`ls -la src/shared/__fixtures__`).

- [ ] **Passo 3: Teste de paridade que falha**

Criar `src/shared/spreadsheet.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readSheetAsArrays, readSheetAsObjects, buildXlsx, objectsToRows } from './spreadsheet.ts';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const load = (name: string) => {
  const b = readFileSync(path.join(dir, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const golden = (name: string) => JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
// compara como JSON: undefined e null se equivalem; números com tolerância
const norm = (v: any): any => JSON.parse(JSON.stringify(v, (_k, x) => (x === undefined ? null : x)));
function assertSame(actual: any, expected: any) {
  const a = norm(actual); const e = norm(expected);
  assert.equal(JSON.stringify(a, null, 1) === JSON.stringify(e, null, 1) || approxEqual(a, e), true,
    `diferente:\nreal=${JSON.stringify(a)}\nesperado=${JSON.stringify(e)}`);
}
function approxEqual(a: any, e: any): boolean {
  if (typeof a === 'number' && typeof e === 'number') return Math.abs(a - e) < 1e-6;
  if (Array.isArray(a) && Array.isArray(e)) return a.length === e.length && a.every((x, i) => approxEqual(x, e[i]));
  if (a && e && typeof a === 'object' && typeof e === 'object') {
    const ka = Object.keys(a); const ke = Object.keys(e);
    return ka.length === ke.length && ka.every(k => approxEqual(a[k], e[k]));
  }
  return a === e;
}

for (const name of ['fornecedores', 'dre-vendas']) {
  test(`${name}: leitura como objetos igual à da biblioteca antiga`, async () => {
    assertSame(await readSheetAsObjects(load(`${name}.xlsx`)), golden(`${name}.objects.golden.json`));
  });
  test(`${name}: leitura como matriz igual à da biblioteca antiga`, async () => {
    assertSame(await readSheetAsArrays(load(`${name}.xlsx`)), golden(`${name}.arrays.golden.json`));
  });
}

test('escrever e ler de volta devolve os mesmos dados', async () => {
  const rows = [['Produto', 'Preço'], ['Arroz', 12.5], ['Feijão', 8]];
  const buf = await buildXlsx('Teste', rows, [20, 10]);
  assert.deepEqual(norm(await readSheetAsArrays(buf)), norm(rows));
});

test('objectsToRows usa as chaves do primeiro objeto como cabeçalho, na ordem', () => {
  assert.deepEqual(objectsToRows([{ a: 1, b: 'x' }, { a: 2, b: 'y' }]), [['a', 'b'], [1, 'x'], [2, 'y']]);
  assert.deepEqual(objectsToRows([]), []);
});
```
Run: `npx tsx --test src/shared/spreadsheet.test.ts` → FAIL (módulo não existe).

- [ ] **Passo 4: Implementar o módulo**

Criar `src/shared/spreadsheet.ts`:

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Leitura/escrita de .xlsx com exceljs (substitui o xlsx, que tem vulnerabilidades sem correção).
// exceljs só lê .xlsx (não lê .xls antigo). O módulo é carregado sob demanda para não pesar no
// carregamento inicial do site.

const loadExcelJs = async () => (await import('exceljs')).default;

const EXCEL_EPOCH_OFFSET_DAYS = 25569; // 1970-01-01 em número serial do Excel

/** Normaliza o valor de uma célula para o que o xlsx antigo entregava às telas. */
function cellToValue(v: any): any {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return v.getTime() / 86400000 + EXCEL_EPOCH_OFFSET_DAYS; // serial, como antes
  if (typeof v === 'object') {
    if ('result' in v) return cellToValue(v.result);                       // fórmula: valor calculado
    if (Array.isArray(v.richText)) return v.richText.map((r: any) => r.text).join('');
    if ('text' in v) return v.text;                                        // link
    return undefined;                                                      // erro etc.
  }
  return v;
}

async function firstSheet(buffer: ArrayBuffer) {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets[0];
}

/** Todas as linhas da primeira aba como matrizes (equivale ao sheet_to_json com header: 1). */
export async function readSheetAsArrays(buffer: ArrayBuffer): Promise<any[][]> {
  const ws = await firstSheet(buffer);
  if (!ws) return [];
  const rows: any[][] = [];
  for (let r = 1; r <= ws.actualRowCount || r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values = (row.values as any[]).slice(1).map(cellToValue);
    while (values.length > 0 && values[values.length - 1] === undefined) values.pop();
    rows.push(values);
  }
  while (rows.length > 0 && rows[rows.length - 1].length === 0) rows.pop();
  return rows;
}

/** Linhas como objetos usando a 1ª linha como cabeçalho; linhas vazias são ignoradas (equivale ao sheet_to_json padrão). */
export async function readSheetAsObjects(buffer: ArrayBuffer): Promise<Record<string, any>[]> {
  const rows = await readSheetAsArrays(buffer);
  if (rows.length === 0) return [];
  const header = rows[0].map(h => (h === undefined || h === null ? '' : String(h)));
  const seen = new Map<string, number>();
  const keys = header.map(h => {
    if (h === '') return '';
    const n = seen.get(h) ?? 0; seen.set(h, n + 1);
    return n === 0 ? h : `${h}_${n}`; // cabeçalhos repetidos ganham sufixo, como no xlsx
  });
  const out: Record<string, any>[] = [];
  for (const row of rows.slice(1)) {
    const obj: Record<string, any> = {};
    let any = false;
    keys.forEach((k, i) => {
      if (!k || row[i] === undefined) return;
      obj[k] = row[i]; any = true;
    });
    if (any) out.push(obj);
  }
  return out;
}

/** Cabeçalho (chaves do 1º objeto) + linhas. */
export function objectsToRows(objs: Record<string, any>[]): any[][] {
  if (objs.length === 0) return [];
  const keys = Object.keys(objs[0]);
  return [keys, ...objs.map(o => keys.map(k => o[k]))];
}

/** Gera o arquivo .xlsx de uma aba. `colWidths` em caracteres. */
export async function buildXlsx(sheetName: string, rows: any[][], colWidths?: number[]): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  rows.forEach(r => ws.addRow(r));
  if (colWidths) colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const out = await wb.xlsx.writeBuffer();
  const u8 = new Uint8Array(out as ArrayBuffer);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}
```
Run: `npx tsx --test src/shared/spreadsheet.test.ts`. **Se algum teste de paridade falhar, ajustar o módulo (não o golden)** até igualar: os pontos mais prováveis são linhas vazias no meio (matriz mantém `[]`, objetos descartam), célula vazia no meio da linha (buraco `null`/`undefined`), e a data (serial). Se uma diferença for inevitável, descrevê-la no relatório com o caso e o motivo, sem alterar o golden.

- [ ] **Passo 5: Trocar nos dois usos do front**

1. `src/frontend/hooks/useExcel.ts`:
   - remover `import * as XLSX from 'xlsx';`; importar `import { readSheetAsObjects, buildXlsx, objectsToRows } from '../../shared/spreadsheet';` e `import { downloadArrayBuffer } from '../utils/downloadFile';`;
   - `handleExportExcel` vira `async`: `const buf = await buildXlsx('Fornecedores', objectsToRows(exportData), [28, 16, 40, 12, 28, 20, 22]); downloadArrayBuffer(buf, 'Labarr_Fornecedores.xlsx');` e depois a notificação;
   - em `handleImportExcel`, trocar as três linhas `XLSX.read`/`SheetNames`/`sheet_to_json` por `const rawData = await readSheetAsObjects(data as ArrayBuffer);` (o `onload` já é `async`). No `catch`, se o erro indicar arquivo não-xlsx (mensagem do exceljs contendo "zip" / "central directory" / "end of central directory"), `addNotification('Arquivo não reconhecido. Salve a planilha como .xlsx e tente de novo.', 0)`; senão manter a mensagem atual.
2. Criar `src/frontend/utils/downloadFile.ts`:

```ts
/** Baixa um arquivo gerado no navegador (substitui XLSX.writeFile). */
export function downloadArrayBuffer(buffer: ArrayBuffer, fileName: string, mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  const url = URL.createObjectURL(new Blob([buffer], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```
3. `src/frontend/components/DREVendasView.tsx`:
   - remover `import * as XLSX from 'xlsx';`; importar `readSheetAsArrays`, `buildXlsx` de `../../shared/spreadsheet` e `downloadArrayBuffer`;
   - nas duas funções de exportação (`handleExportDadosExcel`, e a de "Conferencia Vendedor"): trocar `XLSX.utils.book_new/aoa_to_sheet/!cols/book_append_sheet/XLSX.write` por `const excelsheetObj = await buildXlsx('<nome da aba>', dataForSheet, <as larguras já calculadas, como números>);` (as larguras hoje são `{ wch: n }`: passar só os `n`); o `Blob` continua sendo criado a partir de `excelsheetObj`; o fallback `XLSX.writeFile(wb, fullName)` vira `downloadArrayBuffer(excelsheetObj, fullName)`;
   - em `handleImportExcel(file)`: trocar `XLSX.read`/`SheetNames`/`sheet_to_json({header:1})` por `const rawArray = await readSheetAsArrays(data as ArrayBuffer);` (tornar o `reader.onload` `async`). O resto da função (descoberta do cabeçalho etc.) não muda;
   - no `<input accept=".xlsx,.xls">` (≈ linha 1562) trocar por `accept=".xlsx"` e, no `catch` da leitura, avisar `'Arquivo não reconhecido. Salve a planilha como .xlsx e tente de novo.'`.

- [ ] **Passo 6: Remover o `xlsx` e o script descartável**

Run: `npm uninstall xlsx`; apagar `scripts/dev/make-xlsx-fixtures.ts` (e a pasta `scripts/dev` se ficar vazia). **Manter** `src/shared/__fixtures__/` (xlsx + goldens). Conferir `grep -rn "from 'xlsx'" src` → nada.

- [ ] **Passo 7: Verificar**

Run: `npx tsc --noEmit`; `npx tsx --test "src/shared/*.test.ts"`; `npx vite build` (anotar o aviso de tamanho de chunk, se mudou); `npm audit` (o `xlsx` deve ter sumido da lista).

- [ ] **Passo 8: Commit (somente se o dono pedir)**

```bash
git add package.json package-lock.json src/shared src/frontend scripts
git commit -m "feat: troca xlsx por exceljs com testes de paridade (Fase 3.1)"
```

**Verificação manual do dono (depois do deploy):** importar uma planilha real de fornecedores e uma de DRE de vendas; exportar as duas e abrir no Excel. Comparar com o que o sistema fazia antes.

---

### Tarefa 4: Repositório em memória e testes dos fluxos de dinheiro

**Arquivos:** criar `src/backend/data/memoryRepo.ts`, `src/backend/data/memoryRepo.test.ts`, `src/backend/testing/harness.ts`, `src/backend/integration/money-flows.test.ts`; modificar `src/backend/data/index.ts`, `src/backend/app.ts`.

**Interfaces:**
- Produz: `makeMemoryRepo(): DataRepo` (JSON em memória; implementa todos os métodos de `DataRepo`, inclusive `updateIfVersion`); `startTestServer(): Promise<{ base: string; api(method, path, body?): Promise<{ status: number; body: any }>; close(): Promise<void>; repo: DataRepo }>`.
- `DATA_BACKEND=memory` só é aceito fora da Vercel e fora de `NODE_ENV=production` (lança erro na subida caso contrário). `DISABLE_BACKGROUND_WORKER=1` impede o worker de lembretes e a limpeza inicial (que mantêm o processo de teste vivo).

- [ ] **Passo 1: Teste do repositório em memória (falha)**

Criar `src/backend/data/memoryRepo.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMemoryRepo } from './memoryRepo.ts';

test('set/getDoc/getDocs/delete funcionam e copiam os dados (sem aliasing)', async () => {
  const repo = makeMemoryRepo();
  const data = { name: 'ACME', n: 1 };
  await repo.set(repo.doc('suppliers', 's1'), data, 'suppliers/s1');
  data.name = 'mudou depois';
  const snap = await repo.getDoc(repo.doc('suppliers', 's1'));
  assert.equal(snap.exists(), true);
  assert.equal(snap.data().name, 'ACME');
  const all = await repo.getDocs('suppliers');
  assert.equal(all.docs.length, 1);
  await repo.delete(repo.doc('suppliers', 's1'));
  assert.equal((await repo.getDoc(repo.doc('suppliers', 's1'))).exists(), false);
  assert.equal((await repo.getDocs('suppliers')).empty, true);
});

test('update mescla campos; getDoc de documento inexistente devolve exists() falso', async () => {
  const repo = makeMemoryRepo();
  await repo.set(repo.doc('c', 'a'), { x: 1, y: 2 });
  await repo.update(repo.doc('c', 'a'), { y: 3, z: 4 });
  assert.deepEqual((await repo.getDoc(repo.doc('c', 'a'))).data(), { x: 1, y: 3, z: 4 });
  assert.equal((await repo.getDoc(repo.doc('c', 'nao'))).exists(), false);
});

test('updateIfVersion: ok, conflict e not_found', async () => {
  const repo = makeMemoryRepo();
  await repo.set(repo.doc('l', 'a'), { items: [], version: 2 });
  assert.equal(await repo.updateIfVersion(repo.doc('l', 'a'), { items: [1] }, 2), 'ok');
  assert.equal((await repo.getDoc(repo.doc('l', 'a'))).data().version, 3);
  assert.equal(await repo.updateIfVersion(repo.doc('l', 'a'), { items: [2] }, 2), 'conflict');
  assert.equal(await repo.updateIfVersion(repo.doc('l', 'nao'), { items: [] }, 0), 'not_found');
});

test('getDocsWithLimit respeita o limite', async () => {
  const repo = makeMemoryRepo();
  for (let i = 0; i < 5; i++) await repo.set(repo.doc('c', `d${i}`), { i });
  assert.equal((await repo.getDocsWithLimit('c', 2)).docs.length, 2);
});
```
Run: `npx tsx --test src/backend/data/memoryRepo.test.ts` → FAIL.

- [ ] **Passo 2: Implementar `memoryRepo.ts`**

Ler `src/backend/data/types.ts` (interface `DataRepo` completa) e `getPendingReminders` em `supabaseRepo.ts` (≈ linhas 259-275) para copiar a regra de "lembretes pendentes". Criar `src/backend/data/memoryRepo.ts`:

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DataRepo, DocData, DocRef, DocSnapshot, QuerySnapshot } from './types.js';
import { versionOf } from './version.js';

/** Repositório em memória para testes (guardado por DATA_BACKEND=memory; proibido em produção). */
export function makeMemoryRepo(): DataRepo {
  const store = new Map<string, Map<string, DocData>>();
  const versions = new Map<string, number>();
  const table = (c: string) => { let t = store.get(c); if (!t) { t = new Map(); store.set(c, t); } return t; };
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)); // como o jsonb: sem undefined/Date
  const snap = (id: string, data: DocData | undefined): DocSnapshot => ({
    id, data: () => clone(data ?? {}), exists: () => data !== undefined,
  });
  const qs = (docs: DocSnapshot[]): QuerySnapshot => ({ docs, empty: docs.length === 0 });
  const bump = (c: string) => versions.set(c, (versions.get(c) ?? 0) + 1);
  const refOf = async (r: DocRef | Promise<DocRef>) => r instanceof Promise ? await r : r;

  const repo: DataRepo = {
    async collection(c: string) { return table(c); },
    async getDocs(c: string) { return qs([...table(c)].map(([id, d]) => snap(id, d))); },
    async getDocsWithLimit(c: string, n: number) { return qs([...table(c)].slice(0, n).map(([id, d]) => snap(id, d))); },
    async getDoc(ref) { const r = await refOf(ref); return snap(r.__id, table(r.__coll).get(r.__id)); },
    async doc(c: string, id: string) { return { __coll: c, __id: id }; },
    async set(ref, data) { const r = await refOf(ref); table(r.__coll).set(r.__id, clone(data)); bump(r.__coll); },
    async update(ref, data) {
      const r = await refOf(ref);
      table(r.__coll).set(r.__id, { ...(table(r.__coll).get(r.__id) ?? {}), ...clone(data) }); bump(r.__coll);
    },
    async updateIfVersion(ref, patch, expectedVersion) {
      const r = await refOf(ref);
      const cur = table(r.__coll).get(r.__id);
      if (!cur) return 'not_found';
      if (versionOf(cur) !== expectedVersion) return 'conflict';
      table(r.__coll).set(r.__id, { ...cur, ...clone(patch), version: expectedVersion + 1 }); bump(r.__coll);
      return 'ok';
    },
    async delete(ref) { const r = await refOf(ref); table(r.__coll).delete(r.__id); bump(r.__coll); },
    invalidateCache() { /* sem cache */ },
    getCollectionVersion(c: string) { return versions.get(c) ?? 0; },
    async getPendingReminders(nowIso: string) {
      // mesma regra do supabaseRepo.getPendingReminders — copiar o filtro de lá
      return qs([...table('reminders')].filter(([, d]) => pendingReminder(d, nowIso)).map(([id, d]) => snap(id, d)));
    },
  };
  return repo;
}

// SUBSTITUIR pelo filtro real copiado de supabaseRepo.getPendingReminders.
function pendingReminder(_d: DocData, _nowIso: string): boolean { return false; }
```
Substituir `pendingReminder` pela lógica real lida do `supabaseRepo.ts` (não deixar o stub). Ajustar as assinaturas ao `DataRepo` real se o `tsc` apontar diferenças. Run: `npx tsx --test src/backend/data/memoryRepo.test.ts` → PASS.

- [ ] **Passo 3: Ligar o backend `memory` (com trava de produção) e desligar o worker**

1. `src/backend/data/index.ts`: importar `makeMemoryRepo` e `IS_VERCEL` (`../config.js`) e trocar a escolha do repositório por:

```ts
function pick(): DataRepo {
  if (backend === 'memory') {
    if (IS_VERCEL || process.env.NODE_ENV === 'production') {
      throw new Error('DATA_BACKEND=memory não é permitido em produção.');
    }
    return makeMemoryRepo();
  }
  return backend === 'supabase' ? makeSupabaseRepo() : firestoreRepo;
}
export const repo: DataRepo = pick();
```
2. `src/backend/app.ts`: o bloco `initFirebase().then(() => { if (!IS_VERCEL) { cleanupManualInvoices(); startBackgroundReminderWorker(); } })` passa a respeitar `DISABLE_BACKGROUND_WORKER`:

```ts
if (!IS_VERCEL && process.env.DISABLE_BACKGROUND_WORKER !== '1') {
  cleanupManualInvoices();
  startBackgroundReminderWorker();
}
```
   e `initFirebase()` não é chamado quando `process.env.DATA_BACKEND === 'memory'`.

- [ ] **Passo 4: Harness de teste**

Criar `src/backend/testing/harness.ts`:

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type http from 'node:http';

/**
 * Sobe o app real em porta aleatória com repositório em memória, sem worker e sem exigir login.
 * Cada arquivo de teste roda em processo próprio, então as variáveis valem para o arquivo todo.
 */
export async function startTestServer(env: Record<string, string> = {}) {
  process.env.DATA_BACKEND = 'memory';
  process.env.DISABLE_BACKGROUND_WORKER = '1';
  process.env.DISABLE_PERMISSION_ENFORCEMENT = '1';
  Object.assign(process.env, env);
  const { default: app } = await import('../app.ts');
  const { repo } = await import('../data/index.ts');
  const server: http.Server = app.listen(0);
  const base = `http://localhost:${(server.address() as any).port}`;
  const api = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: any = text;
    try { parsed = JSON.parse(text); } catch { /* texto puro */ }
    return { status: res.status, body: parsed, headers: res.headers };
  };
  const close = () => new Promise<void>(resolve => server.close(() => resolve()));
  return { base, api, close, repo };
}
```
Se o processo de teste não encerrar depois de `close()` (algum timer ainda aberto, por exemplo no `PushService.init()` ou nos caches), localizar o timer e usar `.unref()` nele — não usar `process.exit` nos testes.

- [ ] **Passo 5: Testes dos fluxos de dinheiro**

Criar `src/backend/integration/money-flows.test.ts`. Estrutura: `before` chama `startTestServer()`, `after` chama `close()`. Cenários (cada um com asserts sobre o estado final no `repo` ou nas respostas):

1. **Confirmar item de lista é idempotente e separa ciclos de compra.** `POST /api/xml/pending-list-products` com `{ item: { id: 'pending_l1_arroz_acme', listId:'l1', productName:'Arroz', supplierName:'ACME', quantity: 3, price: 4, date: '2026-10-05T10:00:00.000Z', category:'Ingredientes' } }`; `POST /api/xml/pending-list-products/confirm` com esse item duas vezes → `xml_spendings` e `invoices` têm **1** registro cada, com `total` 12 e `source: 'shopping_list'`, e `pending_list_products` fica vazio. Depois um segundo item com o **mesmo id e `date: '2026-11-05T10:00:00.000Z'`** confirmado → agora **2** registros (ciclos diferentes não se sobrescrevem).
2. **Valores inválidos são recusados e nada é gravado.** Confirmar com `price: -5` → status 400 e `xml_spendings` continua com o mesmo número de registros.
3. **Importar nota XML e reimportar.** `POST /api/xml/process` com `{ xmlData }` (XML mínimo de NF-e: `nfeProc/NFe/infNFe` com `Id="NFe35260112345678000199550010000012341000012345"`, `ide` com `nNF` e `dhEmi`, `emit` com `CNPJ` e `xNome`, um `det` com `prod` (`cProd`, `xProd`, `qCom`, `uCom`, `vUnCom`, `vProd`) e `total/ICMSTot/vNF` = 50.00; ajustar o XML até `xmlService.parseNFe` aceitar — conferir os nomes lidos em `src/backend/services/xmlService.ts`). Primeira chamada → `status: 'imported'`; segunda → `status: 'duplicate'`; `invoices` tem 1 registro com o `id` sem o prefixo `NFe`. O relatório `GET /api/xml/invoices/duplicates` responde com `groups: []`.
4. **Apagar nota registra auditoria.** `POST /api/xml/invoices/delete` com o id da nota → `{ status: 'deleted' }`, `invoices` vazio e `audit_log` com uma entrada `action: 'invoice.delete'`.
5. **Resetar gastos das listas.** Com 1 gasto `source: 'shopping_list'` dentro do período e 1 nota XML real: `POST /api/xml/list-spendings/reset` **sem** `confirm` → 400 e nada removido; com `confirm: true` e o período cobrindo o gasto → `removed: 1`, a nota XML continua, e `audit_log` tem `list_spendings.reset`.
6. **Controle de versão da lista.** Criar lista (`POST /api/xml/shopping_lists`, resposta traz `version`), `update-items` com `baseVersion` correto → 200 com `version` +1; repetir com a versão antiga → 409 `version_conflict`.
7. **Apagar todos os fornecedores exige a contagem.** Criar 3 fornecedores (um deles de nome `MERCADO`); `delete-all` com `confirmCount: 5` → 409 com `expected: 2`, nada apagado; com `confirmCount: 2` → `count: 2` e só `MERCADO` permanece.

Cada cenário começa limpando o que precisa (usar `repo` do harness para apagar coleções, ou ids únicos por teste). Rodar: `npx tsx --test src/backend/integration/money-flows.test.ts` → todos PASS e o processo **encerra sozinho** em poucos segundos.

- [ ] **Passo 6: Verificar o conjunto**

Run: `npx tsc --noEmit`; `npx tsx --test src/backend/data/memoryRepo.test.ts src/backend/integration/money-flows.test.ts "src/backend/auth/*.test.ts" "src/backend/services/*.test.ts"`.

- [ ] **Passo 7: Commit (somente se o dono pedir)**

```bash
git add src/backend/data src/backend/testing src/backend/integration src/backend/app.ts
git commit -m "test: repositório em memória e testes de integração dos fluxos de dinheiro (Fase 3.5)"
```

---

### Tarefa 5: Cabeçalhos, CORS e tamanho de corpo

**Arquivos:** modificar `vercel.json`, `src/backend/app.ts`, `src/backend/config.ts`, `package.json`; criar `src/backend/vercelConfig.test.ts`, `src/backend/integration/http-hardening.test.ts`.

**Interfaces:**
- Produz: `BODY_LIMIT` em `config.ts` (`process.env.BODY_LIMIT || (IS_VERCEL ? '4mb' : '10mb')`); cabeçalhos de segurança em todas as respostas de `/api` (helmet) e em todas as páginas estáticas (rota com `headers` no `vercel.json`).

- [ ] **Passo 1: Teste do `vercel.json` (falha)**

Criar `src/backend/vercelConfig.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

test('vercel.json não mistura "routes" com "headers" no nível raiz (a Vercel recusa o deploy)', () => {
  assert.ok(Array.isArray(cfg.routes));
  assert.equal(cfg.headers, undefined);
});

test('a rota da API vem antes da rota de cabeçalhos e a rota de cabeçalhos continua o processamento', () => {
  const apiIdx = cfg.routes.findIndex((r: any) => r.dest === 'api/index.ts');
  const hdrIdx = cfg.routes.findIndex((r: any) => r.headers);
  assert.ok(apiIdx >= 0 && hdrIdx > apiIdx);
  assert.equal(cfg.routes[hdrIdx].continue, true);
});

test('cabeçalhos essenciais presentes; CSP começa em modo somente relatório', () => {
  const h = cfg.routes.find((r: any) => r.headers).headers;
  assert.equal(h['X-Content-Type-Options'], 'nosniff');
  assert.equal(h['X-Frame-Options'], 'DENY');
  assert.ok(h['Strict-Transport-Security']);
  assert.ok(h['Referrer-Policy']);
  assert.ok(h['Content-Security-Policy-Report-Only']);
  assert.equal(h['Content-Security-Policy'], undefined);
});

test('nenhum cabeçalho COOP que quebre o login por popup', () => {
  const h = cfg.routes.find((r: any) => r.headers).headers;
  assert.equal(h['Cross-Origin-Opener-Policy'], undefined);
});
```
Run: `npx tsx --test src/backend/vercelConfig.test.ts` → FAIL.

- [ ] **Passo 2: Cabeçalhos do site estático em `vercel.json`**

Trocar o array `routes` por (a rota de cabeçalhos entra **entre** a da API e a do estático):

```json
"routes": [
  { "src": "/api/(.*)", "dest": "api/index.ts" },
  {
    "src": "/(.*)",
    "headers": {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "Content-Security-Policy-Report-Only": "default-src 'self'; script-src 'self' 'unsafe-inline' https://apis.google.com https://*.firebaseapp.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://*.googleapis.com https://docs.google.com https://*.firebaseapp.com wss://*.firebaseio.com; frame-src https://*.firebaseapp.com https://accounts.google.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    },
    "continue": true
  },
  { "src": "/(.*)", "dest": "/$1" }
]
```
Run: `npx tsx --test src/backend/vercelConfig.test.ts` → PASS. Observação para o relatório: não há como testar a Vercel localmente; o teste só garante o formato.

- [ ] **Passo 3: `helmet`, limite de corpo e erro 413 claro**

1. `npm install helmet@8.0.0`.
2. `src/backend/config.ts`: exportar `export const BODY_LIMIT = process.env.BODY_LIMIT || (IS_VERCEL ? '4mb' : '10mb');` (depois da definição de `IS_VERCEL`).
3. `src/backend/app.ts`: importar `helmet` e `BODY_LIMIT`; **antes** do `express.json`, acrescentar:

```ts
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false,          // a API só devolve JSON; a CSP do site está no vercel.json
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,        // não interferir no login por popup
  crossOriginResourcePolicy: { policy: 'same-site' },
}));
```
   e trocar `limit: '10mb'` por `limit: BODY_LIMIT` nas duas linhas (`express.json`, `express.urlencoded`).
4. `src/backend/errors.ts`: em `describeError`, antes do bloco `status < 500`, acrescentar o caso do corpo grande:

```ts
  if (err?.type === 'entity.too.large' || status === 413) {
    return { status: 413, body: { error: 'Arquivo muito grande', message: 'O conteúdo enviado é grande demais. Envie menos arquivos por vez ou arquivos menores.' } };
  }
```
   e um teste em `src/backend/errors.test.ts` (`describeError({ type: 'entity.too.large', status: 413 }, { production: true })` → status 413 e mensagem em português).

- [ ] **Passo 4: Testes HTTP de endurecimento**

Criar `src/backend/integration/http-hardening.test.ts`, com `startTestServer({ BODY_LIMIT: '1kb' })`:

1. `GET /api/health` → cabeçalho `x-content-type-options: nosniff` presente e **sem** `x-powered-by`.
2. Corpo grande: `POST /api/xml/process` com `{ xmlData: 'x'.repeat(5000) }` → status 413 e `message` em português (contendo "grande demais").
3. CORS: `GET /api/health` com `Origin: https://evil.example` → resposta **sem** `access-control-allow-origin`; `OPTIONS /api/xml/process` com `Origin` e `Access-Control-Request-Method: POST` → sem `access-control-allow-origin`.
Run: `npx tsx --test src/backend/integration/http-hardening.test.ts src/backend/errors.test.ts` → PASS.

- [ ] **Passo 5: Verificar o conjunto**

Run: `npx tsc --noEmit`; `npx tsx --test src/backend/vercelConfig.test.ts src/backend/errors.test.ts src/backend/integration/*.test.ts`; `npx vite build`.

- [ ] **Passo 6: Commit (somente se o dono pedir)**

```bash
git add vercel.json package.json package-lock.json src/backend
git commit -m "feat(security): cabeçalhos de segurança, helmet na API, limite de corpo e 413 claro (Fase 3.4)"
```

**Verificação manual do dono (depois do deploy):** abrir o sistema, entrar com Google e navegar pelas telas principais com o console do navegador aberto (F12 → Console). Mensagens "Content Security Policy" são avisos do modo relatório: copie-as para mim. Em Rede (Network) clique num arquivo `.html`/`.js` e confira os cabeçalhos de resposta (`x-content-type-options`, `strict-transport-security`).

---

### Tarefa 6: Limite de requisições

**Arquivos:** criar `src/backend/rateLimit.ts`, `src/backend/rateLimit.test.ts`; modificar `src/backend/app.ts`, `.env.example`, `README.md`.

**Interfaces:**
- Produz: `class RateLimiter { constructor(rule: { windowMs: number; max: number }, now?: () => number); check(key: string): { allowed: boolean; retryAfterSec: number } }`, `isHeavyPath(path: string): boolean`, `rateLimitMessage(retryAfterSec: number): string`.

- [ ] **Passo 1: Teste que falha**

Criar `src/backend/rateLimit.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter, isHeavyPath, rateLimitMessage } from './rateLimit.ts';

test('permite até o máximo na janela e bloqueia o excedente com tempo de espera', () => {
  let t = 1000;
  const rl = new RateLimiter({ windowMs: 60_000, max: 3 }, () => t);
  assert.equal(rl.check('a').allowed, true);
  assert.equal(rl.check('a').allowed, true);
  assert.equal(rl.check('a').allowed, true);
  const blocked = rl.check('a');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1 && blocked.retryAfterSec <= 60);
});

test('chaves diferentes não se afetam', () => {
  const rl = new RateLimiter({ windowMs: 60_000, max: 1 }, () => 0);
  assert.equal(rl.check('a').allowed, true);
  assert.equal(rl.check('b').allowed, true);
  assert.equal(rl.check('a').allowed, false);
});

test('a janela reinicia depois do tempo', () => {
  let t = 0;
  const rl = new RateLimiter({ windowMs: 1000, max: 1 }, () => t);
  assert.equal(rl.check('a').allowed, true);
  assert.equal(rl.check('a').allowed, false);
  t = 1001;
  assert.equal(rl.check('a').allowed, true);
});

test('rotas pesadas: IA, importação e planilha', () => {
  for (const p of ['/ai/process-document', '/xml/process', '/xml/process-batch', '/omie-direct/products', '/excel-sync', '/xml/suppliers/import']) {
    assert.equal(isHeavyPath(p), true, p);
  }
  for (const p of ['/xml/invoices', '/health', '/auth/session']) assert.equal(isHeavyPath(p), false, p);
});

test('mensagem em português com os segundos', () => {
  assert.match(rateLimitMessage(7), /7 segundos/);
  assert.match(rateLimitMessage(1), /1 segundo/);
});
```
Run: `npx tsx --test src/backend/rateLimit.test.ts` → FAIL.

- [ ] **Passo 2: Implementar**

Criar `src/backend/rateLimit.ts`:

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface RateRule { windowMs: number; max: number }

/** Contador por instância (memória). Em ambiente serverless cada instância tem o seu: serve como freio, não como cota exata. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private rule: RateRule, private now: () => number = Date.now) {}

  check(key: string): { allowed: boolean; retryAfterSec: number } {
    const t = this.now();
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
    }
    let h = this.hits.get(key);
    if (!h || h.resetAt <= t) {
      h = { count: 0, resetAt: t + this.rule.windowMs };
      this.hits.set(key, h);
    }
    h.count++;
    if (h.count > this.rule.max) {
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((h.resetAt - t) / 1000)) };
    }
    return { allowed: true, retryAfterSec: 0 };
  }
}

const HEAVY_PREFIXES = ['/ai/', '/xml/process', '/omie-direct', '/excel-sync', '/xml/suppliers/import'];
/** `path` relativo ao /api (como em req.path dentro de app.use('/api', ...)). */
export const isHeavyPath = (path: string) => HEAVY_PREFIXES.some(p => path.startsWith(p));

export const rateLimitMessage = (sec: number) =>
  `Muitas requisições em pouco tempo. Aguarde ${sec} ${sec === 1 ? 'segundo' : 'segundos'} e tente de novo.`;
```
Run: `npx tsx --test src/backend/rateLimit.test.ts` → PASS.

- [ ] **Passo 3: Ligar no `app.ts`**

Importar de `./rateLimit.js`. Criar os limitadores (valores por variável, com os padrões do plano) logo antes do middleware de acesso:

```ts
const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const ipLimiter = new RateLimiter({ windowMs: 60_000, max: num(process.env.RATE_LIMIT_IP_PER_MIN, 600) });
const userLimiter = new RateLimiter({ windowMs: 60_000, max: num(process.env.RATE_LIMIT_USER_PER_MIN, 300) });
const heavyLimiter = new RateLimiter({ windowMs: 60_000, max: num(process.env.RATE_LIMIT_HEAVY_PER_MIN, 20) });
const rateLimitDisabled = () => process.env.RATE_LIMIT_DISABLED === '1' && !IS_VERCEL && process.env.NODE_ENV !== 'production';
const tooMany = (res: Response, retryAfterSec: number) => {
  res.setHeader('Retry-After', String(retryAfterSec));
  return res.status(429).json({ error: 'rate_limited', message: rateLimitMessage(retryAfterSec) });
};
```
- `app.set('trust proxy', 1);` (para `req.ip` na Vercel ser o cliente).
- **Antes** do middleware de acesso (`app.use('/api', ... decideAccess ...)`), um middleware por IP: `app.use('/api', (req, res, next) => { if (rateLimitDisabled() || req.path === '/health') return next(); const r = ipLimiter.check(req.ip || 'sem-ip'); return r.allowed ? next() : tooMany(res, r.retryAfterSec); });`
- **Depois** do middleware de acesso (identidade já resolvida): `app.use('/api', (req, res, next) => { if (rateLimitDisabled()) return next(); const who = res.locals.identity?.uid || req.ip || 'sem-ip'; const r1 = userLimiter.check(who); if (!r1.allowed) return tooMany(res, r1.retryAfterSec); if (isHeavyPath(req.path)) { const r2 = heavyLimiter.check(who); if (!r2.allowed) return tooMany(res, r2.retryAfterSec); } next(); });`
- Nos testes de integração existentes (harness) o limite fica ligado mas muito acima do que os testes usam; o teste do passo 4 reduz os limites por variável.

- [ ] **Passo 4: Teste de integração do 429**

Em `src/backend/integration/http-hardening.test.ts`... (arquivo já existe com `BODY_LIMIT` baixo); criar `src/backend/integration/rate-limit.test.ts` com `startTestServer({ RATE_LIMIT_IP_PER_MIN: '5' })`: 5 chamadas a `GET /api/xml/setores` → 200; a 6ª → 429 com `Retry-After` e `message` contendo "Muitas requisições"; `GET /api/health` continua 200 (fora do limite). Run: `npx tsx --test src/backend/integration/rate-limit.test.ts` → PASS.

- [ ] **Passo 5: Documentar**

`.env.example`: acrescentar, comentados, `RATE_LIMIT_IP_PER_MIN=600`, `RATE_LIMIT_USER_PER_MIN=300`, `RATE_LIMIT_HEAVY_PER_MIN=20`. `README.md`: uma linha sobre o limite (por instância; 429 com aviso; ajustável por variável).

- [ ] **Passo 6: Verificar**

Run: `npx tsc --noEmit`; `npx tsx --test src/backend/rateLimit.test.ts src/backend/integration/*.test.ts "src/backend/auth/*.test.ts"`.

- [ ] **Passo 7: Commit (somente se o dono pedir)**

```bash
git add src/backend .env.example README.md
git commit -m "feat(security): limite de requisições por IP e por pessoa, mais baixo em IA e importação (Fase 3.2)"
```

---

### Tarefa 7: Regras do Firestore "negar tudo"

**Arquivos:** modificar `firestore.rules`, `security_spec.md`.

**Antes de começar:** confirmar com `grep -rn "firebase/firestore\|from './firebase'\|from '../firebase'" src/frontend` que o front só usa o Firestore em `App.tsx` (`enableNetwork`/`disableNetwork`) e em `firebase.ts` (inicialização), sem `getDoc`/`setDoc`/`onSnapshot`/`collection`. Se aparecer qualquer leitura/gravação, **parar e reportar** (NEEDS_CONTEXT).

- [ ] **Passo 1: Reescrever `firestore.rules`**

Substituir **todo** o conteúdo por:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Acesso direto ao Firestore pelo navegador está FECHADO.
    // Todo acesso a dados passa pela API (backend com credencial de serviço / Supabase).
    // Não existem mais coleções abertas, coleções de teste abertas nem admin fixo.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Passo 2: Atualizar a documentação**

Em `security_spec.md`, ajustar as regras que descreviam leitura aberta/`isValidUser`/admin por e-mail para: "Firestore: todo acesso direto negado; a API é a única porta". Em `README.md`, na seção de acesso/configuração, acrescentar uma frase: "`DATA_BACKEND=firestore` só funciona com credencial de administrador (local); em produção o backend de dados é o Supabase."

- [ ] **Passo 3: Verificar o que dá para verificar**

Run: `npx tsc --noEmit`. (As regras não têm teste automático aqui; a verificação é manual, abaixo.)

- [ ] **Passo 4: Commit (somente se o dono pedir)**

```bash
git add firestore.rules security_spec.md README.md
git commit -m "fix(security): regras do Firestore negam todo acesso direto (Fase 3.3)"
```

**Passo do dono (depois do commit):** o arquivo no repositório **não** é publicado sozinho. Firebase Console → Firestore Database → Regras → colar o conteúdo novo → Publicar. Depois, entrar no sistema e usar normalmente (o login e os dados vêm pela API). Se algo parar de funcionar, colar de volta a regra antiga (está no histórico do git) e me avisar.

---

### Tarefa 8: Dividir o `app.ts` por domínio (opcional, sem mudar comportamento)

**Arquivos:** criar `src/backend/http.ts`, `src/backend/routes/*.ts`, `src/backend/integration/route-table.test.ts`, `src/backend/integration/route-table.golden.json`; modificar `src/backend/app.ts`.

**Regra de ouro:** nenhum comportamento muda. Cada rota é **movida** com o corpo idêntico. A rede de segurança é (a) a "foto" da tabela de rotas e (b) os testes de integração das tarefas 4, 5 e 6, que continuam passando.

- [ ] **Passo 1: Tirar a "foto" da tabela de rotas ANTES de mexer**

Criar `src/backend/integration/route-table.test.ts` que, com `startTestServer()`, lê `app._router.stack` e monta a lista ordenada de strings `METHOD /caminho` (para cada layer com `route`: um item por método) e a lista de nomes dos middlewares de nível de aplicação (layers sem `route`, na ordem). Duas comparações:
1. **Conjunto de rotas** (ordem ignorada) igual a `route-table.golden.json` (`{ "routes": [...ordenado...] }`).
2. **Middlewares** na mesma ordem relativa do golden (`{ "middleware": [...] }`).
Na primeira execução, gerar o golden com `UPDATE_GOLDEN=1 npx tsx --test src/backend/integration/route-table.test.ts` (o teste grava o arquivo quando a variável está definida; sem ela, compara). Commitar o golden **antes** do refactor. Conferir que o golden tem, por exemplo, `GET /api/health`, `POST /api/xml/process`, `DELETE /api/xml/invoices/:id`.

- [ ] **Passo 2: Extrair os utilitários compartilhados**

Criar `src/backend/http.ts` com (movidos de `app.ts`, corpo idêntico): `asyncHandler`, `applyPagination`, `handleCacheAndEtag`, `actorName`, `auditActor`, `readDocData` e demais helpers pequenos usados por mais de um grupo de rotas. `app.ts` passa a importá-los.

- [ ] **Passo 3: Mover as rotas em arquivos por domínio**

Criar `src/backend/routes/` com um arquivo por domínio, cada um exportando `registerXRoutes(app: Express): void` que **registra diretamente no `app`** (não usar `Router`, para a pilha de rotas ficar igual). Agrupamento sugerido (ajustar se uma rota depender de helper de outro grupo):
- `system.ts`: health, quota-status, debug-db, excel-sync, ai/*, notifications/*, omie-direct/*, proxy `/api/v1/*`, test-mode/reset.
- `xmlImport.ts`: price-settings, price-estimates, process, process-batch, price-increases, pending-imports.
- `catalog.ts`: suppliers, categories, setores, delivered_products, products/*, setor-limits, reminders.
- `lists.ts`: shopping_lists, purchase_orders, pending-list-products.
- `finance.ts`: invoices (incl. duplicates e delete), spendings, list-spendings/reset, cache/invalidate.
- `authRoutes.ts`: `/api/auth/*`, `/api/xml/authorized_users`.
`app.ts` fica com: criação do app, middlewares globais, middleware de acesso e limites, chamadas `registerXRoutes(app)` e o tratador de erros (que **precisa** continuar por último). Importante: o middleware de acesso e os limites devem continuar registrados **antes** de qualquer rota, como hoje.

- [ ] **Passo 4: Verificar que nada mudou**

Run: `npx tsc --noEmit`; `npx tsx --test src/backend/integration/*.test.ts` (inclui a foto de rotas, os fluxos de dinheiro, cabeçalhos e limite); `npx vite build`; esbuild do servidor (`npx esbuild src/backend/server.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/server.cjs`). Conferir que os imports novos terminam em `.js` (ESM na Vercel) e que não sobrou helper duplicado.

- [ ] **Passo 5: Commit em separado (somente se o dono pedir)**

```bash
git add src/backend
git commit -m "refactor: divide app.ts em módulos por domínio, sem mudar comportamento (Fase 3.5)"
```

---

### Tarefa 9: Fechamento da fase

**Arquivos:** modificar `README.md`, `.env.example`, `security_spec.md`.

- [ ] **Passo 1: Documentar**

`README.md`: seção "Segurança e operação" com: lista de variáveis de ambiente (obrigatórias e opcionais, com os padrões), o checklist de produção (T1), como ajustar os limites (T6), o que fazer ao ver 429, onde estão os cabeçalhos (`vercel.json`) e que a CSP está em modo relatório até a segunda rodada, como rodar os testes (comando direcionado e a observação de que os de integração usam `DATA_BACKEND=memory`), e o passo de restringir a chave do Firebase por domínio (texto do bloco "Passos do dono" deste plano). `.env.example`: conferir que lista todas as variáveis citadas.

- [ ] **Passo 2: Verificação completa**

Run, nesta ordem: `npx tsc --noEmit`; `npx tsx --test "src/shared/*.test.ts" "src/backend/auth/*.test.ts" "src/backend/*.test.ts" "src/backend/services/*.test.ts" "src/backend/integration/*.test.ts" src/backend/data/supabaseRepo.test.ts src/backend/data/version.test.ts src/backend/data/memoryRepo.test.ts`; `npx vite build`; esbuild do servidor; `npm audit` (anotar o que sobrou). Registrar as contagens.

- [ ] **Passo 3: Roteiro manual do dono (depois do deploy)**

1. Entrar com Google; navegar por Dashboard, Fornecedores, Listas, DRE; abrir o console (F12) e copiar eventuais avisos de "Content Security Policy".
2. Importar e exportar uma planilha de fornecedores e uma de DRE de vendas; abrir os arquivos exportados no Excel.
3. Importar um XML; reimportar o mesmo (deve avisar "já existia").
4. Receber uma notificação push (se havia inscrição) — ou reativar as notificações caso as chaves tenham sido trocadas.
5. Publicar as novas regras do Firestore (T7) e repetir o item 1.
6. Restringir a chave de API do Firebase por domínio (passo do dono, no topo).
7. Em `https://securityheaders.com` (ou Network no navegador), conferir os cabeçalhos do site.

- [ ] **Passo 4: Commit (somente se o dono pedir)**

```bash
git add README.md .env.example security_spec.md
git commit -m "docs: segurança e operação (Fase 3)"
```

---

## Auto-revisão

**Cobertura da spec (3.1-3.6):** 3.1 → T2 (audit fix) e T3 (xlsx→exceljs com paridade); 3.2 → T6; 3.3 → T7 (+ passo do dono para publicar); 3.4 → T5 (helmet na API, cabeçalhos do site em `vercel.json`, CORS verificado por teste, limite de corpo/413); 3.5 → `.gitattributes` (T1), testes de fluxo (T4), divisão do `app.ts` (T8); 3.6 → T1 (VAPID, avisos, `.env.example`) e T9 (documentação, chave do Firebase). Achado extra: a chave privada VAPID estava no código (T1).

**Consistência de tipos:** `startTestServer` (T4) é usado em T5, T6 e T8 com o mesmo formato (`api`, `close`, `repo`, `headers`); `RateLimiter`/`isHeavyPath`/`rateLimitMessage` (T6) têm uma única assinatura; `BODY_LIMIT` (T5) é lido por `startTestServer({ BODY_LIMIT })`; `makeMemoryRepo` (T4) implementa `updateIfVersion` da Fase 2.

**Pontos a conferir ao executar:** `pushService.ts` e o uso de `vapid-key` no front (T1 passo 3); o XML mínimo aceito por `xmlService.parseNFe` (T4 passo 5); filtro real de lembretes pendentes copiado do Supabase (T4 passo 2); processo de teste encerrando sozinho (T4 passo 4); diferenças de leitura entre `xlsx` e `exceljs` apontadas pelos goldens (T3 passo 4).
