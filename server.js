'use strict';
// Stream Deck pelo celular — servidor que roda no PC.
// Sem dependências: só precisa do Node.js (versão 22 ou mais nova).
// Rodar: node server.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, exec } = require('child_process');

const RAIZ = __dirname;
const CONFIG = path.join(RAIZ, 'config.json');
const CONFIG_PADRAO = path.join(RAIZ, 'config.padrao.json');
const PUBLICO = path.join(RAIZ, 'public');
const WINDOWS = process.platform === 'win32';

// ---------------------------------------------------------------- config

function salvarConfig(c) {
  const tmp = CONFIG + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(c, null, 2));
  fs.renameSync(tmp, CONFIG);
}

function garantirIds(c) {
  let mudou = false;
  for (const p of c.paginas || []) {
    if (!p.id) { p.id = novoId(); mudou = true; }
    for (const b of p.botoes || []) if (!b.id) { b.id = novoId(); mudou = true; }
  }
  return mudou;
}

function novoId() { return crypto.randomBytes(4).toString('hex'); }

function carregarConfig() {
  if (!fs.existsSync(CONFIG)) fs.copyFileSync(CONFIG_PADRAO, CONFIG);
  const c = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  let mudou = garantirIds(c);
  // opções novas que vierem em atualizações entram com o valor padrão, sem mexer nos seus botões
  const padrao = JSON.parse(fs.readFileSync(CONFIG_PADRAO, 'utf8'));
  for (const [k, v] of Object.entries(padrao)) if (k !== 'paginas' && !(k in c)) { c[k] = v; mudou = true; }
  if (!c.token) { c.token = crypto.randomBytes(16).toString('hex'); mudou = true; }
  c.porta ??= 8765;
  c.colunas ??= 3;
  c.tempoRespostaPermissao ??= 60;
  // ajustes pedidos depois que o config já existia (cada um roda uma vez só)
  c.migracoes ??= [];
  if (!c.migracoes.includes('mixer-steelseries')) {
    for (const p of c.paginas || []) for (const b of p.botoes || [])
      if (b.acao?.tipo === 'app' && /^sndvol(\.exe)?$/i.test(String(b.acao.caminho).trim())) { b.acao = { tipo: 'app', caminho: 'app:SteelSeries GG' }; b.icone = '🎧'; }
    c.migracoes.push('mixer-steelseries'); mudou = true;
  }
  if (!c.migracoes.includes('dev-mode-2')) {
    // DEV MODE novo: Claude, Sancoto, Terminal, WhatsApp no Firefox, VPS, Stoat e Discord
    const todos = (c.paginas || []).flatMap(p => p.botoes || []);
    const tem = nome => todos.some(b => String(b.nome).toLowerCase() === nome.toLowerCase());
    for (const b of todos) if (b.nome === 'Cloud' && /claude\.ai/.test(b.acao?.caminho || '')) Object.assign(b, { nome: 'Claude', icone: '✳️', acao: { tipo: 'app', caminho: 'app:Claude' } });
    const viltrun = (c.paginas || []).find(p => p.nome === 'VILTRUN');
    if (viltrun) {
      const novos = JSON.parse(fs.readFileSync(CONFIG_PADRAO, 'utf8')).paginas.find(p => p.nome === 'VILTRUN').botoes
        .filter(b => ['WhatsApp Firefox', 'VPS', 'Stoat', 'Claude'].includes(b.nome) && !tem(b.nome));
      const i = viltrun.botoes.findIndex(b => b.nome === 'DEV MODE');
      viltrun.botoes.splice(i < 0 ? viltrun.botoes.length : i, 0, ...novos);
    }
    for (const b of todos) if (b.nome === 'DEV MODE' && b.acao?.tipo === 'sequencia')
      b.acao.botoes = ['Claude', 'Sancoto', 'Terminal', 'WhatsApp Firefox', 'VPS', 'Stoat', 'Discord'].join('\n');
    c.migracoes.push('dev-mode-2'); mudou = true;
  }
  if (!c.migracoes.includes('modos-3')) {
    // WORK/GAMING/STREAM MODE novos, END SESSION fecha tudo, Steam no lugar do Jogo favorito
    const padrao = JSON.parse(fs.readFileSync(CONFIG_PADRAO, 'utf8'));
    const doPadrao = nome => JSON.parse(JSON.stringify(padrao.paginas.flatMap(p => p.botoes).find(b => b.nome === nome)));
    const todos = () => (c.paginas || []).flatMap(p => p.botoes || []);
    const tem = nome => todos().some(b => String(b.nome).toLowerCase() === nome.toLowerCase());
    const pagina = nome => (c.paginas || []).find(p => p.nome === nome);
    const g = pagina('GAMING');
    if (g && !tem('Steam')) {
      const i = g.botoes.findIndex(b => b.nome === 'Jogo favorito');
      if (i >= 0) g.botoes.splice(i, 1, doPadrao('Steam')); else g.botoes.push(doPadrao('Steam'));
    }
    const w = pagina('WORK');
    if (w) for (const n of ['ChatGPT', 'YouTube']) if (!tem(n)) w.botoes.push(doPadrao(n));
    const st = pagina('STREAM');
    if (st && !tem('Twitch')) st.botoes.splice(1, 0, doPadrao('Twitch'));
    for (const b of todos()) {
      if (b.nome === 'Abrir OBS' && /obs64\.exe/i.test(b.acao?.caminho || '')) b.acao = doPadrao('Abrir OBS').acao;
      if (b.nome === 'Spotify' && b.acao?.caminho === 'spotify:') b.acao = doPadrao('Spotify').acao;
      if (['WORK MODE', 'GAMING MODE', 'STREAM MODE', 'END SESSION'].includes(b.nome)) { b.acao = doPadrao(b.nome).acao; if (b.nome === 'END SESSION') b.confirmar = true; }
    }
    c.migracoes.push('modos-3'); mudou = true;
  }
  if (!c.migracoes.includes('mixer-2')) {
    // qualquer botão de mixer, em qualquer aba, abre o SteelSeries GG
    for (const p of c.paginas || []) for (const b of p.botoes || [])
      if (/mixer/i.test(b.nome) && b.acao?.tipo === 'app') { b.acao = { tipo: 'app', caminho: 'app:SteelSeries GG' }; b.icone = '🎧'; }
    c.migracoes.push('mixer-2'); mudou = true;
  }
  if (!c.migracoes.includes('extras-clientes')) {
    // sem a aba EXTRAS; na VILTRUN, o botão Clientes vira o de mutar o microfone
    c.paginas = (c.paginas || []).filter(p => p.nome !== 'EXTRAS');
    const v = c.paginas.find(p => p.nome === 'VILTRUN');
    const i = v ? v.botoes.findIndex(b => b.nome === 'Clientes') : -1;
    if (i >= 0) v.botoes[i] = { id: novoId(), nome: 'Microfone', icone: '🎙️', cor: '#b91c1c', acao: { tipo: 'microfone', modo: 'alternar' } };
    c.migracoes.push('extras-clientes'); mudou = true;
  }
  if (!c.migracoes.includes('audio-mic')) {
    // botão de mutar o microfone também na aba AUDIO
    const a = (c.paginas || []).find(p => p.nome === 'AUDIO');
    if (a && !a.botoes.some(b => b.acao?.tipo === 'microfone'))
      a.botoes.push({ id: novoId(), nome: 'Microfone', icone: '🎙️', cor: '#b91c1c', acao: { tipo: 'microfone', modo: 'alternar' } });
    c.migracoes.push('audio-mic'); mudou = true;
  }
  if (mudou) salvarConfig(c);
  return c;
}

