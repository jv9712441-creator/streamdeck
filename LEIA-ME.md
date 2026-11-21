# 🎛️ Stream Deck pelo celular

O celular vira um painel de botões para o PC, um relógio "always on display" e um lugar para aprovar pedidos (inclusive os do Claude Code).

## Instalar (uma vez)

**No PC**
1. Instale o **Node.js 22 ou mais novo** (versão LTS) em https://nodejs.org
2. Coloque esta pasta onde quiser (ex.: `C:\StreamDeck`).
3. Dê dois cliques em **`iniciar.bat`**. Se o Windows perguntar sobre o firewall, permita em **redes privadas**.
4. Abre sozinha uma página com o QR code.

**No celular**
1. Com o celular **no mesmo Wi-Fi**, aponte a câmera para o QR code. Abre o app já conectado ao PC.
2. Se o Chrome perguntar sobre **dispositivos na rede local**, toque em **Permitir** (é assim que o app fala com o PC).
3. Menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").

O app instalado abre sempre, mesmo com o PC desligado ou sem internet: relógio, botões (os últimos que vieram do PC) e tudo mais. Os botões só funcionam com o PC ligado.

Para conectar a outro PC ou de novo: tela 💻 → **Escanear QR code do PC**.

Para abrir junto com o Windows: `Win+R` → `shell:startup` → crie ali um atalho para o `iniciar.bat`.

## Usar

O app é dividido em telas. Deslize para o lado ou toque nos ícones de baixo:

1. **🕐 Relógio** (abre sempre nele): notificações e pedidos de permissão aparecem no topo, numa "ilha" (os pedidos com Permitir/Negar ali mesmo). tela preta tipo always on display, feita para o celular deitado. Arraste para cima para trocar o estilo (para baixo volta): LCD, duas cores, números grandes, digital, minimalista, analógico, por extenso e pomodoro. O ⛶ no canto põe em tela cheia e trava deitado. A tela fica acesa e o relógio se mexe um pouquinho a cada minuto para não marcar.
2. **🎛️ Botões**: toque para executar. As abas de cima são as suas páginas de botões. No **✏️** você muda nome, ícone (emoji), cor e o que cada botão faz; o **+** cria um novo e "Página…" cria, renomeia, move e apaga páginas.
3. **🔔 Notificações**: avisos do PC e do Claude.
4. **🛡️ Permissões**: pedidos com **Permitir / Negar**. Quando chega um, o celular vibra, pula sozinho para esta tela e depois volta para onde você estava.
5. **💻 PC**: uso de CPU e RAM, versão e atualização, e desconectar o celular.

### Páginas do Command Center

Já vem com **HOME** (atalhos para as outras páginas e os modos), **VILTRUN**, **WORK**, **SYSTEM**, **GAMING**, **STREAM**, **AUDIO** e **EXTRAS**. Se você já usava uma versão antiga, carregue elas na tela 💻 → "Carregar páginas do Command Center".

Botões que dependem de você (Dashboard, Clientes, Database, Jogo favorito) vêm vazios: toque no ✏️ e coloque o programa ou site. A pasta **Projetos** aponta para `C:\Users\<você>\Projetos`; troque se for outra.

**Modos** (DEV, WORK, GAMING, STREAM, END SESSION) apertam vários botões em sequência, pelo nome. Para mudar o que um modo abre, edite a lista no ✏️ (um nome de botão por linha). Hoje eles abrem: **DEV** (Claude, Sancoto, Terminal, WhatsApp no Firefox, VPS, Stoat, Discord), **WORK** (ChatGPT, YouTube), **GAMING** (Steam, Discord, Spotify) e **STREAM** (Twitch, OBS, Steam, Discord). O **END SESSION** fecha todos os programas abertos, como se você clicasse no X de cada um (quem tiver algo sem salvar pergunta antes). O Stream Deck não fecha. Para deixar algum aberto, ponha o nome dele no ✏️ do END SESSION. O botão Checklist (aba EXTRAS) abre o `checklist.txt`.

**OBS**: no OBS, vá em Ferramentas → Configurações do servidor WebSocket → Ativar e copie a senha. No celular, tela 💻 → OBS Studio → cole a senha → Salvar e testar. Se a sua câmera ou microfone tiverem outro nome no OBS, ajuste o nome no ✏️ dos botões Câmera e Mutar mic.

### Tipos de botão

| Tipo | Exemplo |
|---|---|
| Abrir app ou site | `app:SteelSeries GG` (pelo nome do menu Iniciar), `notepad`, `chrome`, `https://youtube.com`, `spotify:`, `C:\Jogos\jogo.exe` |
| Rodar comando | `shutdown /r /t 0` (cmd) ou qualquer coisa de PowerShell. Pode mostrar o resultado no celular |
| Atalho de teclado | `ctrl+shift+esc`, `win+d`, `alt+tab`, `f5`, `playpause`, `proxima`, `anterior`, `volumemais`, `volumemenos`, `mudo` |
| Enviar texto pro PC | digita no celular e vai para o Ctrl+V do PC (ou já cola sozinho) |
| Pegar clipboard do PC | mostra no celular o que está copiado no PC |
| Modo | vários botões em sequência (nomes, um por linha) |
| OBS Studio | transmissão, gravação, pausa, cenas, mutar áudio, mostrar/esconder câmera, replay |
| Microfone do Windows | liga/desliga todos os microfones do PC de uma vez (inclusive os do SteelSeries Sonar) |
| Fechar todos os programas | fecha tudo que está aberto (menos o que você listar) |
| Ir para página / Ir para o relógio | navegação dentro do próprio deck |

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

## Celular deitado

É só girar o celular (com a rotação automática ligada). Deitado, os botões se ajustam para caber todos na tela sem rolar. Se preferir um número fixo de colunas, entre no ✏️ com o celular deitado e use **Colunas − / +** (o "Auto" volta ao ajuste sozinho). Em pé e deitado guardam a escolha separado.

## Atualizações

Não precisa baixar de novo. Quando sair versão nova, aparece um aviso e um ponto azul no 💻: entre nessa tela, toque em **Atualizar agora**, confirme e o PC baixa, confere e reinicia o Stream Deck sozinho. Seus botões e o pareamento continuam iguais. Para procurar na hora, vá na tela 💻 PC.

As atualizações vêm de https://github.com/jv9712441-creator/streamdeck

## Bom saber

- **Tela apagando no modo relógio**: como a página é `http`, o Chrome não libera o recurso oficial de manter a tela acesa. Eu uso um vídeo mudo em loop no lugar. Se mesmo assim apagar, abra `chrome://flags` no celular, procure **Insecure origins treated as secure**, adicione `http://IP-DO-PC:8765` e reinicie o Chrome.
- **Atalho não funciona num programa**: se o programa estiver rodando como administrador, o Windows bloqueia as teclas. Rode o `iniciar.bat` como administrador também.
- **Segurança**: o QR code tem uma senha (token). Quem tiver ela controla o PC, então não compartilhe. Funciona só na rede local: não abra a porta no roteador. Para trocar a senha, apague o valor de `"token"` no `config.json` e pareie de novo.
- O IP do PC pode mudar quando o roteador reinicia. Se o celular parar de conectar, abra `localhost:8765/parear` de novo. Reservar um IP fixo para o PC no roteador resolve de vez.
