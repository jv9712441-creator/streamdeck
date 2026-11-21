'use strict';
// Stream Deck — interface do celular
// Telas (deslize para o lado): 0 Relógio · 1 Botões · 2 Notificações · 3 Permissões · 4 PC

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const guardar = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const ler = k => { try { return localStorage.getItem(k); } catch { return null; } };
const vibrar = p => { try { navigator.vibrate?.(p); } catch {} };
const hora = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const TELA = { relogio: 0, botoes: 1, notificacoes: 2, permissoes: 3, pc: 4 };
const estado = {
  token: null, config: null, notifs: [], stats: null, atualizacao: null,
  pagina: +(ler('sd_pagina') || 0), editando: false, naoLidas: 0, tela: 0,
};

// ------------------------------------------------------------ conexão com o PC
// Aberto pelo próprio PC (http://IP:8765): conversa com esse mesmo endereço.
// Instalado pelo GitHub (https): abre sempre, mesmo sem PC, e conversa com o PC salvo ao escanear o QR code.

const PELO_PC = location.protocol === 'http:';
const APP_URL = 'https://jv9712441-creator.github.io/streamdeck/public/';
const conexao = { base: PELO_PC ? location.origin : ler('sd_pc'), online: false, controle: null };
// avisa o Chrome que o destino é um aparelho da rede de casa (ou o próprio aparelho)
const espacoDe = base => { try { return /^(localhost|127\.|\[::1\])/.test(new URL(base).hostname) ? 'loopback' : 'local'; } catch { return 'local'; } };
const redeLocal = () => ({ targetAddressSpace: espacoDe(conexao.base) });

(() => {
  const u = new URL(location.href);
  const hash = new URLSearchParams(u.hash.slice(1));
  const t = u.searchParams.get('t') || hash.get('t');
  const pc = hash.get('pc') || (PELO_PC ? location.origin : null);
  if (t && pc) { guardar('sd_token', t); guardar('sd_pc', pc); conexao.base = pc; }
  if (t) history.replaceState(null, '', u.pathname);
  estado.token = ler('sd_token');
  try { estado.config = JSON.parse(ler('sd_config') || 'null'); } catch {}
})();

const pareado = () => !!(estado.token && conexao.base);

// Aceita o QR do PC nos dois formatos: http://IP:8765/?t=… ou o link do app (#pc=…&t=…)
function parear(texto) {
  let u;
  try { u = new URL(String(texto).trim()); } catch { throw new Error('Esse QR code não é do Stream Deck.'); }
  const hash = new URLSearchParams(u.hash.slice(1));
  const t = u.searchParams.get('t') || hash.get('t');
  let pc = hash.get('pc') || (u.protocol === 'http:' ? u.origin : null);
  if (!t || !pc) throw new Error('Esse QR code não é do Stream Deck.');
  pc = new URL(pc).origin;
  conexao.base = pc; estado.token = t;
  guardar('sd_pc', pc); guardar('sd_token', t);
  conectar();
}

function esquecerToken() {
  estado.token = null; guardar('sd_token', null);
  if (!PELO_PC) { conexao.base = null; guardar('sd_pc', null); }
  conexao.controle?.abort();
  ficouOnline(false);
}

function ficouOnline(on) {
  conexao.online = on;
  $('#status').classList.toggle('on', on);
  atualizarRelogio(); renderizarPC();
}

async function api(rota, corpo) {
  if (!pareado()) throw new Error('Nenhum PC conectado. Vá na tela 💻 e escaneie o QR code.');
  let r;
  try {
    r = await fetch(conexao.base + '/api/' + rota, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-token': estado.token },
      body: JSON.stringify(corpo || {}),
      ...redeLocal(),
    });
  } catch { throw new Error('Não consegui falar com o PC. O Stream Deck está aberto lá e no mesmo Wi-Fi?'); }
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { esquecerToken(); throw new Error('O PC não reconhece mais este celular. Escaneie o QR code de novo.'); }
  if (!r.ok) throw new Error(d.erro || 'Erro ' + r.status);
  return d;
}

const EVENTOS = {
  estado: d => {
    // o PC foi atualizado: recarrega para pegar a tela nova
    if (estado.versaoCarregada && d.config.versao !== estado.versaoCarregada) return location.reload();
    estado.versaoCarregada = d.config.versao;
    estado.config = d.config; estado.notifs = d.notifs; estado.stats = d.stats; estado.atualizacao = d.atualizacao;
    guardar('sd_config', JSON.stringify(d.config)); // para mostrar os botões mesmo sem o PC
    renderizar(); renderizarUso(); renderizarListas(); renderizarPC();
    if (pendentes().length && estado.tela !== TELA.relogio) abrirPermissoes();
  },
  config: d => { estado.config = d; guardar('sd_config', JSON.stringify(d)); renderizar(); },
  stats: d => { estado.stats = d; renderizarUso(); renderizarPC(); },
  notif: d => chegouNotif(d),
  atualizacao: nova => {
    if (nova && nova.versao !== estado.atualizacao?.versao) aviso(`Versão ${nova.versao} disponível. Veja na tela 💻`);
    estado.atualizacao = nova; renderizarPC();
  },
  reiniciando: () => aviso('Atualizado! Reiniciando o Stream Deck…'),
};

// Recebe os eventos ao vivo do PC e reconecta sozinho se cair
async function conectar() {
  conexao.controle?.abort();
  if (!pareado()) { ficouOnline(false); return; }
  const controle = conexao.controle = new AbortController();
  let espera = 1000;
  while (!controle.signal.aborted) {
    try {
      const r = await fetch(`${conexao.base}/api/eventos?t=${encodeURIComponent(estado.token)}`, { signal: controle.signal, cache: 'no-store', ...redeLocal() });
      if (r.status === 401) { aviso('O PC não reconhece mais este celular. Escaneie o QR code de novo.', true); esquecerToken(); return; }
      if (!r.ok || !r.body) throw new Error('falhou');
      ficouOnline(true); espera = 1000;
      const leitor = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const bloco = buf.slice(0, i); buf = buf.slice(i + 2);
          let nome = '', dados = '';
          for (const l of bloco.split('\n')) {
            if (l.startsWith('event: ')) nome = l.slice(7);
            else if (l.startsWith('data: ')) dados += l.slice(6);
          }
          if (nome && dados) try { EVENTOS[nome]?.(JSON.parse(dados)); } catch (e) { console.error(e); }
        }
      }
    } catch { if (controle.signal.aborted) return; }
    ficouOnline(false);
    await new Promise(r => setTimeout(r, espera));
    espera = Math.min(espera * 2, 15000);
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && pareado() && !conexao.online) conectar();
});

// ------------------------------------------------------------ escanear o QR code do PC pela câmera

function carregarJsQR() {
  return new Promise((ok, erro) => {
    if (window.jsQR) return ok();
    const s = document.createElement('script');
    s.src = 'jsqr.js'; s.onload = ok; s.onerror = erro;
    document.head.append(s);
  });
}

