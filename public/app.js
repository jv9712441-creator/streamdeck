'use strict';
// Stream Deck — interface do celular

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const guardar = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const ler = k => { try { return localStorage.getItem(k); } catch { return null; } };
const vibrar = p => { try { navigator.vibrate?.(p); } catch {} };

const estado = { token: null, config: null, notifs: [], stats: null, pagina: +(ler('sd_pagina') || 0), editando: false, naoLidas: 0 };

// ------------------------------------------------------------ pareamento

(() => {
  const u = new URL(location.href);
  const t = u.searchParams.get('t');
  if (t) { guardar('sd_token', t); u.searchParams.delete('t'); history.replaceState(null, '', u.pathname); }
  estado.token = ler('sd_token');
})();

$('#btnSalvarToken').onclick = () => {
  const t = $('#tokenManual').value.trim();
  if (!t) return;
  estado.token = t; guardar('sd_token', t); conectar();
};

function esquecerToken() {
  estado.token = null; guardar('sd_token', null);
  fonte?.close();
  $('#parear').hidden = false;
}

// ------------------------------------------------------------ comunicação com o PC

async function api(rota, corpo) {
  const r = await fetch('/api/' + rota, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-token': estado.token },
    body: JSON.stringify(corpo || {}),
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { esquecerToken(); throw new Error(d.erro || 'Token inválido'); }
  if (!r.ok) throw new Error(d.erro || 'Erro ' + r.status);
  return d;
}

let fonte;
function conectar() {
  if (!estado.token) { $('#parear').hidden = false; return; }
  $('#parear').hidden = true;
  fonte?.close();
  fonte = new EventSource('/api/eventos?t=' + encodeURIComponent(estado.token));
  fonte.onopen = () => $('#status').classList.add('on');
  fonte.onerror = () => {
    $('#status').classList.remove('on');
    fetch('/api/ping', { headers: { 'x-token': estado.token } }).then(r => { if (r.status === 401) esquecerToken(); }).catch(() => {});
  };
  fonte.addEventListener('estado', e => {
    const d = JSON.parse(e.data);
    // o PC foi atualizado: recarrega para pegar a tela nova
    if (estado.versaoCarregada && d.config.versao !== estado.versaoCarregada) return location.reload();
    estado.versaoCarregada = d.config.versao;
    estado.config = d.config; estado.notifs = d.notifs; estado.stats = d.stats;
    mostrarAtualizacao(d.atualizacao);
    renderizar(); renderizarUso(); renderizarNotifs(); proximoPedido();
  });
  fonte.addEventListener('config', e => { estado.config = JSON.parse(e.data); renderizar(); });
  fonte.addEventListener('stats', e => { estado.stats = JSON.parse(e.data); renderizarUso(); });
  fonte.addEventListener('notif', e => chegouNotif(JSON.parse(e.data)));
  fonte.addEventListener('atualizacao', e => mostrarAtualizacao(JSON.parse(e.data)));
  fonte.addEventListener('reiniciando', () => aviso('Atualizado! Reiniciando o Stream Deck…'));
}

// ------------------------------------------------------------ grade de botões

const paginas = () => estado.config?.paginas || [];

function renderizar() {
  if (!estado.config) return;
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
  const pag = ps[estado.pagina];
  (pag?.botoes || []).forEach((b, i) => {
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

// Tamanho dos botões: em pé usa o número de colunas escolhido;
// deitado escolhe sozinho as colunas para tudo caber na tela sem rolar (ou usa o que você fixar).
const deitado = () => innerWidth > innerHeight;
function ajustarGrade() {
  const grade = $('#grade');
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
addEventListener('resize', () => estado.config && ajustarGrade());

function irPagina(i) {
  estado.pagina = i; guardar('sd_pagina', i); vibrar(8); renderizar();
}

// deslizar para o lado troca de página
(() => {
  let x0 = null, y0 = null;
  const g = $('#grade');
  g.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  g.addEventListener('touchend', e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) {
      const n = estado.pagina + (dx < 0 ? 1 : -1);
      if (n >= 0 && n < paginas().length) irPagina(n);
    }
  });
})();

async function apertar(b, el) {
  vibrar(12);
  const a = b.acao || {};
  if (b.confirmar && !(await confirmar(`${b.icone || ''} ${b.nome}`, 'Tem certeza?'))) return;

  if (a.tipo === 'pagina') { const i = paginas().findIndex(p => p.nome === a.pagina); if (i >= 0) irPagina(i); return; }
  if (a.tipo === 'relogio') { abrirAOD(a.estilo); return; }

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
    if (r.saida) mostrarTexto(b.nome, r.saida, false);
    if (r.texto != null) mostrarTexto('Clipboard do PC', r.texto, true);
  } catch (e) {
    marcar(el, false); aviso(e.message, true);
  } finally {
    el.classList.remove('rodando');
  }
}

function marcar(el, ok) {
  el.classList.add(ok ? 'ok' : 'erro');
  if (!ok) vibrar([40, 60, 40]);
  setTimeout(() => el.classList.remove('ok', 'erro'), 700);
}

function renderizarUso() {
  const s = estado.stats;
  $('#uso').textContent = s ? `CPU ${s.cpu}% · RAM ${s.ram}%` : '';
}

// ------------------------------------------------------------ atualizações

let novaVersao = null;
function mostrarAtualizacao(nova) {
  novaVersao = nova;
  $('#atualizar').hidden = !nova;
  if (nova) $('#atualizar').textContent = `⬆️ Versão ${nova.versao} disponível. Toque para atualizar`;
  $('#btnVersao').textContent = 'v' + (estado.config?.versao || '?');
}

$('#atualizar').onclick = async () => {
  if (!novaVersao) return;
  if (!(await confirmar(`Atualizar para a versão ${novaVersao.versao}?`, novaVersao.notas || 'O Stream Deck reinicia sozinho no PC.'))) return;
  aviso('Baixando a atualização…');
  try {
    const r = await api('atualizar');
    if (!r.ok) aviso(r.erro || 'Não consegui atualizar', true);
  } catch (e) { aviso(e.message, true); }
};

$('#btnVersao').onclick = async () => {
  aviso('Procurando atualização…');
  try {
    const r = await api('atualizacao');
    mostrarAtualizacao(r.nova);
    aviso(r.erro ? r.erro : r.nova ? `Versão ${r.nova.versao} disponível!` : `Você já está na versão mais nova (${r.atual}).`, !!r.erro);
  } catch (e) { aviso(e.message, true); }
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

// ------------------------------------------------------------ edição de botões e páginas

const TIPOS = {
  app: { nome: 'Abrir app ou site', campos: [
    ['caminho', 'Programa, arquivo ou site', 'texto', 'Ex.: notepad, chrome, https://youtube.com, C:\\Jogos\\jogo.exe, spotify:'],
    ['argumentos', 'Argumentos (opcional)', 'texto', '']] },
  comando: { nome: 'Rodar comando', campos: [
    ['comando', 'Comando', 'area', 'Ex.: Get-Date, ipconfig, shutdown /r /t 0'],
    ['shell', 'Rodar no', 'select', '', { powershell: 'PowerShell', cmd: 'Prompt (cmd)' }],
    ['mostrarSaida', 'Mostrar o resultado no celular', 'check']] },
  atalho: { nome: 'Atalho de teclado', campos: [
    ['teclas', 'Teclas', 'texto', 'Ex.: ctrl+shift+esc · win+d · alt+tab · f5 · playpause · proxima · anterior · volumemais · volumemenos · mudo']] },
  'texto-pc': { nome: 'Enviar texto pro PC', campos: [['colar', 'Colar sozinho (Ctrl+V) depois de enviar', 'check']] },
  'clipboard-pc': { nome: 'Pegar clipboard do PC', campos: [] },
  pagina: { nome: 'Ir para outra página', campos: [['pagina', 'Página', 'paginas']] },
  relogio: { nome: 'Modo relógio', campos: [['estilo', 'Estilo', 'select', '',
    { digital: 'Digital', minimal: 'Minimalista', analogico: 'Analógico', palavras: 'Por extenso', pomodoro: 'Pomodoro' }]] },
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
  return api('config', { paginas: estado.config.paginas, colunas: estado.config.colunas, colunasDeitado: estado.config.colunasDeitado || 0 }).catch(e => aviso(e.message, true));
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

function chegouNotif(n) {
  const i = estado.notifs.findIndex(x => x.id === n.id);
  const nova = i < 0;
  n._recebido = nova ? Date.now() : estado.notifs[i]._recebido;
  if (nova) estado.notifs.unshift(n); else estado.notifs[i] = n;

  if (nova) {
    if (n.status === 'pendente') vibrar([200, 100, 200]);
    else {
      vibrar(60);
      aviso(`${n.origem}: ${n.titulo}`);
      if ($('#painelNotifs').hidden) estado.naoLidas++;
    }
  }
  renderizarNotifs();
  proximoPedido();
}

function renderizarNotifs() {
  const pend = estado.notifs.filter(n => n.status === 'pendente').length;
  const total = pend + estado.naoLidas;
  $('#contador').hidden = !total;
  $('#contador').textContent = total;

  const ROTULO = { pendente: 'aguardando', permitido: 'permitido', negado: 'negado', expirado: 'expirou', 'no-pc': 'respondido no PC', info: '' };
  const lista = $('#listaNotifs');
  if (!estado.notifs.length) { lista.innerHTML = '<p class="vazio">Nada por aqui.</p>'; return; }
  lista.innerHTML = estado.notifs.map(n => `<div class="notif">
      <div class="meta"><span>${esc(n.origem)} · ${new Date(n.criado).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      <span class="st-${n.status}">${ROTULO[n.status] || ''}</span></div>
      <h3>${esc(n.titulo)}</h3>${n.mensagem ? `<p>${esc(n.mensagem)}</p>` : ''}
      ${n.status === 'pendente' ? `<div class="linha"><button class="perigo" data-decidir="negar" data-id="${n.id}">Negar</button><button class="sucesso" data-decidir="permitir" data-id="${n.id}">Permitir</button></div>` : ''}
    </div>`).join('');
}

$('#listaNotifs').addEventListener('click', e => {
  const b = e.target.closest('[data-decidir]');
  if (b) decidir(b.dataset.id, b.dataset.decidir);
});

$('#btnNotifs').onclick = () => { $('#painelNotifs').hidden = false; estado.naoLidas = 0; renderizarNotifs(); };
$('#painelNotifs [data-fechar]').onclick = () => { $('#painelNotifs').hidden = true; };
$('#btnLimpar').onclick = () => api('limpar').catch(e => aviso(e.message, true));

let pedidoAtual = null, relogioPedido = null;
function proximoPedido() {
  const pendentes = estado.notifs.filter(n => n.status === 'pendente').sort((a, b) => a.criado - b.criado);
  const n = pendentes[0];
  if (!n) { $('#pedido').hidden = true; pedidoAtual = null; clearInterval(relogioPedido); return; }
  if (pedidoAtual === n.id) return;
  pedidoAtual = n.id;
  $('#pedidoOrigem').textContent = n.origem;
  $('#pedidoTitulo').textContent = n.titulo;
  $('#pedidoMensagem').textContent = n.mensagem;
  $('#pedidoMensagem').hidden = !n.mensagem;
  $('#pedido').hidden = false;
  clearInterval(relogioPedido);
  const fim = (n._recebido || Date.now()) + (n.expira - n.criado);
  const tick = () => {
    const s = Math.max(0, Math.round((fim - Date.now()) / 1000));
    $('#pedidoTempo').textContent = `${pendentes.length > 1 ? `${pendentes.length} pedidos na fila · ` : ''}expira em ${s}s`;
  };
  tick(); relogioPedido = setInterval(tick, 1000);
}

function decidir(id, decisao) {
  vibrar(20);
  const n = estado.notifs.find(x => x.id === id);
  if (n) n.status = { permitir: 'permitido', negar: 'negado', pc: 'no-pc' }[decisao];
  renderizarNotifs(); proximoPedido();
  api('decidir', { id, decisao }).catch(e => aviso(e.message, true));
}

$('#btnPermitir').onclick = () => pedidoAtual && decidir(pedidoAtual, 'permitir');
$('#btnNegar').onclick = () => pedidoAtual && decidir(pedidoAtual, 'negar');
$('#btnNoPC').onclick = () => pedidoAtual && decidir(pedidoAtual, 'pc');

// ------------------------------------------------------------ modo relógio (Always On Display)

const ESTILOS = ['digital', 'minimal', 'analogico', 'palavras', 'pomodoro'];
const aod = { estilo: ler('sd_estilo') || 'digital', tick: null, mover: null, trava: null };
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
  const periodo = h === 0 || h === 12 ? '' : h < 6 ? ' da madrugada' : h < 12 ? ' da manhã' : h < 19 ? ' da tarde' : ' da noite';
  return `${verbo} <b>${nome}</b>${m ? ` e <b>${minutosPorExtenso(m)}</b>` : ' em ponto'}<small style="display:block;font-size:.45em;color:#52525b;margin-top:8px">${periodo.trim()}</small>`;
}

const pomodoro = { fase: 'foco', restante: 25 * 60, fim: null };
const DURACAO = { foco: 25 * 60, pausa: 5 * 60 };

const RELOGIOS = {
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

function montarRelogio() {
  const el = $('#aodRelogio');
  RELOGIOS[aod.estilo].montar(el);
  atualizarAOD();
}

function atualizarAOD() {
  const d = new Date();
  RELOGIOS[aod.estilo].atualizar($('#aodRelogio'), d);
  $('#aodData').textContent = aod.estilo === 'pomodoro' ? '' : d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase());
  const s = estado.stats;
  const pend = estado.notifs.filter(n => n.status === 'pendente').length;
  const avisos = pend + estado.naoLidas;
  $('#aodInfo').innerHTML = [
    s ? `CPU ${s.cpu}% · RAM ${s.ram}%` : '',
    avisos ? `<span class="alerta">🔔 ${avisos}</span>` : '',
    $('#status').classList.contains('on') ? '' : '⚠️ PC desconectado',
  ].filter(Boolean).join(' · ');
}

async function abrirAOD(estilo) {
  if (estilo && RELOGIOS[estilo]) aod.estilo = estilo;
  $('#aod').hidden = false;
  try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch {}
  manterTelaLigada(true);
  montarRelogio();
  clearInterval(aod.tick); clearInterval(aod.mover);
  aod.tick = setInterval(atualizarAOD, 1000);
  // move o conteúdo um pouquinho a cada minuto para não marcar a tela (burn-in)
  aod.mover = setInterval(() => {
    $('#aodConteudo').style.transform = `translate(${Math.round(Math.random() * 30 - 15)}px, ${Math.round(Math.random() * 40 - 20)}px)`;
  }, 60000);
  $('#aodDica').style.opacity = 1;
  setTimeout(() => $('#aodDica').style.opacity = 0, 3000);
}

function fecharAOD() {
  $('#aod').hidden = true;
  clearInterval(aod.tick); clearInterval(aod.mover);
  manterTelaLigada(false);
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}

$('#btnRelogio').onclick = () => abrirAOD();
$('#aodSair').onclick = e => { e.stopPropagation(); fecharAOD(); };
$('#aod').addEventListener('click', () => {
  aod.estilo = ESTILOS[(ESTILOS.indexOf(aod.estilo) + 1) % ESTILOS.length];
  guardar('sd_estilo', aod.estilo);
  vibrar(8);
  montarRelogio();
});

async function manterTelaLigada(ligar) {
  const video = $('#acordado');
  if (ligar) {
    try {
      if ('wakeLock' in navigator) { aod.trava = await navigator.wakeLock.request('screen'); return; }
    } catch {}
    // sem Wake Lock (página em http): um vídeo mudo em loop mantém a tela acesa
    video.play().catch(() => {});
  } else {
    aod.trava?.release().catch(() => {}); aod.trava = null;
    video.pause();
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !$('#aod').hidden) manterTelaLigada(true);
});

// ------------------------------------------------------------ início

conectar();
