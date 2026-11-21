# 🎛️ Stream Deck pelo celular

O celular vira um painel de botões para o PC, um relógio "always on display" e um lugar para aprovar pedidos (inclusive os do Claude Code).

## Instalar (uma vez)

1. Instale o **Node.js 22 ou mais novo** (versão LTS) em https://nodejs.org
2. Coloque esta pasta onde quiser (ex.: `C:\StreamDeck`).
3. Dê dois cliques em **`iniciar.bat`**. Se o Windows perguntar sobre o firewall, permita em **redes privadas**.
4. Abre sozinha uma página com um QR code. Com o celular **no mesmo Wi-Fi**, aponte a câmera para ele.
5. No Chrome do celular: menu ⋮ → **Adicionar à tela inicial**. Pronto, vira um app.

Para abrir junto com o Windows: `Win+R` → `shell:startup` → crie ali um atalho para o `iniciar.bat`.

## Usar

- **Botões**: toque para executar. Deslize para o lado para trocar de página.
- **✏️ Editar**: toque num botão para mudar nome, ícone (emoji), cor e o que ele faz. O **+** cria um novo. "Página…" cria, renomeia, move e apaga páginas.
- **🕐 Relógio**: tela preta com o relógio. Toque para trocar o estilo: digital, minimalista, analógico, por extenso e pomodoro. Ele se mexe um pouquinho a cada minuto para não marcar a tela.
- **🔔 Notificações**: pedidos de permissão abrem sozinhos com **Permitir / Negar**, inclusive por cima do relógio. O celular vibra.

### Tipos de botão

| Tipo | Exemplo |
|---|---|
| Abrir app ou site | `notepad`, `chrome`, `https://youtube.com`, `spotify:`, `C:\Jogos\jogo.exe` |
| Rodar comando | `shutdown /r /t 0` (cmd) ou qualquer coisa de PowerShell. Pode mostrar o resultado no celular |
| Atalho de teclado | `ctrl+shift+esc`, `win+d`, `alt+tab`, `f5`, `playpause`, `proxima`, `anterior`, `volumemais`, `volumemenos`, `mudo` |
| Enviar texto pro PC | digita no celular e vai para o Ctrl+V do PC (ou já cola sozinho) |
| Pegar clipboard do PC | mostra no celular o que está copiado no PC |
| Ir para página / Modo relógio | navegação dentro do próprio deck |

Também dá para editar tudo direto no `config.json` (com o servidor fechado).

## Notificações

- **Do Windows (experimental)**: as notificações que aparecem no canto da tela (Discord, WhatsApp, Teams…) são repassadas para o celular. Para ignorar algum app, ponha o nome em `"ignorarApps": ["Teams"]` no `config.json`. Para desligar: `"espelharNotificacoesWindows": false`.
- **Do Claude Code**: rode uma vez no terminal, dentro desta pasta:
  ```
  node hooks\instalar-claude.js
  ```
  e reinicie o Claude Code. Os pedidos de permissão vão para o celular. Se você não responder em 60 s (`tempoRespostaPermissao`) ou tocar em "Responder no PC", ele pergunta no PC como sempre. Você também recebe aviso quando o Claude termina uma tarefa. Para desfazer: `node hooks\instalar-claude.js --remover`.
- **Dos seus scripts**:
  ```powershell
  .\ferramentas\notificar.ps1 -Titulo "Backup terminou"
  .\ferramentas\notificar.ps1 -Titulo "Posso apagar a pasta temp?" -Perguntar   # sai com 0 se permitir
  ```

## Bom saber

- **Tela apagando no modo relógio**: como a página é `http`, o Chrome não libera o recurso oficial de manter a tela acesa. Eu uso um vídeo mudo em loop no lugar. Se mesmo assim apagar, abra `chrome://flags` no celular, procure **Insecure origins treated as secure**, adicione `http://IP-DO-PC:8765` e reinicie o Chrome.
- **Atalho não funciona num programa**: se o programa estiver rodando como administrador, o Windows bloqueia as teclas. Rode o `iniciar.bat` como administrador também.
- **Segurança**: o QR code tem uma senha (token). Quem tiver ela controla o PC, então não compartilhe. Funciona só na rede local: não abra a porta no roteador. Para trocar a senha, apague o valor de `"token"` no `config.json` e pareie de novo.
- O IP do PC pode mudar quando o roteador reinicia. Se o celular parar de conectar, abra `localhost:8765/parear` de novo. Reservar um IP fixo para o PC no roteador resolve de vez.