async function escanearQR() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return aviso('A câmera só funciona no app instalado. Toque em "Instalar o app" nesta tela.', true);
  }
  const c = abrirModal(`<h2>Escanear QR code</h2><p class="dica">Aponte para o QR code que aparece no PC quando o Stream Deck abre.</p>
    <video id="camera" playsinline muted style="width:100%;max-height:55vh;object-fit:cover;border-radius:12px;background:#000"></video>
    <button class="neutro" data-fechar>Cancelar</button>`);
  let fluxo = null, parar = false, ultimoRuim = '';
  fecharModalAtual = () => { parar = true; fluxo?.getTracks().forEach(t => t.stop()); };
  c.querySelector('[data-fechar]').onclick = fecharModal;
  try {
    fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch {
    fecharModal();
    return aviso('Não consegui abrir a câmera. Libere a permissão da câmera para o app.', true);
  }
  if (parar) return fluxo.getTracks().forEach(t => t.stop());
  const video = $('#camera');
  video.srcObject = fluxo;
  await video.play().catch(() => {});
  let detector = null;
  try { if ('BarcodeDetector' in window) detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch {}
  if (!detector) await carregarJsQR().catch(() => {});
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const procurar = async () => {
    if (parar) return;
    let texto = null;
    try {
      if (detector) texto = (await detector.detect(video))[0]?.rawValue;
      else if (window.jsQR && video.videoWidth) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        texto = jsQR(img.data, img.width, img.height)?.data;
      }
    } catch {}
    if (texto && texto !== ultimoRuim) {
      try {
        parear(texto);
        vibrar(80); fecharModal(); aviso('Conectando ao PC…');
        return;
      } catch (e) { ultimoRuim = texto; aviso(e.message, true); }
    }
    setTimeout(procurar, 200);
  };
  procurar();
}

// ------------------------------------------------------------ navegação entre telas

const telas = $('#telas');
const largura = () => telas.clientWidth || innerWidth;

function irParaTela(i, suave = true) {
  telas.scrollTo({ left: i * largura(), behavior: suave ? 'smooth' : 'instant' });
  mudouTela(i);
}

function mudouTela(i) {
  if (i === estado.tela) return;
  estado.tela = i;
  document.querySelectorAll('#menu button').forEach(b => b.classList.toggle('ativo', +b.dataset.ir === i));
  if (i === TELA.notificacoes) { estado.naoLidas = 0; renderizarBadges(); }
  if (i !== TELA.permissoes) voltarPara = null; // você navegou por conta própria
  manterTelaLigada(i === TELA.relogio);
  menuApagado(i === TELA.relogio);
  if (i === TELA.botoes) ajustarGrade();
}

let fimRolagem;
telas.addEventListener('scroll', () => {
  clearTimeout(fimRolagem);
  fimRolagem = setTimeout(() => mudouTela(Math.round(telas.scrollLeft / largura())), 80);
}, { passive: true });

$('#menu').addEventListener('click', e => {
  const b = e.target.closest('[data-ir]');
  if (b) { vibrar(8); irParaTela(+b.dataset.ir); }
});

addEventListener('resize', () => {
  telas.scrollLeft = estado.tela * largura();
  if (estado.config) ajustarGrade();
});

// No relógio, a barra de baixo fica apagadinha até você tocar na tela
let tempoMenu;
function menuApagado(sim) {
  clearTimeout(tempoMenu);
  $('#menu').classList.remove('apagado');
  if (sim) tempoMenu = setTimeout(() => $('#menu').classList.add('apagado'), 4000);
}
$('#menu').addEventListener('touchstart', () => menuApagado(estado.tela === TELA.relogio), { passive: true });

// ------------------------------------------------------------ tela de botões

const paginas = () => estado.config?.paginas || [];

function renderizar() {
  if (!estado.config) {
    $('#abas').innerHTML = '';
    $('#grade').innerHTML = '<p class="vazio" style="grid-column:1/-1">Nenhum PC conectado ainda.<br>Vá na tela 💻 e toque em <b>Escanear QR code</b>.</p>';
    return;
  }
  const ps = paginas();
  estado.pagina = Math.min(Math.max(0, estado.pagina), Math.max(0, ps.length - 1));

  const abas = $('#abas');
  abas.innerHTML = '';
  ps.forEach((p, i) => {
    const b = document.createElement('button');
    b.textContent = p.nome;
    if (i === estado.pagina) b.className = 'ativa';
    b.onclick = () => irPagina(i);
    abas.append(b);
  });

  const grade = $('#grade');
  grade.classList.toggle('editando', estado.editando);
  grade.innerHTML = '';
  (ps[estado.pagina]?.botoes || []).forEach((b, i) => {
    const el = document.createElement('button');
    el.className = 'tecla';
    el.style.background = b.cor || '#1f2937';
    el.innerHTML = `<span class="ico">${esc(b.icone || '⬜')}</span><span class="nome">${esc(b.nome)}</span>`;
    el.onclick = () => estado.editando ? abrirEditor(i) : apertar(b, el);
    grade.append(el);
  });
  if (estado.editando) {
    const novo = document.createElement('button');
    novo.className = 'tecla nova';
    novo.textContent = '+';
    novo.onclick = () => abrirEditor(null);
    grade.append(novo);
  }
  ajustarGrade();
}

function irPagina(i) {
  estado.pagina = i; guardar('sd_pagina', i); vibrar(8); renderizar();
}

// Tamanho dos botões: em pé usa o número de colunas escolhido;
// deitado escolhe sozinho as colunas para tudo caber sem rolar (ou usa o que você fixar).
const deitado = () => innerWidth > innerHeight;
function ajustarGrade() {
  const grade = $('#grade');
  if (!grade.clientWidth || !estado.config) return;
  const n = grade.children.length;
  const est = getComputedStyle(grade);
  const gap = parseFloat(est.columnGap) || 10;
  const W = grade.clientWidth - parseFloat(est.paddingLeft) - parseFloat(est.paddingRight);
  const H = grade.clientHeight - parseFloat(est.paddingTop) - parseFloat(est.paddingBottom);
  const ladoPara = c => (W - gap * (c - 1)) / c;
  let c, lado;
  if (!deitado()) {
    c = estado.config.colunas || 3;
    lado = ladoPara(c);
  } else if (estado.config.colunasDeitado) {
    c = estado.config.colunasDeitado;
    lado = ladoPara(c);
  } else {
    c = 1; lado = 0;
    for (let k = 1; k <= Math.max(1, n); k++) {
      const linhas = Math.ceil(n / k);
      const l = Math.min(ladoPara(k), (H - gap * (linhas - 1)) / linhas);
      if (l > lado) { lado = l; c = k; }
    }
    if (lado < 72) { c = Math.max(1, Math.floor((W + gap) / (72 + gap))); lado = ladoPara(c); }
    lado = Math.min(lado, 170);
  }
  grade.style.setProperty('--colunas', c);
  grade.style.setProperty('--lado', Math.floor(Math.max(40, lado)) + 'px');
  $('#numColunas').textContent = deitado() ? (estado.config.colunasDeitado || 'Auto') : c;
}

