// Gera manifesto.json (versão + hash de cada arquivo) antes de publicar uma atualização.
// Rodar na raiz do repositório: node publicar/gerar-manifesto.js
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const raiz = path.join(__dirname, '..');
const fora = new Set(['.git', 'publicar', 'config.json', 'checklist.txt', 'manifesto.json', '.gitignore', '.gitattributes', 'node_modules']);
const arquivos = {};
(function andar(dir) {
  for (const nome of fs.readdirSync(dir).sort()) {
    const abs = path.join(dir, nome), rel = path.relative(raiz, abs).split(path.sep).join('/');
    if (fora.has(rel) || /\.(novo|backup|tmp)$/.test(nome) || nome === '.reiniciando') continue;
    if (fs.statSync(abs).isDirectory()) andar(abs);
    else arquivos[rel] = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  }
})(raiz);
const { versao, notas } = JSON.parse(fs.readFileSync(path.join(raiz, 'versao.json'), 'utf8'));
fs.writeFileSync(path.join(raiz, 'manifesto.json'), JSON.stringify({ versao, notas, arquivos }, null, 2) + '\n');
console.log(`manifesto.json: v${versao}, ${Object.keys(arquivos).length} arquivos`);