let cfg = carregarConfig();

const VERSAO = JSON.parse(fs.readFileSync(path.join(RAIZ, 'versao.json'), 'utf8')).versao;

function configPublica() {
  return { paginas: cfg.paginas, colunas: cfg.colunas, colunasDeitado: cfg.colunasDeitado || 0,
    nomePC: os.hostname(), plataforma: process.platform, versao: VERSAO,
    obs: { host: cfg.obs?.host || '127.0.0.1', porta: cfg.obs?.porta || 4455, temSenha: !!cfg.obs?.senha } };
}

function acharBotaoPorNome(nome) {
  const n = nome.toLowerCase();
  for (const p of cfg.paginas) for (const b of p.botoes) if (String(b.nome).trim().toLowerCase() === n) return b;
  return null;
}

function acharBotao(id) {
  for (const p of cfg.paginas) for (const b of p.botoes) if (b.id === id) return b;
  return null;
}

// ---------------------------------------------------------------- eventos ao vivo (SSE)

const clientes = new Set();

function enviar(evento, dados, so) {
  const msg = `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
  for (const res of so ? [so] : clientes) res.write(msg);
}

setInterval(() => { for (const res of clientes) res.write(': ping\n\n'); }, 15000);

// ---------------------------------------------------------------- uso de CPU e RAM

let ultimaCpu = os.cpus();
let stats = { cpu: 0, ram: 0, ramTotalGB: +(os.totalmem() / 1073741824).toFixed(1) };

function medir() {
  const agora = os.cpus();
  let ocioso = 0, total = 0;
  agora.forEach((c, i) => {
    const a = ultimaCpu[i]?.times || c.times;
    const t = c.times;
    const dt = (t.user - a.user) + (t.nice - a.nice) + (t.sys - a.sys) + (t.irq - a.irq) + (t.idle - a.idle);
    total += dt; ocioso += t.idle - a.idle;
  });
  ultimaCpu = agora;
  stats = {
    cpu: total ? Math.round(100 * (1 - ocioso / total)) : 0,
    ram: Math.round(100 * (1 - os.freemem() / os.totalmem())),
    ramTotalGB: stats.ramTotalGB,
  };
  enviar('stats', stats);
}
setInterval(medir, 2000);

// ---------------------------------------------------------------- notificações e pedidos de permissão

const notifs = [];            // mais nova primeiro
const esperando = new Map();  // id -> função que responde quem está aguardando

function criarNotif({ titulo, mensagem, origem, perguntar, esperar, tempo }) {
  const n = {
    id: novoId(),
    titulo: String(titulo || 'Notificação').slice(0, 200),
    mensagem: String(mensagem || '').slice(0, 4000),
    origem: String(origem || 'PC').slice(0, 60),
    perguntar: !!perguntar,
    status: perguntar ? 'pendente' : 'info',
    criado: Date.now(),
    expira: perguntar ? Date.now() + 1000 * (tempo || cfg.tempoRespostaPermissao) : null,
  };
  notifs.unshift(n);
  while (notifs.length > 60) notifs.pop();
  enviar('notif', n);
  log(`🔔 ${n.origem}: ${n.titulo}`);
  return n;
}

function resolverNotif(id, status) {
  const n = notifs.find(x => x.id === id);
  if (!n || n.status !== 'pendente') return false;
  n.status = status;
  enviar('notif', n);
  const responder = esperando.get(id);
  if (responder) { esperando.delete(id); responder(status); }
  return true;
}

setInterval(() => {
  for (const n of notifs) if (n.status === 'pendente' && n.expira < Date.now()) resolverNotif(n.id, 'expirado');
}, 1000);

// ---------------------------------------------------------------- execução de ações no PC

function psAspas(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
function expandirVariaveis(s) {
  return String(s).replace(/%([^%]+)%/g, (m, v) => v.toUpperCase() === 'STREAMDECK' ? RAIZ : (process.env[v] ?? m));
}
const SEM_CAMINHO = 'Esse botão ainda não foi configurado. Toque no ✏️ e coloque o programa ou site.';

function rodarPowerShell(script, tempoMs = 30000) {
  return new Promise(resolve => {
    const p = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' + script], { windowsHide: true });
    let saida = '';
    const t = setTimeout(() => p.kill(), tempoMs);
    p.stdout.on('data', d => saida += d);
    p.stderr.on('data', d => saida += d);
    p.on('error', e => { clearTimeout(t); resolve({ codigo: -1, saida: e.message }); });
    p.on('close', codigo => { clearTimeout(t); resolve({ codigo, saida }); });
  });
}

function rodarShell(comando, tempoMs = 30000) {
  return new Promise(resolve => {
    exec(comando, { timeout: tempoMs, windowsHide: true, maxBuffer: 1 << 20 }, (erro, out, err) => {
      resolve({ codigo: erro ? (erro.code ?? -1) : 0, saida: (out || '') + (err || '') });
    });
  });
}

// Teclas: um PowerShell fica aberto em segundo plano para os atalhos saírem na hora.
const TECLAS = {
  ctrl: 0x11, control: 0x11, shift: 0x10, alt: 0x12, win: 0x5B, windows: 0x5B,
  enter: 0x0D, esc: 0x1B, escape: 0x1B, tab: 0x09, espaco: 0x20, space: 0x20,
  backspace: 0x08, delete: 0x2E, del: 0x2E, insert: 0x2D, home: 0x24, end: 0x23,
  pageup: 0x21, pagedown: 0x22, esquerda: 0x25, left: 0x25, cima: 0x26, up: 0x26,
  direita: 0x27, right: 0x27, baixo: 0x28, down: 0x28, printscreen: 0x2C, prtsc: 0x2C,
  playpause: 0xB3, proxima: 0xB0, next: 0xB0, anterior: 0xB1, prev: 0xB1, stop: 0xB2,
  volumemais: 0xAF, volup: 0xAF, volumemenos: 0xAE, voldown: 0xAE, mudo: 0xAD, mute: 0xAD,
};

function codigosDasTeclas(texto) {
  return String(texto).toLowerCase().split('+').map(s => s.trim()).filter(Boolean).map(k => {
    if (TECLAS[k] != null) return TECLAS[k];
    if (/^[a-z0-9]$/.test(k)) return k.toUpperCase().charCodeAt(0);
    const f = /^f([1-9]|1[0-9]|2[0-4])$/.exec(k);
    if (f) return 0x6F + Number(f[1]);
    throw new Error(`Tecla desconhecida: "${k}"`);
  });
}

let trabalhadorTeclas = null;
function enviarTeclas(codigos) {
  if (!trabalhadorTeclas) {
    trabalhadorTeclas = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(RAIZ, 'ferramentas', 'teclas.ps1')], { windowsHide: true, stdio: ['pipe', 'ignore', 'inherit'] });
    trabalhadorTeclas.on('exit', () => { trabalhadorTeclas = null; });
  }
  trabalhadorTeclas.stdin.write('K ' + codigos.join(',') + '\n');
}

async function executar(b, extra = {}) {
  const a = b.acao || {};
  switch (a.tipo) {
    case 'app': {
      const alvo = expandirVariaveis(a.caminho || '').trim();
      if (!alvo) throw new Error(SEM_CAMINHO);
      if (WINDOWS && /^app:/i.test(alvo)) {
        // "app:Nome" abre pelo nome que aparece no menu Iniciar (não importa onde foi instalado)
        const nome = alvo.slice(4).trim();
        const r = await rodarPowerShell(`$l = Get-StartApps; $a = $l | Where-Object { $_.Name -eq ${psAspas(nome)} } | Select-Object -First 1;
          if (-not $a) { $a = $l | Where-Object { $_.Name -like ${psAspas('*' + nome + '*')} } | Select-Object -First 1 };
          if (-not $a) { Write-Output 'NAO_ACHEI'; exit 1 }; Start-Process ('shell:AppsFolder\' + $a.AppID)`, 15000);
        if (r.saida.includes('NAO_ACHEI')) throw new Error(`Não achei "${nome}" no menu Iniciar do PC.`);
        if (r.codigo !== 0) throw new Error(r.saida.trim() || 'Não consegui abrir');
      } else if (WINDOWS) {
        let s = `Start-Process -FilePath ${psAspas(alvo)}`;
        if (a.argumentos) s += ` -ArgumentList ${psAspas(expandirVariaveis(a.argumentos))}`;
        // programas como o OBS só abrem direito se rodarem de dentro da própria pasta
        if (/^[a-z]:\\/i.test(alvo) && /\.exe$/i.test(alvo)) s += ` -WorkingDirectory ${psAspas(path.dirname(alvo))}`;
        const r = await rodarPowerShell(s, 15000);
        if (r.codigo !== 0) throw new Error(r.saida.trim() || 'Não consegui abrir');
      } else {
        spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [alvo], { detached: true, stdio: 'ignore' }).unref();
      }
      return { ok: true };
    }
    case 'comando': {
      if (!a.comando) throw new Error('Botão sem comando configurado');
      const r = WINDOWS && (a.shell || 'powershell') === 'powershell'
        ? await rodarPowerShell(a.comando)
        : await rodarShell(a.comando);
      return { ok: r.codigo === 0, saida: a.mostrarSaida || r.codigo !== 0 ? r.saida.slice(-4000) : undefined };
    }
    case 'atalho': {
      if (!WINDOWS) throw new Error('Atalhos de teclado só funcionam no Windows');
      enviarTeclas(codigosDasTeclas(a.teclas));
      return { ok: true };
    }
    case 'texto-pc': {
      const texto = String(extra.texto ?? a.texto ?? '').slice(0, 8000);
      if (!WINDOWS) throw new Error('Área de transferência só no Windows');
      const b64 = Buffer.from(texto, 'utf8').toString('base64');
      const r = await rodarPowerShell(`Set-Clipboard -Value ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}')))`);
      if (r.codigo !== 0) throw new Error(r.saida.trim());
      if (a.colar) setTimeout(() => enviarTeclas([0x11, 0x56]), 150);
      return { ok: true };
    }
    case 'clipboard-pc': {
      if (!WINDOWS) throw new Error('Área de transferência só no Windows');
      const r = await rodarPowerShell(`$c = Get-Clipboard -Raw; if ($c -eq $null) { $c = '' }; [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($c))`);
      return { ok: true, texto: Buffer.from(r.saida.trim(), 'base64').toString('utf8') };
    }
    case 'sequencia': {
      // roda outros botões em ordem (os "modos"), pelo nome
      const nomes = String(a.botoes || '').split(/\n|,/).map(s => s.trim()).filter(Boolean);
      if (!nomes.length) throw new Error('Sequência vazia. Toque no ✏️ e liste os botões, um por linha.');
      const falhas = [];
      for (const nome of nomes) {
        const alvo = acharBotaoPorNome(nome);
        if (!alvo) { falhas.push(`${nome}: não achei esse botão`); continue; }
        if (['sequencia', 'pagina', 'relogio', 'texto-pc', 'clipboard-pc'].includes(alvo.acao?.tipo)) continue;
        try {
          const r = await executar(alvo);
          if (r.ok === false) falhas.push(`${nome}: ${(r.saida || 'falhou').trim().slice(0, 120)}`);
        } catch (e) { falhas.push(`${nome}: ${e.message}`); }
        await new Promise(r => setTimeout(r, Number(a.intervalo) || 700));
      }
      return falhas.length ? { ok: false, erro: `${nomes.length - falhas.length} de ${nomes.length} abriram`, saida: falhas.join('\n') } : { ok: true };
    }
    case 'obs':
      return { ok: true, aviso: await comandoOBS(a.comando, a.alvo) };
    case 'fechar-apps': {
      if (!WINDOWS) throw new Error('Fechar programas só funciona no Windows');
      const r = await rodarPowerShell(`& ${psAspas(path.join(RAIZ, 'ferramentas', 'fechar-apps.ps1'))} -Manter ${psAspas(a.manter || '')}`);
      const linha = r.saida.split(/\r?\n/).find(l => l.startsWith('FECHADOS:'));
      if (linha == null) throw new Error('Não consegui fechar os programas: ' + r.saida.trim().slice(0, 200));
      const lista = linha.slice(9).trim();
      log(`🌙 Fechando: ${lista || 'nada'}`);
      return { ok: true, aviso: lista ? `🌙 Fechando: ${lista}` : 'Não tinha nenhum programa aberto' };
    }
    case 'microfone': {
      if (!WINDOWS) throw new Error('Controle do microfone só no Windows');
      const modo = ['mutar', 'desmutar'].includes(a.modo) ? a.modo : 'alternar';
      const r = await rodarPowerShell(`& ${psAspas(path.join(RAIZ, 'ferramentas', 'microfone.ps1'))} -Modo ${modo}`);
      const estadoMic = r.saida.trim().split(/\s+/).pop();
      if (r.codigo !== 0 || !['mudo', 'ativo'].includes(estadoMic)) {
        log('🎙️ Erro no microfone: ' + r.saida.trim().slice(0, 500));
        const erro = r.saida.match(/ERRO: (.*)/)?.[1];
        throw new Error('Não consegui mexer no microfone' + (erro ? ': ' + erro : '. Veja a mensagem na janela preta do PC.'));
      }
      return { ok: true, aviso: estadoMic === 'mudo' ? '🎙️ Microfone mudo' : '🎙️ Microfone ligado' };
    }
    default:
      throw new Error(`Tipo de ação desconhecido: ${a.tipo}`);
  }
}