async function apertar(b, el) {
  vibrar(12);
  const a = b.acao || {};
  if (b.confirmar && !(await confirmar(`${b.icone || ''} ${b.nome}`, 'Tem certeza?'))) return;

  if (a.tipo === 'pagina') { const i = paginas().findIndex(p => p.nome === a.pagina); if (i >= 0) irPagina(i); return; }
  if (a.tipo === 'relogio') { if (a.estilo && RELOGIOS[a.estilo]) trocarEstilo(a.estilo); irParaTela(TELA.relogio); return; }

  const extra = {};
  if (a.tipo === 'texto-pc') {
    const t = await pedirTexto(b.nome, a.colar ? 'Vai ser colado onde o cursor estiver no PC.' : 'Vai para a área de transferência do PC (Ctrl+V lá).');
    if (t == null) return;
    extra.texto = t;
  }

  el.classList.add('rodando');
  try {
    const r = await api('acao', { id: b.id, ...extra });
    marcar(el, r.ok);
    if (!r.ok) aviso(r.erro || 'Não deu certo', true);
    else if (r.aviso) aviso(r.aviso);
    if (r.saida) mostrarTexto(r.ok ? b.nome : `${b.nome}: o que falhou`, r.saida, false);
    if (r.texto != null) mostrarTexto('Clipboard do PC', r.texto, true);
  } catch (e) {
    marcar(el, false); aviso(e.message, true);
  } finally {
    el.classList.remove('rodando');
  }
}

function marcar(el, ok) {
  el.classList.remove('ok', 'erro'); void el.offsetWidth; // reinicia a animação
  el.classList.add(ok ? 'ok' : 'erro');
  if (!ok) vibrar([40, 60, 40]);
  setTimeout(() => el.classList.remove('ok', 'erro'), 700);
}

// onda saindo do ponto onde o dedo tocou
$('#grade').addEventListener('pointerdown', e => {
  const t = e.target.closest('.tecla');
  if (!t) return;
  const r = t.getBoundingClientRect(), lado = Math.max(r.width, r.height) * 2.2;
  const o = document.createElement('span');
  o.className = 'onda';
  o.style.cssText = `width:${lado}px;height:${lado}px;left:${e.clientX - r.left - lado / 2}px;top:${e.clientY - r.top - lado / 2}px`;
  t.append(o);
  setTimeout(() => o.remove(), 600);
});

function renderizarUso() {
  const s = estado.stats;
  $('#uso').textContent = s ? `CPU ${s.cpu}% · RAM ${s.ram}%` : '';
}

// ------------------------------------------------------------ edição de botões e páginas

const TIPOS = {
  app: { nome: 'Abrir app ou site', campos: [
    ['caminho', 'Programa, arquivo ou site', 'texto', 'Ex.: app:SteelSeries GG (nome do menu Iniciar), notepad, https://youtube.com, C:\\Jogos\\jogo.exe, spotify:'],
    ['argumentos', 'Argumentos (opcional)', 'texto', '']] },
  comando: { nome: 'Rodar comando', campos: [
    ['comando', 'Comando', 'area', 'Ex.: Get-Date, ipconfig, shutdown /r /t 0'],
    ['shell', 'Rodar no', 'select', '', { powershell: 'PowerShell', cmd: 'Prompt (cmd)' }],
    ['mostrarSaida', 'Mostrar o resultado no celular', 'check']] },
  atalho: { nome: 'Atalho de teclado', campos: [
    ['teclas', 'Teclas', 'texto', 'Ex.: ctrl+shift+esc · win+d · alt+tab · f5 · playpause · proxima · anterior · volumemais · volumemenos · mudo']] },
  'texto-pc': { nome: 'Enviar texto pro PC', campos: [['colar', 'Colar sozinho (Ctrl+V) depois de enviar', 'check']] },
  'clipboard-pc': { nome: 'Pegar clipboard do PC', campos: [] },
  sequencia: { nome: 'Modo (vários botões em sequência)', campos: [
    ['botoes', 'Botões, um por linha (nome igual ao do botão)', 'area', 'Ex.: VS Code · Terminal · Navegador']] },
  obs: { nome: 'OBS Studio', campos: [
    ['comando', 'Comando', 'select', '', { 'iniciar-live': 'Iniciar transmissão', 'parar-live': 'Encerrar transmissão', 'alternar-live': 'Liga/desliga transmissão',
      'iniciar-gravacao': 'Iniciar gravação', 'parar-gravacao': 'Parar gravação', 'alternar-gravacao': 'Liga/desliga gravação', 'pausar-gravacao': 'Pausar/retomar gravação',
      'cena': 'Ir para uma cena', 'proxima-cena': 'Próxima cena', 'mutar': 'Mutar/desmutar áudio', 'alternar-fonte': 'Mostrar/esconder fonte (ex.: câmera)', 'salvar-replay': 'Salvar replay' }],
    ['alvo', 'Nome da cena, áudio ou fonte (quando precisar)', 'texto', 'Igual aparece no OBS. Ex.: Mic/Aux, Câmera, Jogando']] },
  'fechar-apps': { nome: 'Fechar todos os programas', campos: [
    ['manter', 'Não fechar estes (nomes separados por vírgula)', 'texto', 'Ex.: Spotify, Discord. Quem tiver algo sem salvar pergunta antes de fechar.']] },
  microfone: { nome: 'Microfone do Windows', campos: [['modo', 'Ação', 'select', '', { alternar: 'Liga/desliga', mutar: 'Mutar', desmutar: 'Desmutar' }]] },
  pagina: { nome: 'Ir para outra página', campos: [['pagina', 'Página', 'paginas']] },
  relogio: { nome: 'Ir para o relógio', campos: [['estilo', 'Estilo', 'select', '',
    { lcd: 'LCD', cores: 'Duas cores', grande: 'Números grandes', digital: 'Digital', minimal: 'Minimalista', analogico: 'Analógico', palavras: 'Por extenso', pomodoro: 'Pomodoro' }]] },
};

$('#btnEditar').onclick = () => {
  estado.editando = !estado.editando;
  $('#editarBarra').hidden = !estado.editando;
  $('#btnEditar').textContent = estado.editando ? '✅' : '✏️';
  renderizar();
};

$('#editarBarra').addEventListener('click', e => {
  const d = e.target.dataset.col;
  if (!d) return;
  if (deitado()) {
    const atual = estado.config.colunasDeitado || 0; // 0 = automático
    let novo = atual + +d;
    if (atual === 0) novo = d > 0 ? 3 : 0;
    estado.config.colunasDeitado = novo < 3 ? 0 : Math.min(10, novo);
  } else {
    estado.config.colunas = Math.min(6, Math.max(2, (estado.config.colunas || 3) + +d));
  }
  salvar();
});

function salvar() {
  renderizar();
  return api('config', { paginas: estado.config.paginas, colunas: estado.config.colunas, colunasDeitado: estado.config.colunasDeitado || 0 })
    .catch(e => aviso(e.message, true));
}

