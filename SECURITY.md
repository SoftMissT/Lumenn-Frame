# Política de segurança / Security policy

**Português** · [English](#english)

---

## Versões com suporte

Só a **versão mais recente** publicada em
[Releases](https://github.com/SoftMissT/Lumenn-Frame/releases/latest) recebe
correções de segurança. O projeto está na fase 0.0.x (pré-validação em Foundry
real): não há versões antigas mantidas em paralelo.

| Versão | Suporte |
| :----- | :------ |
| Última release | Sim |
| Anteriores | Não, atualize |

## Como reportar uma vulnerabilidade

**Não abra uma issue pública** para falhas de segurança.

1. Abra um relato privado:
   [Reportar uma vulnerabilidade](https://github.com/SoftMissT/Lumenn-Frame/security/advisories/new)
   (aba **Security → Report a vulnerability**).
2. Descreva: versão do Lumenn Frame, versão do Foundry, passos para reproduzir,
   o impacto que você observou e, se possível, uma prova de conceito.
3. Não inclua dados pessoais de terceiros nem segredos reais da sua campanha.

Este é um projeto mantido por uma pessoa. O retorno é por **melhor esforço, sem
prazo garantido**. Você será avisado quando o relato for lido e quando houver
correção; a divulgação pública deve esperar a correção ser publicada.

## O que o módulo faz (e não faz)

Verificado no código da versão atual:

- **Não faz requisições de rede** e não usa `eval`, `new Function` nem carrega
  scripts externos.
- **Não tem dependências de runtime** (não há `package.json`; os testes usam
  apenas recursos nativos do Node).
- Usa só APIs do Foundry: configurações do mundo, Scenes, Playlists e o socket
  do módulo (`module.lumenn-frame`).
- Todas as escritas na base de dados do módulo exigem que o usuário seja **GM**
  (checagem no próprio código).

## Limitações conhecidas

Estas limitações são conhecidas e **ainda não foram corrigidas**. Documentá-las
aqui é para que você decida com informação.

1. **Dados legíveis por jogadores.** Os storyboards, inclusive o **texto das
   Notas**, ficam em uma configuração de escopo `world`. Em geral, clientes
   conectados recebem as configurações do mundo, então um jogador com
   conhecimento técnico pode lê-las pelo console do navegador
   `[inferência a partir do escopo; não testado em Foundry real]`.
   **Não guarde segredos de campanha em Notas.**
2. **Mensagens de socket sem autenticação.** O módulo escuta o canal
   `module.lumenn-frame` nos clientes de jogadores. No **Foundry 14** o cliente do
   jogador **não executa mais** troca de Scene a partir dessas mensagens: a troca
   chega pela ativação feita pelo GM. No **Foundry 13** o modo de reserva ainda
   confia no conteúdo (`transition:start`), e o Foundry não identifica o
   remetente de mensagens de socket de módulo `[conhecimento geral; não
   verificado nesta versão do Foundry]`: um cliente modificado poderia exibir nos
   outros jogadores uma Scene que o cliente deles já conhece (efeito visual, sem
   vazamento de dados). Só tem efeito quando **Fade de cena para jogadores** está
   ligado.
3. **Sem validação em Foundry real.** As versões 0.0.x passaram em testes
   estáticos; o teste com GM e jogador ainda está pendente. Trate o módulo como
   pré-lançamento.

## Como se proteger

- Instale **somente** pela URL oficial do manifesto:
  `https://github.com/SoftMissT/Lumenn-Frame/releases/latest/download/module.json`
- A partir da v0.0.29, as notas de cada release trazem o **SHA-256** do ZIP, para
  você conferir o arquivo baixado.
- Conceda o papel de GM só a quem confia; o editor e as escritas são do GM.
- Faça backup do mundo antes de atualizar o módulo.

---

<a id="english"></a>

# Security policy (English)

[Português](#política-de-segurança--security-policy) · **English**

## Supported versions

Only the **latest version** published on
[Releases](https://github.com/SoftMissT/Lumenn-Frame/releases/latest) receives
security fixes. The project is in its 0.0.x stage (pre-validation in real
Foundry): no older versions are maintained in parallel.

| Version | Support |
| :------ | :------ |
| Latest release | Yes |
| Earlier ones | No, please update |

## How to report a vulnerability

**Do not open a public issue** for security flaws.

1. Open a private report:
   [Report a vulnerability](https://github.com/SoftMissT/Lumenn-Frame/security/advisories/new)
   (**Security → Report a vulnerability** tab).
2. Describe: Lumenn Frame version, Foundry version, steps to reproduce, the
   impact you observed and, if possible, a proof of concept.
3. Do not include third parties' personal data or real campaign secrets.

This is a one-person project. Responses are **best effort, with no guaranteed
timeline**. You will be told when the report is read and when a fix exists;
public disclosure should wait until the fix is published.

## What the module does (and does not do)

Verified in the current version's code:

- It **makes no network requests** and uses no `eval`, `new Function` or
  external scripts.
- It has **no runtime dependencies** (there is no `package.json`; tests use only
  Node built-ins).
- It uses only Foundry APIs: world settings, Scenes, Playlists and the module
  socket (`module.lumenn-frame`).
- Every write to the module's data requires the user to be a **GM** (checked in
  the code itself).

## Known limitations

These are known and **not yet fixed**. They are documented here so you can
decide with full information.

1. **Data readable by players.** Storyboards, including the **text of Notes**,
   live in a `world`-scope setting. Connected clients generally receive world
   settings, so a technically skilled player may read them from the browser
   console `[inference from the scope; not tested in real Foundry]`.
   **Do not keep campaign secrets in Notes.**
2. **Unauthenticated socket messages.** The module listens on the
   `module.lumenn-frame` channel on player clients. On **Foundry 14** the player
   client **no longer performs** a scene switch from those messages: the switch
   arrives through the GM's activation. On **Foundry 13** the fallback mode still
   trusts the content (`transition:start`), and Foundry does not identify the
   sender of module socket messages `[general knowledge; not verified on this
   Foundry version]`: a modified client could make other players display a Scene
   their client already knows about (a visual effect, no data leak). It only
   matters when **Scene fade for players** is on.
3. **Not validated in real Foundry.** 0.0.x versions passed static tests; the
   GM-and-player test is still pending. Treat the module as pre-release.

## How to protect yourself

- Install **only** from the official manifest URL:
  `https://github.com/SoftMissT/Lumenn-Frame/releases/latest/download/module.json`
- From v0.0.29 on, each release's notes include the ZIP's **SHA-256** so you can
  check the downloaded file.
- Grant the GM role only to people you trust; the editor and all writes are GM
  actions.
- Back up your world before updating the module.