// ---------------------------------------------------------------- OBS Studio (obs-websocket 5, já vem no OBS 28 ou mais novo)
// No OBS: Ferramentas → Configurações do servidor WebSocket → Ativar. A senha vai na tela 💻 do celular.

let obs = null; // { ws, pronto: Promise, pedidos: Map }

function conectarOBS() {
  if (obs?.ws.readyState === 1 && obs.ok) return obs.pronto;
  try { obs?.ws.close(); } catch {}
  const o = cfg.obs || {};
  const ws = new WebSocket(`ws://${o.host || '127.0.0.1'}:${o.porta || 4455}`);
  const pedidos = new Map();
  const atual = { ws, pedidos, ok: false };
  atual.pronto = new Promise((resolve, reject) => {
    const t = setTimeout(() => { reject(new Error('O OBS não respondeu. Ele está aberto?')); try { ws.close(); } catch {} }, 5000);
    ws.onerror = () => { clearTimeout(t); reject(new Error('Não achei o OBS. Abra o OBS e ligue o servidor WebSocket (Ferramentas → Configurações do servidor WebSocket).')); };
    ws.onclose = ev => {
      clearTimeout(t);
      atual.ok = false;
      if (ev.code === 4009) reject(new Error('Senha do OBS errada. Confira na tela 💻 do celular.'));
      else reject(new Error('A conexão com o OBS caiu.'));
      for (const [, p] of pedidos) p.reject(new Error('A conexão com o OBS caiu.'));
      pedidos.clear();
    };
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.op === 0) { // Hello
        const ident = { rpcVersion: 1, eventSubscriptions: 0 };
        const auth = m.d.authentication;
        if (auth) {
          const segredo = crypto.createHash('sha256').update((o.senha || '') + auth.salt).digest('base64');
          ident.authentication = crypto.createHash('sha256').update(segredo + auth.challenge).digest('base64');
        }
        ws.send(JSON.stringify({ op: 1, d: ident }));
      } else if (m.op === 2) { // Identified
        clearTimeout(t); atual.ok = true; resolve();
      } else if (m.op === 7) { // resposta de um pedido
        const p = pedidos.get(m.d.requestId);
        if (!p) return;
        pedidos.delete(m.d.requestId);
        if (m.d.requestStatus.result) p.resolve(m.d.responseData || {});
        else p.reject(new Error(traduzirErroOBS(m.d.requestStatus)));
      }
    };
  });
  atual.pronto.catch(() => {});
  obs = atual;
  return atual.pronto;
}