function campoHtml([chave, rotulo, tipo, dica, opcoes], valor) {
  const id = 'f_' + chave;
  if (tipo === 'check') return `<label class="check"><input type="checkbox" id="${id}" ${valor ? 'checked' : ''}> ${esc(rotulo)}</label>`;
  let input;
  if (tipo === 'select' || tipo === 'paginas') {
    const ops = tipo === 'paginas' ? Object.fromEntries(paginas().map(p => [p.nome, p.nome])) : opcoes;
    input = `<select id="${id}">${Object.entries(ops).map(([v, t]) => `<option value="${esc(v)}" ${v === valor ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  } else if (tipo === 'area') {
    input = `<textarea id="${id}" spellcheck="false">${esc(valor)}</textarea>`;
  } else {
    input = `<input id="${id}" value="${esc(valor)}" autocapitalize="off" spellcheck="false">`;
  }
  return `<label>${esc(rotulo)}${input}${dica ? `<span class="dica">${esc(dica)}</span>` : ''}</label>`;
}

function abrirEditor(indice) {
  const botoes = paginas()[estado.pagina].botoes;
  const original = indice == null ? { nome: '', icone: '⭐', cor: '#2563eb', acao: { tipo: 'app' } } : botoes[indice];
  const b = JSON.parse(JSON.stringify(original));

  const desenhar = () => {
    const tipo = TIPOS[b.acao.tipo] || TIPOS.app;
    const c = abrirModal(`<h2>${indice == null ? 'Novo botão' : 'Editar botão'}</h2>
      <div class="linha">
        <label style="flex:3">Nome<input id="f_nome" value="${esc(b.nome)}"></label>
        <label style="flex:1">Ícone<input id="f_icone" value="${esc(b.icone)}" style="text-align:center"></label>
        <label style="flex:1">Cor<input id="f_cor" type="color" value="${esc(b.cor || '#2563eb')}" style="padding:2px;height:44px"></label>
      </div>
      <label>O que ele faz<select id="f_tipo">${Object.entries(TIPOS).map(([k, t]) => `<option value="${k}" ${k === b.acao.tipo ? 'selected' : ''}>${t.nome}</option>`).join('')}</select></label>
      ${tipo.campos.map(cp => campoHtml(cp, b.acao[cp[0]])).join('')}
      <label class="check"><input type="checkbox" id="f_confirmar" ${b.confirmar ? 'checked' : ''}> Pedir confirmação antes</label>
      ${indice == null ? '' : `<div class="linha"><button class="neutro" data-mover="-1">◀ Mover</button><button class="neutro" data-mover="1">Mover ▶</button></div>`}
      <div class="linha">${indice == null ? '' : '<button class="perigo" data-excluir>Excluir</button>'}<button class="neutro" data-cancelar>Cancelar</button><button class="primario" data-salvar>Salvar</button></div>`);

    const coletar = () => {
      b.nome = $('#f_nome').value.trim() || 'Botão';
      b.icone = $('#f_icone').value.trim();
      b.cor = $('#f_cor').value;
      b.confirmar = $('#f_confirmar').checked;
      for (const [chave, , t] of tipo.campos) {
        const el = $('#f_' + chave);
        b.acao[chave] = t === 'check' ? el.checked : el.value;
      }
    };
    $('#f_tipo').onchange = e => { coletar(); b.acao = { tipo: e.target.value }; desenhar(); };
    c.querySelector('[data-cancelar]').onclick = fecharModal;
    c.querySelector('[data-salvar]').onclick = () => {
      coletar();
      if (indice == null) botoes.push(b); else botoes[indice] = b;
      fecharModal(); salvar();
    };
    c.querySelector('[data-excluir]')?.addEventListener('click', async () => {
      if (!(await confirmar('Excluir botão', `Apagar "${b.nome}"?`))) return;
      botoes.splice(indice, 1); salvar();
    });
    c.querySelectorAll('[data-mover]').forEach(m => m.onclick = () => {
      const n = indice + +m.dataset.mover;
      if (n < 0 || n >= botoes.length) return;
      [botoes[indice], botoes[n]] = [botoes[n], botoes[indice]];
      fecharModal(); salvar();
    });
  };
  desenhar();
}

$('#btnPaginaConfig').onclick = () => {
  const ps = paginas();
  const p = ps[estado.pagina];
  const c = abrirModal(`<h2>Página</h2>
    <label>Nome<input id="f_pnome" value="${esc(p.nome)}"></label>
    <div class="linha"><button class="neutro" data-mover="-1">◀ Mover</button><button class="neutro" data-mover="1">Mover ▶</button></div>
    <button class="neutro" data-nova>+ Nova página</button>
    <div class="linha">${ps.length > 1 ? '<button class="perigo" data-excluir>Excluir página</button>' : ''}<button class="primario" data-salvar>Salvar</button></div>`);
  c.querySelector('[data-salvar]').onclick = () => { p.nome = $('#f_pnome').value.trim() || 'Página'; fecharModal(); salvar(); };
  c.querySelector('[data-nova]').onclick = () => {
    ps.push({ nome: 'Nova página', botoes: [] });
    estado.pagina = ps.length - 1; fecharModal(); salvar();
  };
  c.querySelectorAll('[data-mover]').forEach(m => m.onclick = () => {
    const n = estado.pagina + +m.dataset.mover;
    if (n < 0 || n >= ps.length) return;
    [ps[estado.pagina], ps[n]] = [ps[n], ps[estado.pagina]];
    estado.pagina = n; fecharModal(); salvar();
  });
  c.querySelector('[data-excluir]')?.addEventListener('click', async () => {
    if (!(await confirmar('Excluir página', `Apagar "${p.nome}" e todos os botões dela?`))) return;
    ps.splice(estado.pagina, 1); estado.pagina = 0; salvar();
  });
};

// ------------------------------------------------------------ notificações e permissões

const pendentes = () => estado.notifs.filter(n => n.status === 'pendente').sort((a, b) => a.criado - b.criado);
let voltarPara = null;

function abrirPermissoes() {
  if (estado.tela === TELA.permissoes) return;
  const de = estado.tela;
  irParaTela(TELA.permissoes);
  voltarPara = de; // depois que você responder tudo, volta para onde estava
}

function chegouNotif(n) {
  const i = estado.notifs.findIndex(x => x.id === n.id);
  const nova = i < 0;
  n._recebido = nova ? Date.now() : estado.notifs[i]._recebido;
  if (nova) estado.notifs.unshift(n); else estado.notifs[i] = n;

  if (nova && n.status === 'pendente') {
    vibrar([200, 100, 200]);
    if (estado.tela !== TELA.relogio) abrirPermissoes(); // no relógio, o pedido aparece na ilha
  } else if (nova) {
    vibrar(60);
    if (estado.tela !== TELA.notificacoes) {
      estado.naoLidas++;
      if (estado.tela === TELA.relogio) mostrarNaIlha(n); else aviso(`${n.origem}: ${n.titulo}`);
    }
  }
  renderizarListas();
  verSeVolta();
}

function verSeVolta() {
  if (voltarPara == null || pendentes().length) return;
  const destino = voltarPara;
  voltarPara = null;
  setTimeout(() => { if (!pendentes().length && estado.tela === TELA.permissoes) irParaTela(destino); }, 900);
}

const ROTULO = { permitido: 'permitido', negado: 'negado', expirado: 'expirou', 'no-pc': 'respondido no PC' };

function renderizarListas() {
  // notificações (avisos)
  const avisos = estado.notifs.filter(n => !n.perguntar);
  $('#listaNotifs').innerHTML = avisos.length ? avisos.map(n => `<div class="notif">
      <div class="meta"><span>${esc(n.origem)}</span><span>${hora(n.criado)}</span></div>
      <h3>${esc(n.titulo)}</h3>${n.mensagem ? `<p>${esc(n.mensagem)}</p>` : ''}
    </div>`).join('') : '<p class="vazio">Nenhuma notificação.<br>As do PC (Discord, WhatsApp…) e os avisos do Claude aparecem aqui.</p>';

  // permissões
  const pend = pendentes();
  $('#pendentes').innerHTML = pend.length ? pend.map(n => `<div class="pedido" data-id="${n.id}">
      <span class="etiqueta">${esc(n.origem)} · ${hora(n.criado)}</span>
      <h3>${esc(n.titulo)}</h3>
      ${n.mensagem ? `<pre>${esc(n.mensagem)}</pre>` : ''}
      <div class="tempo" data-fim="${(n._recebido || Date.now()) + (n.expira - n.criado)}"></div>
      <div class="linha"><button class="perigo" data-decidir="negar">Negar</button><button class="sucesso" data-decidir="permitir">Permitir</button></div>
      <button class="link" data-decidir="pc">Responder no PC</button>
    </div>`).join('') : '<p class="vazio">Nenhum pedido esperando.<br>Quando o Claude pedir permissão, ela aparece aqui.</p>';
  atualizarContagens();

  const resp = estado.notifs.filter(n => n.perguntar && n.status !== 'pendente');
  $('#tituloRespondidos').hidden = !resp.length;
  $('#respondidos').innerHTML = resp.map(n => `<div class="notif">
      <div class="meta"><span>${esc(n.origem)} · ${hora(n.criado)}</span><span class="st-${n.status}">${ROTULO[n.status] || ''}</span></div>
      <h3>${esc(n.titulo)}</h3>${n.mensagem ? `<p>${esc(n.mensagem)}</p>` : ''}
    </div>`).join('');

  renderizarBadges();
  atualizarIlha();
}

function atualizarContagens() {
  document.querySelectorAll('#pendentes [data-fim]').forEach(el => {
    const s = Math.max(0, Math.round((+el.dataset.fim - Date.now()) / 1000));
    el.textContent = `expira em ${s}s · se não responder, ele pergunta no PC`;
  });
}
setInterval(atualizarContagens, 1000);

function renderizarBadges() {
  const pend = pendentes().length;
  $('#badgePedidos').hidden = !pend; $('#badgePedidos').textContent = pend;
  $('#badgeNotifs').hidden = !estado.naoLidas; $('#badgeNotifs').textContent = estado.naoLidas;
  $('#badgePC').hidden = !estado.atualizacao;
}

$('#pendentes').addEventListener('click', e => {
  const b = e.target.closest('[data-decidir]');
  if (b) decidir(b.closest('[data-id]').dataset.id, b.dataset.decidir);
});

function decidir(id, decisao) {
  vibrar(20);
  const n = estado.notifs.find(x => x.id === id);
  if (n) n.status = { permitir: 'permitido', negar: 'negado', pc: 'no-pc' }[decisao];
  renderizarListas(); verSeVolta();
  api('decidir', { id, decisao }).catch(e => aviso(e.message, true));
}

$('#btnLimparNotifs').onclick = () => api('limpar', { tipo: 'avisos' }).catch(e => aviso(e.message, true));
$('#btnLimparPedidos').onclick = () => api('limpar', { tipo: 'pedidos' }).catch(e => aviso(e.message, true));

// ------------------------------------------------------------ ilha dinâmica (no relógio)
// Pedido de permissão: abre com Permitir/Negar até você responder.
// Notificação: abre por 5 s e depois encolhe mostrando quantas tem.

const ilha = { info: null, ate: 0, timer: null, mostrando: null };

function mostrarNaIlha(n) {
  ilha.info = n; ilha.ate = Date.now() + 5000;
  clearTimeout(ilha.timer);
  ilha.timer = setTimeout(atualizarIlha, 5100);
  atualizarIlha();
}

function atualizarIlha() {
  const el = $('#ilha');
  const pend = pendentes();
  let n = null, pedido = false;
  if (pend.length) { n = pend[0]; pedido = true; }
  else if (ilha.info && Date.now() < ilha.ate) n = ilha.info;

  const visivel = !!n || estado.naoLidas > 0;
  if (!visivel) { el.hidden = true; ilha.mostrando = null; return; }
  if (el.hidden) { el.hidden = false; el.classList.remove('entrando'); void el.offsetWidth; el.classList.add('entrando'); }

  el.classList.toggle('pedido', pedido);
  if (n) {
    $('#ilhaOrigem').textContent = n.origem;
    $('#ilhaTitulo').textContent = n.titulo;
    $('#ilhaMsg').textContent = n.mensagem || '';
    $('#ilhaMsg').hidden = !n.mensagem;
    $('#ilhaBotoes').hidden = !pedido;
    el.dataset.id = n.id;
    el.style.setProperty('--altura', (pedido ? 116 : 62) + (n.mensagem ? 22 : 0) + 'px');
    el.classList.add('cheia');
    ilha.mostrando = n.id;
  } else {
    el.classList.remove('cheia');
    $('#ilhaIcone').textContent = '🔔';
    $('#ilhaResumo').textContent = estado.naoLidas === 1 ? '1 notificação' : `${estado.naoLidas} notificações`;
    ilha.mostrando = null;
  }
  atualizarTempoIlha();
}

function atualizarTempoIlha() {
  const n = estado.notifs.find(x => x.id === ilha.mostrando);
  if (!n) return;
  if (n.status === 'pendente') {
    const fim = (n._recebido || Date.now()) + (n.expira - n.criado);
    $('#ilhaTempo').textContent = Math.max(0, Math.round((fim - Date.now()) / 1000)) + 's';
  } else $('#ilhaTempo').textContent = hora(n.criado);
}
setInterval(atualizarTempoIlha, 1000);

$('#ilha').addEventListener('click', e => {
  e.stopPropagation();
  const b = e.target.closest('[data-ilha]');
  if (b) return decidir($('#ilha').dataset.id, b.dataset.ilha);
  if (!pendentes().length) irParaTela(TELA.notificacoes); // tocar na notificação abre a lista
});
['touchstart', 'touchend', 'mousedown', 'mouseup'].forEach(t => $('#ilha').addEventListener(t, e => e.stopPropagation()));

// ------------------------------------------------------------ tela do PC (estado e atualização)

function renderizarPC() {
  const s = estado.stats, c = estado.config;
  const nome = c?.nomePC || 'PC';
  $('#textoConexao').textContent = !pareado()
    ? 'Nenhum PC conectado. No PC, abra o Stream Deck (iniciar.bat): o QR code aparece na tela.'
    : conexao.online ? `Conectado ao ${nome}.` : `${nome} fora do ar. Confira se o Stream Deck está aberto no PC e se o celular está no mesmo Wi-Fi.`;
  $('#btnEscanear').hidden = PELO_PC;
  $('#btnInstalarApp').hidden = !PELO_PC || !pareado();
  $('#btnDesparear').hidden = !pareado();
  if (c) {
    $('#nomePC').textContent = c.nomePC || 'PC';
    $('#textoVersao').textContent = estado.atualizacao
      ? `Você está na versão ${c.versao}. A versão ${estado.atualizacao.versao} já saiu${estado.atualizacao.notas ? ': ' + estado.atualizacao.notas : '.'}`
      : `Versão ${c.versao}. Está tudo em dia.`;
    $('#btnAtualizar').hidden = !estado.atualizacao;
    if (c.obs && document.activeElement?.closest?.('.cartao') == null) {
      $('#obsHost').value = c.obs.host; $('#obsPorta').value = c.obs.porta;
      $('#obsSenha').placeholder = c.obs.temSenha ? 'senha salva (digite para trocar)' : 'senha do WebSocket';
    }
  }
  if (s) {
    for (const [k, v] of [['Cpu', s.cpu], ['Ram', s.ram]]) {
      $('#barra' + k).style.width = v + '%';
      $('#barra' + k).style.background = v > 85 ? '#ef4444' : v > 60 ? '#facc15' : '#22c55e';
      $('#valor' + k).textContent = v + '%';
    }
    $('#infoPC').textContent = s.ramTotalGB ? `${s.ramTotalGB} GB de RAM` : '';
  }
  renderizarBadges();
}

$('#btnAtualizar').onclick = async () => {
  const nova = estado.atualizacao;
  if (!nova) return;
  if (!(await confirmar(`Atualizar para a versão ${nova.versao}?`, nova.notas || 'O Stream Deck reinicia sozinho no PC.'))) return;
  aviso('Baixando a atualização…');
  try {
    const r = await api('atualizar');
    if (!r.ok) aviso(r.erro || 'Não consegui atualizar', true);
  } catch (e) { aviso(e.message, true); }
};

$('#btnProcurar').onclick = async () => {
  aviso('Procurando atualização…');
  try {
    const r = await api('atualizacao');
    estado.atualizacao = r.nova; renderizarPC();
    aviso(r.erro ? r.erro : r.nova ? `Versão ${r.nova.versao} disponível!` : `Você já está na versão mais nova (${r.atual}).`, !!r.erro);
  } catch (e) { aviso(e.message, true); }
};

$('#btnObs').onclick = async () => {
  aviso('Testando o OBS…');
  try {
    const r = await api('obs', { host: $('#obsHost').value.trim(), porta: $('#obsPorta').value.trim(), senha: $('#obsSenha').value });
    $('#obsSenha').value = '';
    aviso(r.ok ? `✅ OBS ${r.versao} conectado` : r.erro, !r.ok);
  } catch (e) { aviso(e.message, true); }
};

$('#btnRestaurar').onclick = async () => {
  if (!(await confirmar('Carregar as páginas do Command Center?', 'Suas páginas de botões atuais vão ser trocadas pelas do padrão.'))) return;
  try { await api('restaurar-paginas'); estado.pagina = 0; aviso('Páginas carregadas'); irParaTela(TELA.botoes); }
  catch (e) { aviso(e.message, true); }
};

$('#btnDesparear').onclick = async () => {
  if (await confirmar('Desconectar este celular?', 'Para usar de novo, vai precisar escanear o QR code no PC.')) esquecerToken();
};
$('#btnEscanear').onclick = () => escanearQR();
$('#btnDigitar').onclick = async () => {
  const t = await pedirTexto('Endereço do PC', 'Cole o link que aparece embaixo do QR code, na tela do PC.');
  if (t == null) return;
  try { parear(t); aviso('Conectando ao PC…'); } catch (e) { aviso(e.message, true); }
};
// do app aberto pelo PC para o app instalado (abre sem o PC e usa a câmera), já levando a conexão
$('#btnInstalarApp').onclick = () => {
  location.href = `${APP_URL}#pc=${encodeURIComponent(conexao.base)}&t=${encodeURIComponent(estado.token)}`;
};

// ------------------------------------------------------------ modais

let fecharModalAtual = null;
function abrirModal(html) {
  $('#modalCaixa').innerHTML = html;
  $('#modal').hidden = false;
  return $('#modalCaixa');
}
function fecharModal() { $('#modal').hidden = true; $('#modalCaixa').innerHTML = ''; fecharModalAtual?.(); fecharModalAtual = null; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') fecharModal(); });

function confirmar(titulo, texto) {
  return new Promise(resolve => {
    const c = abrirModal(`<h2>${esc(titulo)}</h2><p>${esc(texto)}</p>
      <div class="linha"><button class="neutro" data-r="0">Cancelar</button><button class="primario" data-r="1">Confirmar</button></div>`);
    fecharModalAtual = () => resolve(false);
    c.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { fecharModalAtual = null; fecharModal(); resolve(b.dataset.r === '1'); });
  });
}

function pedirTexto(titulo, dica) {
  return new Promise(resolve => {
    const c = abrirModal(`<h2>${esc(titulo)}</h2><p class="dica">${esc(dica)}</p><textarea id="campoTexto"></textarea>
      <div class="linha"><button class="neutro" data-r="0">Cancelar</button><button class="primario" data-r="1">Enviar</button></div>`);
    fecharModalAtual = () => resolve(null);
    setTimeout(() => $('#campoTexto')?.focus(), 50);
    c.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
      const v = $('#campoTexto').value;
      fecharModalAtual = null; fecharModal(); resolve(b.dataset.r === '1' ? v : null);
    });
  });
}

