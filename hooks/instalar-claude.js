#!/usr/bin/env node
'use strict';
// Liga (ou desliga) o Stream Deck nas configurações do Claude Code do seu usuário.
//   node hooks/instalar-claude.js           -> instala
//   node hooks/instalar-claude.js --remover -> remove

const fs = require('fs');
const path = require('path');
const os = require('os');

const arquivo = path.join(os.homedir(), '.claude', 'settings.json');
const script = path.join(__dirname, 'claude-stream-deck.js').replace(/\\/g, '/');
const comando = `node "${script}"`;
const remover = process.argv.includes('--remover');

let s = {};
if (fs.existsSync(arquivo)) {
  const texto = fs.readFileSync(arquivo, 'utf8');
  try { s = JSON.parse(texto); } catch {
    console.error(`Não consegui ler ${arquivo} (JSON inválido). Corrija o arquivo e rode de novo.`);
    process.exit(1);
  }
  fs.writeFileSync(arquivo + '.backup', texto);
} else {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
}

s.hooks ??= {};
const nosso = g => (g.hooks || []).some(h => String(h.command || '').includes('claude-stream-deck.js'));

for (const evento of ['PermissionRequest', 'Notification', 'Stop']) {
  s.hooks[evento] = (s.hooks[evento] || []).filter(g => !nosso(g));
  if (!remover) {
    s.hooks[evento].push({
      matcher: '*',
      hooks: [{ type: 'command', command: comando, timeout: evento === 'PermissionRequest' ? 180 : 10 }],
    });
  }
  if (!s.hooks[evento].length) delete s.hooks[evento];
}
if (!Object.keys(s.hooks).length) delete s.hooks;

fs.writeFileSync(arquivo, JSON.stringify(s, null, 2));
console.log(remover
  ? `✅ Stream Deck removido do Claude Code (${arquivo}).`
  : `✅ Pronto! Os pedidos de permissão do Claude Code vão aparecer no celular.\n   Configuração salva em ${arquivo} (backup em settings.json.backup).\n   Reinicie o Claude Code para valer.`);