function traduzirErroOBS(st) {
  const c = st.comment || '';
  if (st.code === 501) return 'O OBS não está gravando/transmitindo agora.';
  if (st.code === 500) return 'Isso já está ligado no OBS.';
  if (st.code === 600) return `O OBS não achou "${c.match(/"([^"]+)"/)?.[1] || 'essa fonte ou cena'}". Confira o nome no ✏️.`;
  return 'OBS: ' + (c || 'erro ' + st.code);
}

async function pedirOBS(tipo, dados) {
  await conectarOBS();
  const id = novoId();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { obs.pedidos.delete(id); reject(new Error('O OBS demorou para responder.')); }, 8000);
    obs.pedidos.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject: e => { clearTimeout(t); reject(e); } });
    obs.ws.send(JSON.stringify({ op: 6, d: { requestType: tipo, requestId: id, requestData: dados } }));
  });
}

const COMANDOS_OBS = {
  'iniciar-live': ['StartStream', '🔴 Transmissão iniciada'],
  'parar-live': ['StopStream', '⏹️ Transmissão encerrada'],
  'iniciar-gravacao': ['StartRecord', '⏺️ Gravando'],
  'parar-gravacao': ['StopRecord', '⏹️ Gravação salva'],
  'pausar-gravacao': ['ToggleRecordPause', '⏯️ Gravação pausada/retomada'],
  'salvar-replay': ['SaveReplayBuffer', '💾 Replay salvo'],
};