function mostrarTexto(titulo, texto, copiavel) {
  const c = abrirModal(`<h2>${esc(titulo)}</h2><pre>${esc(texto) || '<i>(vazio)</i>'}</pre>
    <div class="linha">${copiavel ? '<button class="primario" data-copiar>Copiar no celular</button>' : ''}<button class="neutro" data-fechar>Fechar</button></div>`);
  c.querySelector('[data-fechar]').onclick = fecharModal;
  const bc = c.querySelector('[data-copiar]');
  if (bc) bc.onclick = () => { copiar(texto); aviso('Copiado'); };
}

function copiar(texto) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(texto).catch(() => copiarAntigo(texto));
  copiarAntigo(texto);
}
function copiarAntigo(texto) {
  const t = document.createElement('textarea');
  t.value = texto; t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.append(t); t.select();
  try { document.execCommand('copy'); } catch {}
  t.remove();
}

let tempoAviso;
function aviso(texto, erro) {
  const a = $('#aviso');
  a.textContent = texto; a.className = erro ? 'erro' : ''; a.hidden = false;
  clearTimeout(tempoAviso);
  tempoAviso = setTimeout(() => a.hidden = true, erro ? 4000 : 2200);
}

// ------------------------------------------------------------ tela do relógio

const ESTILOS = ['lcd', 'cores', 'grande', 'digital', 'minimal', 'analogico', 'palavras', 'pomodoro'];
const COM_DATA_PROPRIA = ['lcd', 'cores', 'grande', 'pomodoro'];
let estilo = ESTILOS.includes(ler('sd_estilo')) ? ler('sd_estilo') : 'lcd';
const SEMANA_CURTA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
const diaOuNoite = d => (d.getHours() >= 6 && d.getHours() < 18) ? '☀️ dia' : '🌙 noite';
const dataExtenso = d => d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase());
const dois = n => String(n).padStart(2, '0');

