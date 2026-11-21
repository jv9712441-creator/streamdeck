#!/usr/bin/env node
'use strict';
// Hook do Claude Code: manda pedidos de permissão e avisos para o Stream Deck no celular.
// Se o celular não responder a tempo (ou o servidor estiver fechado), o Claude pergunta no PC como sempre.

const fs = require('fs');
const path = require('path');
const http = require('http');

let cfg;
try { cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8')); }
catch { process.exit(0); } // Stream Deck nunca foi iniciado: não atrapalha o Claude

let entrada = '';
process.stdin.on('data', d => entrada += d);
process.stdin.on('end', principal);

function principal() {
  let e = {};
  try { e = JSON.parse(entrada); } catch {}
  const projeto = e.cwd ? path.basename(e.cwd) : '';
  const rodape = projeto ? `\n\n📂 ${projeto}` : '';

  switch (e.hook_event_name) {
    case 'PermissionRequest': {
      const { titulo, mensagem } = descrever(e.tool_name || '', e.tool_input || {});
      const tempo = cfg.tempoRespostaPermissao || 60;
      return enviar({ titulo, mensagem: mensagem + rodape, origem: 'Claude Code', perguntar: true, esperar: true, tempo }, tempo + 10, r => {
        if (r?.decisao === 'permitido')
          return sair({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } });
        if (r?.decisao === 'negado')
          return sair({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: 'Negado pelo usuário no Stream Deck.' } } });
        process.exit(0); // expirou ou "responder no PC": segue o fluxo normal
      });
    }
    case 'Notification': {
      const tipo = e.notification_type || '';
      if (tipo === 'permission_prompt' || tipo === 'idle_prompt') return process.exit(0); // já cobertos
      return enviar({ titulo: e.title || 'Claude Code', mensagem: (e.message || '') + rodape, origem: 'Claude Code' }, 5, () => process.exit(0));
    }
    case 'Stop':
      return enviar({ titulo: 'Claude terminou', mensagem: projeto ? `Tarefa concluída em ${projeto}` : 'Tarefa concluída', origem: 'Claude Code' }, 5, () => process.exit(0));
    default:
      process.exit(0);
  }
}

function descrever(ferramenta, i) {
  const curto = (s, n = 1500) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; };
  switch (ferramenta) {
    case 'Bash': return { titulo: 'Claude quer rodar um comando', mensagem: curto(i.command) + (i.description ? `\n\n${i.description}` : '') };
    case 'PowerShell': return { titulo: 'Claude quer rodar um comando', mensagem: curto(i.command) };
    case 'Write': return { titulo: 'Claude quer criar um arquivo', mensagem: i.file_path || '' };
    case 'Edit': case 'MultiEdit': return { titulo: 'Claude quer editar um arquivo', mensagem: i.file_path || '' };
    case 'NotebookEdit': return { titulo: 'Claude quer editar um notebook', mensagem: i.notebook_path || '' };
    case 'Read': return { titulo: 'Claude quer ler um arquivo', mensagem: i.file_path || '' };
    case 'WebFetch': return { titulo: 'Claude quer acessar um site', mensagem: i.url || '' };
    case 'WebSearch': return { titulo: 'Claude quer pesquisar na web', mensagem: i.query || '' };
    default: return { titulo: `Claude quer usar ${ferramenta.replace(/^mcp__/, '').replace(/__/g, ' › ')}`, mensagem: curto(JSON.stringify(i, null, 2)) };
  }
}

function enviar(dados, segundos, depois) {
  const corpo = Buffer.from(JSON.stringify(dados));
  const req = http.request({
    host: '127.0.0.1', port: cfg.porta || 8765, path: '/api/notificar', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': corpo.length, 'x-token': cfg.token },
  }, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => { try { depois(JSON.parse(d)); } catch { depois(null); } });
  });
  req.setTimeout(segundos * 1000, () => req.destroy());
  req.on('error', () => depois(null));
  req.end(corpo);
}

function sair(obj) {
  process.stdout.write(JSON.stringify(obj));
  process.exit(0);
}