async function comandoOBS(comando, alvo) {
  if (COMANDOS_OBS[comando]) { await pedirOBS(COMANDOS_OBS[comando][0]); return COMANDOS_OBS[comando][1]; }
  switch (comando) {
    case 'alternar-live': { const r = await pedirOBS('ToggleStream'); return r.outputActive ? '🔴 Transmissão iniciada' : '⏹️ Transmissão encerrada'; }
    case 'alternar-gravacao': { const r = await pedirOBS('ToggleRecord'); return r.outputActive ? '⏺️ Gravando' : '⏹️ Gravação salva'; }
    case 'cena':
      if (!alvo) throw new Error('Coloque o nome da cena no ✏️.');
      await pedirOBS('SetCurrentProgramScene', { sceneName: alvo }); return `🎬 Cena: ${alvo}`;
    case 'proxima-cena': {
      const r = await pedirOBS('GetSceneList');
      const nomes = (r.scenes || []).sort((a, b) => b.sceneIndex - a.sceneIndex).map(c => c.sceneName); // ordem da lista do OBS
      if (!nomes.length) throw new Error('O OBS não tem cenas.');
      const prox = nomes[(nomes.indexOf(r.currentProgramSceneName) + 1) % nomes.length];
      await pedirOBS('SetCurrentProgramScene', { sceneName: prox }); return `🎬 Cena: ${prox}`;
    }
    case 'mutar': {
      const nome = alvo || 'Mic/Aux';
      const r = await pedirOBS('ToggleInputMute', { inputName: nome });
      return r.inputMuted ? `🔇 ${nome} mudo` : `🎙️ ${nome} ligado`;
    }
    case 'alternar-fonte': {
      if (!alvo) throw new Error('Coloque o nome da fonte (ex.: a câmera) no ✏️.');
      const { currentProgramSceneName: cena } = await pedirOBS('GetCurrentProgramScene');
      const { sceneItemId } = await pedirOBS('GetSceneItemId', { sceneName: cena, sourceName: alvo });
      const { sceneItemEnabled } = await pedirOBS('GetSceneItemEnabled', { sceneName: cena, sceneItemId });
      await pedirOBS('SetSceneItemEnabled', { sceneName: cena, sceneItemId, sceneItemEnabled: !sceneItemEnabled });
      return `${sceneItemEnabled ? '🙈' : '👁️'} ${alvo} ${sceneItemEnabled ? 'escondida' : 'aparecendo'}`;
    }
    default: throw new Error('Comando do OBS desconhecido: ' + comando);
  }
}

// ---------------------------------------------------------------- checklist do END SESSION (fica na pasta, você edita à vontade)