const NUM = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
  'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta'];
const HORA = ['', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze'];
function minutosPorExtenso(m) { return m < 20 ? NUM[m] : DEZ[Math.floor(m / 10)] + (m % 10 ? ' e ' + NUM[m % 10] : ''); }
function horaPorExtenso(d) {
  const h = d.getHours(), m = d.getMinutes();
  let verbo, nome;
  if (h === 0) { verbo = 'É'; nome = 'meia-noite'; }
  else if (h === 12) { verbo = 'É'; nome = 'meio-dia'; }
  else { const h12 = h % 12; verbo = h12 === 1 ? 'É' : 'São'; nome = HORA[h12]; }
  const periodo = h === 0 || h === 12 ? '' : h < 6 ? 'da madrugada' : h < 12 ? 'da manhã' : h < 19 ? 'da tarde' : 'da noite';
  return `${verbo} <b>${nome}</b>${m ? ` e <b>${minutosPorExtenso(m)}</b>` : ' em ponto'}<small style="display:block;font-size:.45em;color:#52525b;margin-top:8px">${periodo}</small>`;
}

const pomodoro = { fase: 'foco', restante: 25 * 60, fim: null };
const DURACAO = { foco: 25 * 60, pausa: 5 * 60 };

const RELOGIOS = {
  // estilo relógio digital de LCD (tipo Nixon Regulus)
  lcd: {
    montar: el => el.innerHTML = `<div class="rel-lcd">
      <div class="lcd-linha lcd-hora"><span class="lcd-7"><i>88:88</i><b data-hm></b></span><span class="lcd-7 lcd-seg"><i>88</i><b data-s></b></span></div>
      <div class="lcd-linha lcd-meio"><span class="lcd-7"><i>88-88</i><b data-dm></b></span><span class="lcd-14 lcd-rotulo" data-turno></span><span class="lcd-7"><i>8888</i><b data-ano></b></span></div>
      <div class="lcd-linha lcd-dia"><span class="lcd-14"><i>~~~</i><b data-sem></b></span><span class="lcd-7"><i>88</i><b data-d></b></span></div>
    </div>`,
    atualizar: (el, d) => {
      const q = s => el.querySelector(s);
      q('[data-hm]').textContent = `${dois(d.getHours())}:${dois(d.getMinutes())}`;
      q('[data-s]').textContent = dois(d.getSeconds());
      q('[data-dm]').textContent = `${dois(d.getDate())}-${dois(d.getMonth() + 1)}`;
      q('[data-ano]').textContent = d.getFullYear();
      q('[data-sem]').textContent = SEMANA_CURTA[d.getDay()];
      q('[data-d]').textContent = dois(d.getDate());
      q('[data-turno]').textContent = d.getHours() >= 6 && d.getHours() < 18 ? 'DIA' : 'NOITE';
    },
  },
  // hora branca e minuto laranja, lado a lado
  cores: {
    montar: el => el.innerHTML = `<div class="rel-cores">
      <div class="cores-lado"><div data-turno></div><div data-sem></div><div data-data></div></div>
      <div class="cores-hora"><span data-h></span><span data-m></span></div>
    </div>`,
    atualizar: (el, d) => {
      const q = s => el.querySelector(s);
      q('[data-h]').textContent = dois(d.getHours());
      q('[data-m]').textContent = dois(d.getMinutes());
      q('[data-turno]').textContent = diaOuNoite(d);
      q('[data-sem]').textContent = d.toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/^./, c => c.toUpperCase()) + ',';
      q('[data-data]').textContent = d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    },
  },
  // números enormes e finos: horas • minutos • segundos
  grande: {
    montar: el => el.innerHTML = `<div class="rel-grande">
      <div class="grande-numeros"><span data-h></span><i class="pontos"></i><span data-m></span><i class="pontos"></i><span data-s></span></div>
      <div class="grande-base"><b data-dm></b><b data-sem></b><span data-turno></span></div>
    </div>`,
    atualizar: (el, d) => {
      const q = s => el.querySelector(s);
      q('[data-h]').textContent = dois(d.getHours());
      q('[data-m]').textContent = dois(d.getMinutes());
      q('[data-s]').textContent = dois(d.getSeconds());
      q('[data-dm]').textContent = `${dois(d.getDate())}.${dois(d.getMonth() + 1)}.${d.getFullYear()}`;
      q('[data-sem]').textContent = d.toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/^./, c => c.toUpperCase());
      q('[data-turno]').textContent = diaOuNoite(d);
    },
  },
  digital: {
    montar: el => el.innerHTML = '<div class="rel-digital"><span data-hm></span><small data-s></small></div>',
    atualizar: (el, d) => { el.querySelector('[data-hm]').textContent = `${dois(d.getHours())}:${dois(d.getMinutes())}`; el.querySelector('[data-s]').textContent = dois(d.getSeconds()); },
  },
  minimal: {
    montar: el => el.innerHTML = '<div class="rel-minimal" data-hm></div>',
    atualizar: (el, d) => el.querySelector('[data-hm]').textContent = `${dois(d.getHours())}:${dois(d.getMinutes())}`,
  },
  analogico: {
    montar: el => {
      let marcas = '';
      for (let i = 0; i < 60; i++) {
        const grande = i % 5 === 0;
        marcas += `<line x1="0" y1="${grande ? -84 : -88}" x2="0" y2="-92" stroke="${grande ? '#71717a' : '#27272a'}" stroke-width="${grande ? 3 : 1}" transform="rotate(${i * 6})"/>`;
      }
      el.innerHTML = `<div class="rel-analogico"><svg viewBox="-100 -100 200 200">
        <circle r="96" fill="none" stroke="#18181b" stroke-width="2"/>${marcas}
        <line data-h x1="0" y1="10" x2="0" y2="-48" stroke="#d4d4d8" stroke-width="6" stroke-linecap="round"/>
        <line data-m x1="0" y1="12" x2="0" y2="-74" stroke="#a1a1aa" stroke-width="4" stroke-linecap="round"/>
        <line data-s x1="0" y1="16" x2="0" y2="-82" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round"/>
        <circle r="4" fill="#ef4444"/></svg></div>`;
    },
    atualizar: (el, d) => {
      const s = d.getSeconds(), m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
      el.querySelector('[data-h]').setAttribute('transform', `rotate(${h * 30})`);
      el.querySelector('[data-m]').setAttribute('transform', `rotate(${m * 6})`);
      el.querySelector('[data-s]').setAttribute('transform', `rotate(${s * 6})`);
    },
  },
  palavras: {
    montar: el => el.innerHTML = '<div class="rel-palavras" data-t></div>',
    atualizar: (el, d) => { const h = horaPorExtenso(d); const t = el.querySelector('[data-t]'); if (t.innerHTML !== h) t.innerHTML = h; },
  },
  pomodoro: {
    montar: el => {
      el.innerHTML = `<div class="rel-pomodoro"><div class="fase" data-fase></div><div class="tempo" data-tempo></div>
        <div class="linha"><button data-p="play"></button><button data-p="pular">Pular</button><button data-p="zerar">Zerar</button></div></div>`;
      el.querySelectorAll('[data-p]').forEach(b => b.onclick = e => {
        e.stopPropagation(); vibrar(10);
        const acao = b.dataset.p;
        if (acao === 'play') {
          if (pomodoro.fim) { pomodoro.restante = Math.max(0, Math.round((pomodoro.fim - Date.now()) / 1000)); pomodoro.fim = null; }
          else pomodoro.fim = Date.now() + pomodoro.restante * 1000;
        } else if (acao === 'pular') trocarFase();
        else { pomodoro.fim = null; pomodoro.restante = DURACAO[pomodoro.fase]; }
        RELOGIOS.pomodoro.atualizar(el);
      });
    },
    atualizar: el => {
      let r = pomodoro.restante;
      if (pomodoro.fim) {
        r = Math.max(0, Math.round((pomodoro.fim - Date.now()) / 1000));
        if (r === 0) { vibrar([400, 200, 400, 200, 400]); trocarFase(); r = pomodoro.restante; }
      }
      const f = el.querySelector('[data-fase]');
      f.textContent = pomodoro.fase === 'foco' ? 'Foco' : 'Pausa';
      f.classList.toggle('pausa', pomodoro.fase === 'pausa');
      el.querySelector('[data-tempo]').textContent = `${dois(Math.floor(r / 60))}:${dois(r % 60)}`;
      el.querySelector('[data-p="play"]').textContent = pomodoro.fim ? 'Pausar' : 'Iniciar';
    },
  },
};

function trocarFase() {
  pomodoro.fase = pomodoro.fase === 'foco' ? 'pausa' : 'foco';
  pomodoro.restante = DURACAO[pomodoro.fase];
  pomodoro.fim = null;
}

function trocarEstilo(novo) {
  estilo = novo; guardar('sd_estilo', novo);
  RELOGIOS[estilo].montar($('#aodRelogio'));
  atualizarRelogio();
}

function atualizarRelogio() {
  const d = new Date();
  RELOGIOS[estilo].atualizar($('#aodRelogio'), d);
  $('#aodData').textContent = COM_DATA_PROPRIA.includes(estilo) ? '' : dataExtenso(d);
  const s = estado.stats;
  const pend = pendentes().length;
  $('#aodInfo').innerHTML = [
    COM_DATA_PROPRIA.includes(estilo) ? '' : diaOuNoite(d),
    s ? `CPU ${s.cpu}% · RAM ${s.ram}%` : '',
    pend ? `<span class="alerta">🛡️ ${pend}</span>` : '',
    estado.naoLidas ? `<span class="alerta">🔔 ${estado.naoLidas}</span>` : '',
    conexao.online ? '' : (pareado() ? '⚠️ PC desconectado' : ''),
  ].filter(Boolean).join(' · ');
}
setInterval(atualizarRelogio, 1000);