const CHECKLIST = path.join(RAIZ, 'checklist.txt');
if (!fs.existsSync(CHECKLIST)) fs.writeFileSync(CHECKLIST, [
  'CHECKLIST DE ENCERRAMENTO',
  '(edite à vontade: este arquivo é seu e as atualizações não mexem nele)',
  '',
  '[ ] Commit e push do que foi feito hoje',
  '[ ] Responder clientes pendentes (Instagram / WhatsApp / e-mail)',
  '[ ] Anotar o que ficou para amanhã',
  '[ ] Conferir o Sancoto',
  '[ ] Fechar o que não vai usar',
  '',
].join('\r\n'));

// ---------------------------------------------------------------- espelho das notificações do Windows (experimental)
// Lê o banco onde o próprio Windows guarda as notificações e repassa as novas para o celular.

function iniciarEspelhoWindows() {
  if (!WINDOWS || cfg.espelharNotificacoesWindows === false) return;
  let sqlite;
  try { sqlite = require('node:sqlite'); } catch {
    log('ℹ️  Para espelhar as notificações do Windows, atualize o Node para a versão 22.13 ou mais nova.');
    return;
  }
  const banco = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Notifications', 'wpndatabase.db');
  const ignorar = (cfg.ignorarApps || []).map(s => s.toLowerCase());
  let ultimo = null, avisou = false;

  const tick = () => {
    let db;
    try {
      db = new sqlite.DatabaseSync(banco, { readOnly: true });
      if (ultimo === null) {
        ultimo = db.prepare('SELECT MAX(Id) AS m FROM Notification').get().m || 0;
        log('🪟 Espelhando notificações do Windows (experimental)');
        return;
      }
      const linhas = db.prepare(`SELECT n.Id AS id, n.Payload AS payload, h.PrimaryId AS app
        FROM Notification n LEFT JOIN NotificationHandler h ON h.RecordId = n.HandlerId
        WHERE n.Type = 'toast' AND n.Id > ? ORDER BY n.Id`).all(ultimo);
      for (const l of linhas) {
        ultimo = Math.max(ultimo, l.id);
        const xml = typeof l.payload === 'string' ? l.payload : Buffer.from(l.payload || []).toString('utf8');
        const textos = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map(m => desescaparXml(m[1]).trim()).filter(Boolean);
        if (!textos.length) continue;
        const app = nomeDoApp(l.app);
        if (ignorar.some(i => app.toLowerCase().includes(i))) continue;
        criarNotif({ titulo: textos[0], mensagem: textos.slice(1).join('\n'), origem: app });
      }
    } catch (e) {
      if (!avisou) { log('⚠️  Não consegui ler as notificações do Windows: ' + e.message); avisou = true; }
    } finally { try { db?.close(); } catch {} }
  };
  tick();
  setInterval(tick, 3000);
}

function desescaparXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
}

function nomeDoApp(id) {
  if (!id) return 'Windows';
  let s = String(id).split('\\').pop().split('!')[0];
  s = s.replace(/\.exe$/i, '').replace(/_[a-z0-9]{13}$/i, '');
  s = s.split('.').filter(p => !/^(microsoft|windows|com)$/i.test(p)).pop() || s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------- atualizações
// O servidor confere de tempos em tempos se saiu versão nova. Quando você manda atualizar pelo celular,
// ele baixa os arquivos, confere cada um pelo hash, troca tudo de uma vez e reinicia sozinho.
// O config.json (seus botões e o token) nunca é tocado.

let atualizacao = null; // { versao, notas } quando houver versão nova
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const urlBase = () => String(cfg.urlAtualizacao || '').replace(/\/+$/, '');

function versaoMaior(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

async function buscarManifesto() {
  const r = await fetch(urlBase() + '/manifesto.json?v=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('Servidor de atualizações respondeu ' + r.status);
  return r.json();
}

let avisouErroAtualizacao = false;
async function verificarAtualizacao() {
  if (!urlBase()) return { atual: VERSAO, nova: null };
  try {
    const m = await buscarManifesto();
    const antes = atualizacao?.versao;
    atualizacao = versaoMaior(m.versao, VERSAO) ? { versao: m.versao, notas: m.notas || '' } : null;
    if (atualizacao && atualizacao.versao !== antes) log(`⬆️  Versão ${atualizacao.versao} disponível. Atualize pelo celular (toque no aviso azul).`);
    enviar('atualizacao', atualizacao);
    avisouErroAtualizacao = false;
    return { atual: VERSAO, nova: atualizacao };
  } catch (e) {
    if (!avisouErroAtualizacao) { log('ℹ️  Não consegui procurar atualizações: ' + e.message); avisouErroAtualizacao = true; }
    return { atual: VERSAO, nova: atualizacao, erro: 'Não consegui procurar atualizações agora.' };
  }
}
setInterval(verificarAtualizacao, 3 * 3600 * 1000);

async function aplicarAtualizacao() {
  const m = await buscarManifesto();
  if (!versaoMaior(m.versao, VERSAO)) throw new Error('Você já está na versão mais nova');
  const novos = [];
  for (const [rel, hash] of Object.entries(m.arquivos || {})) {
    if (rel === 'config.json' || rel.includes('..') || !/^[\w][\w./-]*$/.test(rel)) throw new Error('Atualização com arquivo inválido: ' + rel);
    const destino = path.join(RAIZ, rel);
    if (fs.existsSync(destino) && sha256(fs.readFileSync(destino)) === hash) continue;
    const r = await fetch(urlBase() + '/' + rel + '?v=' + hash.slice(0, 12), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error('Falha ao baixar ' + rel);
    const dados = Buffer.from(await r.arrayBuffer());
    if (sha256(dados) !== hash) throw new Error('Arquivo veio corrompido: ' + rel);
    novos.push([destino, dados]);
  }
  // só grava depois de baixar e conferir tudo
  trabalhadorTeclas?.kill();
  for (const [destino, dados] of novos) {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino + '.novo', dados);
    fs.renameSync(destino + '.novo', destino);
  }
  log(`✅ Atualizado para a versão ${m.versao} (${novos.length} arquivos). Reiniciando…`);
  return m.versao;
}

const MARCA_REINICIO = path.join(RAIZ, '.reiniciando');
function reiniciar() {
  enviar('reiniciando', {});
  fs.writeFileSync(MARCA_REINICIO, '1');
  setTimeout(() => {
    servidor.close();
    for (const res of clientes) res.end();
    if (process.env.STREAMDECK_BAT) process.exit(42); // o iniciar.bat abre de novo
    spawn(process.execPath, [__filename], { detached: true, stdio: 'inherit', cwd: RAIZ }).unref();
    process.exit(0);
  }, 700);
}

// ---------------------------------------------------------------- HTTP

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

// O app instalado (https, no GitHub) conversa com este servidor de outro endereço: libera isso.
// Quem manda é o token, então não importa de qual endereço vem o pedido.
function liberarApp(req, res) {
  if (!req.headers.origin) return;
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  res.setHeader('Access-Control-Allow-Headers', 'x-token, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Max-Age', '600');
  res.setHeader('Vary', 'Origin');
}

function json(res, codigo, dados) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(dados));
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 1e6) { reject(new Error('grande demais')); req.destroy(); } });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { reject(new Error('JSON inválido')); } });
  });
}