// move o relógio um pouquinho a cada minuto para não marcar a tela (burn-in)
setInterval(() => {
  $('#aodConteudo').style.transform = `translate(${Math.round(Math.random() * 30 - 15)}px, ${Math.round(Math.random() * 40 - 20)}px)`;
}, 60000);

// Arraste para cima: próximo relógio. Para baixo: o anterior. Um toque só acorda a barra de baixo.
(() => {
  const tela = $('#telaRelogio');
  let x0 = null, y0 = null;
  const inicio = (x, y, alvo) => { if (alvo.closest('button')) return; x0 = x; y0 = y; };
  const fim = (x, y) => {
    if (y0 == null) return;
    const dx = x - x0, dy = y - y0;
    x0 = y0 = null;
    menuApagado(true);
    manterTelaLigada(true);
    if (Math.abs(dy) < 50 || Math.abs(dy) < Math.abs(dx) * 1.2) return; // foi toque ou deslize para o lado
    vibrar(8);
    const passo = dy < 0 ? 1 : -1;
    trocarEstilo(ESTILOS[(ESTILOS.indexOf(estilo) + passo + ESTILOS.length) % ESTILOS.length]);
  };
  tela.addEventListener('touchstart', e => inicio(e.touches[0].clientX, e.touches[0].clientY, e.target), { passive: true });
  tela.addEventListener('touchend', e => fim(e.changedTouches[0].clientX, e.changedTouches[0].clientY));
  tela.addEventListener('mousedown', e => inicio(e.clientX, e.clientY, e.target));
  tela.addEventListener('mouseup', e => fim(e.clientX, e.clientY));
})();

// tela cheia trava o celular deitado (toque de novo para sair)
$('#btnTelaCheia').onclick = async () => {
  if (document.fullscreenElement) {
    try { screen.orientation?.unlock?.(); } catch {}
    return document.exitFullscreen?.().catch(() => {});
  }
  try {
    await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    await screen.orientation?.lock?.('landscape');
  } catch {}
};

let trava = null;
async function manterTelaLigada(ligar) {
  const video = $('#acordado');
  if (ligar) {
    try {
      if ('wakeLock' in navigator) { trava ??= await navigator.wakeLock.request('screen'); return; }
    } catch {}
    // sem Wake Lock (página em http): um vídeo mudo em loop mantém a tela acesa
    video.play().catch(() => {});
  } else {
    trava?.release().catch(() => {}); trava = null;
    video.pause();
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && estado.tela === TELA.relogio) { trava = null; manterTelaLigada(true); }
});
// o navegador só deixa o vídeo tocar depois do primeiro toque
document.addEventListener('pointerdown', () => { if (estado.tela === TELA.relogio) manterTelaLigada(true); }, { once: true });

// ------------------------------------------------------------ início

trocarEstilo(estilo);
setTimeout(() => $('#aodDica').style.opacity = 0, 5000);
estado.tela = -1; mudouTela(TELA.relogio); // sempre abre no relógio
renderizar(); renderizarPC();
conectar();
if (!PELO_PC && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