function autorizado(req, url) {
  const t = String(req.headers['x-token'] || url.searchParams.get('t') || '');
  const a = Buffer.from(t), b = Buffer.from(cfg.token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function local(req) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
}

function ipsDaRede() {
  const ips = [];
  for (const [nome, lista] of Object.entries(os.networkInterfaces()))
    for (const i of lista || []) if (i.family === 'IPv4' && !i.internal && !/vEthernet|VirtualBox|VMware|WSL/i.test(nome)) ips.push(i.address);
  return ips.sort((a, b) => (b.startsWith('192.168.') - a.startsWith('192.168.')));
}

function servirArquivo(res, arquivo) {
  const alvo = path.normalize(path.join(PUBLICO, arquivo));
  if (!alvo.startsWith(PUBLICO)) { res.writeHead(403); return res.end(); }
  fs.readFile(alvo, (erro, dados) => {
    if (erro) { res.writeHead(404); return res.end('Não encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(alvo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(dados);
  });
}

const APP_URL = 'https://jv9712441-creator.github.io/streamdeck/public/';

function paginaPareamento() {
  // o QR abre o app instalado já conectado; o endereço direto fica embaixo como alternativa
  const diretos = ipsDaRede().map(ip => `http://${ip}:${cfg.porta}/?t=${cfg.token}`);
  const urls = ipsDaRede().map(ip => `${APP_URL}#pc=${encodeURIComponent(`http://${ip}:${cfg.porta}`)}&t=${cfg.token}`);
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Parear Stream Deck</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;background:#111;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0}
main{text-align:center;max-width:520px;padding:24px}.qr{background:#fff;padding:16px;border-radius:12px;display:inline-block;margin:16px 0}
code{display:block;word-break:break-all;background:#222;padding:10px;border-radius:8px;font-size:13px;margin:6px 0}p{color:#aaa}</style>
<main><h1>Parear o celular</h1><p>Com o celular no mesmo Wi-Fi do PC, aponte a câmera para o código.</p>
<p>Pode escanear com a câmera do celular ou pelo app: tela 💻 → <b>Escanear QR code</b>.</p>
${urls.length ? urls.map((u, i) => `<div class="qr" id="qr${i}"></div><p>Endereço direto (se preferir abrir pelo PC):</p><code>${diretos[i]}</code>`).join('') : '<p>Não achei o IP do PC na rede. Confira se ele está conectado ao Wi-Fi ou cabo.</p>'}
<p>Não compartilhe este código: quem tiver ele controla o PC.</p></main>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<script>${JSON.stringify(urls)}.forEach((u,i)=>{try{new QRCode(document.getElementById('qr'+i),{text:u,width:260,height:260,correctLevel:QRCode.CorrectLevel.L})}catch(e){}})</script></html>`;
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const rota = url.pathname;

  try {
    if (rota === '/parear') {
      if (!local(req)) { res.writeHead(403); return res.end('Abra esta página no próprio PC.'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(paginaPareamento());
    }

    if (!rota.startsWith('/api/')) return servirArquivo(res, rota === '/' ? 'index.html' : rota.slice(1));

    liberarApp(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    if (!autorizado(req, url)) return json(res, 401, { erro: 'Token inválido. Pareie de novo pelo QR code.' });

    if (rota === '/api/eventos') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      clientes.add(res);
      enviar('estado', { config: configPublica(), notifs, stats, atualizacao }, res);
      req.on('close', () => clientes.delete(res));
      return;
    }

    if (rota === '/api/ping') return json(res, 200, { ok: true });
    if (req.method !== 'POST') return json(res, 405, { erro: 'Use POST' });
    const corpo = await lerCorpo(req);

    if (rota === '/api/acao') {
      const b = acharBotao(corpo.id);
      if (!b) return json(res, 404, { erro: 'Botão não encontrado' });
      log(`▶️  ${b.nome}`);
      try { return json(res, 200, await executar(b, corpo)); }
      catch (e) { return json(res, 200, { ok: false, erro: e.message }); }
    }

    if (rota === '/api/config') {
      if (!Array.isArray(corpo.paginas)) return json(res, 400, { erro: 'Config inválida' });
      cfg.paginas = corpo.paginas.map(p => ({ id: p.id, nome: String(p.nome || 'Página'), botoes: Array.isArray(p.botoes) ? p.botoes : [] }));
      if (corpo.colunas) cfg.colunas = Math.min(6, Math.max(2, +corpo.colunas || 3));
      if ('colunasDeitado' in corpo) cfg.colunasDeitado = Math.min(10, Math.max(0, +corpo.colunasDeitado || 0));
      garantirIds(cfg);
      salvarConfig(cfg);
      enviar('config', configPublica());
      return json(res, 200, { ok: true });
    }

    if (rota === '/api/notificar') {
      const n = criarNotif(corpo);
      if (!(n.perguntar && corpo.esperar)) return json(res, 200, { id: n.id });
      // Segura a resposta até alguém decidir no celular (ou o tempo acabar).
      esperando.set(n.id, status => json(res, 200, { id: n.id, decisao: status }));
      req.on('close', () => { if (esperando.has(n.id)) { esperando.delete(n.id); resolverNotif(n.id, 'expirado'); } });
      return;
    }

    if (rota === '/api/decidir') {
      const mapa = { permitir: 'permitido', negar: 'negado', pc: 'no-pc' };
      if (!mapa[corpo.decisao]) return json(res, 400, { erro: 'Decisão inválida' });
      return json(res, 200, { ok: resolverNotif(corpo.id, mapa[corpo.decisao]) });
    }

    if (rota === '/api/limpar') {
      // tipo: 'avisos' (tela de notificações), 'pedidos' (respondidos na tela de permissões) ou tudo
      const apagar = n => n.status !== 'pendente' && (!corpo.id || n.id === corpo.id) &&
        (corpo.tipo === 'avisos' ? !n.perguntar : corpo.tipo === 'pedidos' ? n.perguntar : true);
      for (let i = notifs.length - 1; i >= 0; i--) if (apagar(notifs[i])) notifs.splice(i, 1);
      enviar('estado', { config: configPublica(), notifs, stats, atualizacao });
      return json(res, 200, { ok: true });
    }

    if (rota === '/api/atualizacao') return json(res, 200, await verificarAtualizacao());

    if (rota === '/api/obs') {
      // salva a conexão com o OBS (a senha só é trocada se vier preenchida) e testa
      cfg.obs ??= {};
      if (corpo.host) cfg.obs.host = String(corpo.host).trim();
      if (corpo.porta) cfg.obs.porta = Math.max(1, Math.min(65535, +corpo.porta || 4455));
      if (typeof corpo.senha === 'string' && corpo.senha !== '') cfg.obs.senha = corpo.senha;
      if (corpo.apagarSenha) cfg.obs.senha = '';
      salvarConfig(cfg);
      try { obs?.ws.close(); } catch {}
      obs = null;
      try {
        const v = await pedirOBS('GetVersion');
        return json(res, 200, { ok: true, versao: v.obsVersion });
      } catch (e) { return json(res, 200, { ok: false, erro: e.message }); }
    }

    if (rota === '/api/restaurar-paginas') {
      const padrao = JSON.parse(fs.readFileSync(CONFIG_PADRAO, 'utf8'));
      cfg.paginas = padrao.paginas;
      garantirIds(cfg);
      salvarConfig(cfg);
      enviar('config', configPublica());
      log('📄 Páginas de botões trocadas pelas do padrão');
      return json(res, 200, { ok: true });
    }

    if (rota === '/api/atualizar') {
      try {
        const versao = await aplicarAtualizacao();
        json(res, 200, { ok: true, versao });
        reiniciar();
      } catch (e) { json(res, 200, { ok: false, erro: e.message }); }
      return;
    }

    return json(res, 404, { erro: 'Rota desconhecida' });
  } catch (e) {
    return json(res, 500, { erro: e.message });
  }
});

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`);
}

const reiniciou = fs.existsSync(MARCA_REINICIO);
if (reiniciou) fs.rmSync(MARCA_REINICIO, { force: true });
let tentativas = 0;

servidor.listen(cfg.porta, '0.0.0.0', () => {
  const ips = ipsDaRede();
  console.log(`\n  🎛️  Stream Deck v${VERSAO} rodando!\n`);
  console.log(`  Para parear, abra no PC:  http://localhost:${cfg.porta}/parear`);
  ips.forEach(ip => console.log(`  Endereço na rede:         http://${ip}:${cfg.porta}`));
  console.log('\n  Deixe esta janela aberta. Ctrl+C para fechar.\n');
  if (WINDOWS && cfg.abrirPareamentoAoIniciar !== false && !reiniciou)
    rodarPowerShell(`Start-Process 'http://localhost:${cfg.porta}/parear'`);
  iniciarEspelhoWindows();
  verificarAtualizacao();
});

servidor.on('error', e => {
  if (e.code === 'EADDRINUSE' && reiniciou && tentativas++ < 10) return setTimeout(() => servidor.listen(cfg.porta, '0.0.0.0'), 500);
  if (e.code === 'EADDRINUSE') console.error(`\n  A porta ${cfg.porta} já está em uso. O Stream Deck já está aberto em outra janela?\n`);
  else console.error(e);
  process.exit(1);
});
