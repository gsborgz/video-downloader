# Baixador de vídeos do X/Twitter e YouTube

App em Vite + React (TypeScript) para baixar vídeos do X/Twitter e do YouTube em MP4, sempre limitado a até 720p. Frontend estático + funções serverless da Vercel, sem framework de servidor (Next etc.).

## Arquitetura

- **Frontend**: Vite + React, em `src/`. Vira um build estático (`dist/`) na hora do deploy.
- **Backend**: duas [Vercel Functions](https://vercel.com/docs/functions) puras (sem framework), em `api/`:
  - `POST /api/info` — roda o [yt-dlp](https://github.com/yt-dlp/yt-dlp) (`-j`, só metadados) para mostrar uma prévia: título, thumbnail, duração e a resolução que será usada.
  - `/api/download` — roda o yt-dlp de verdade, baixando o melhor formato ≤ 720p para um arquivo temporário e servindo-o ao navegador com `Content-Disposition: attachment`. O arquivo temporário é apagado assim que o download termina. Aceita `GET` (link nativo, sem cookies) ou `POST` (quando o usuário informou cookies — ver seção abaixo).
- **Lógica compartilhada**: `lib/twitter.ts` e `lib/youtube.ts` validam a URL de cada plataforma (`lib/video-url.ts` combina as duas), e `lib/yt-dlp.ts` (chamadas ao binário) é o mesmo código de download para ambas — o yt-dlp já suporta os dois sites nativamente, então adicionar YouTube não exigiu nenhuma lógica de download nova, só uma validação de URL a mais.

Vídeos "nativos" do Twitter (não GIFs) e do YouTube costumam ser servidos como streams separados de vídeo e áudio (HLS/DASH) — nesse caso o yt-dlp usa o `ffmpeg` para juntar os dois antes de entregar o MP4 final. Quando a plataforma já oferece um MP4 progressivo (vídeo+áudio combinados) na resolução certa, esse passo de merge é pulado automaticamente.

### Por que não dá pra fazer só com Vite

Vite é um bundler de frontend — ele não executa processos do servidor. Baixar e mesclar vídeo (yt-dlp + ffmpeg) exige Node.js rodando `child_process`, então o backend precisa existir em algum lugar. Aqui ele mora em `api/*.ts`, no formato nativo de Serverless Function da Vercel (um `export default` recebendo `(req, res)` do Node) — funciona em qualquer deploy na Vercel sem precisar de Next.js ou outro framework de servidor.

### Rodando as functions localmente sem a Vercel CLI

O `vite.config.ts` tem um plugin (`apiRoutesDevMiddleware`) que intercepta `/api/info` e `/api/download` no próprio dev server do Vite e chama os handlers de `api/*.ts` diretamente (via `server.ssrLoadModule`). Ou seja, `npm run dev` já sobe frontend + backend juntos, com hot reload, sem precisar instalar/logar na Vercel CLI. Esse plugin só existe para o ambiente de desenvolvimento — em produção, a própria Vercel detecta e executa os arquivos de `api/` automaticamente.

### Pegadinha: imports relativos em `api/` e `lib/` precisam de `.js` no final

A Vercel roda cada arquivo de `api/*.ts` como um módulo ES nativo do Node (sem empacotar tudo num único arquivo), e o resolvedor de módulos ESM do Node exige a extensão explícita mesmo quando o import aponta pra um arquivo `.ts` — ex: `import { x } from "../lib/foo.js"` dentro de um arquivo `.ts`, não `"../lib/foo"`. Isso funciona porque o TypeScript entende esse `.js` como referência ao `.ts` correspondente na hora de checar tipos (é o modelo padrão de projetos ESM/`nodenext`), mas localmente com Vite (que empacota tudo e resolve extensões sozinho) o erro não aparece — só estoura em produção, como um `ERR_MODULE_NOT_FOUND` na function.

O `tsconfig.api.json` usa `"moduleResolution": "nodenext"` exatamente para pegar isso em tempo de build (`npm run build`/`tsc -b` já reclama se faltar a extensão em algum import novo dentro de `api/` ou `lib/`), então não devia mais quebrar silenciosamente — mas vale lembrar ao criar um novo arquivo em `lib/` ou uma nova function em `api/`.

## yt-dlp e ffmpeg

O binário standalone do `yt-dlp` é baixado automaticamente pelo script `scripts/download-yt-dlp.mjs`, disparado pelo hook `postinstall` do `npm install`. Ele detecta a plataforma (`win32`, `linux`, `darwin`) e baixa o executável certo para `./bin/`. Isso significa que:

- No seu Windows local, baixa `yt-dlp.exe`.
- No build da Vercel (Linux), baixa `yt-dlp_linux` — e como o build da Vercel roda em Linux, o binário certo é sempre baixado automaticamente durante o deploy.

O `ffmpeg` (necessário para juntar áudio+vídeo dos streams HLS) vem do pacote [`ffmpeg-static`](https://www.npmjs.com/package/ffmpeg-static), que já resolve o binário certo por plataforma sozinho.

O `vercel.json` configura `includeFiles` para garantir que a pasta `bin/` e o pacote `ffmpeg-static` sejam empacotados junto das funções `/api/info` e `/api/download` (esses binários não são referenciados por `import`/`require` estático, então o tracer de arquivos da Vercel não os encontraria sozinho).

O binário do yt-dlp não é versionado no git (está no `.gitignore`); ele é sempre baixado on-the-fly durante o `npm install`.

## Rodando localmente

```bash
npm install   # também baixa o yt-dlp automaticamente
npm run dev
```

Abra http://localhost:5173.

## Testes

Testes automatizados com [Vitest](https://vitest.dev/) (mesma ferramenta base do Vite, zero config extra):

```bash
npm run test        # roda tudo uma vez
npm run test:watch  # modo watch
```

O que é coberto:

- `lib/twitter.test.ts` e `lib/youtube.test.ts` — validação de URL de cada plataforma (aceita as variações reais, rejeita domínios parecidos/spoofing); `lib/video-url.test.ts` testa o combinador das duas.
- `lib/http.test.ts` — leitura de body JSON e helper de resposta usados pelas functions.
- `lib/yt-dlp.test.ts` — a parte mais importante: parsing da saída do yt-dlp mockando `child_process` (não chama o binário real nem a internet), cobrindo os casos que já pegamos na prática: tweet com várias resoluções (capado em 720p), clipe tipo GIF sem metadado de resolução, tweet com mais de um vídeo (JSON delimitado por linha) e falha do yt-dlp.
- `api/info.test.ts` e `api/download.test.ts` — as duas functions com `lib/yt-dlp` mockado, verificando validação de entrada, códigos de status, headers (`Content-Disposition`, `Content-Length`), que o arquivo temporário é apagado depois do streaming, e o fluxo de cookies (`GET` sem cookies, `POST` com cookies, limite de tamanho).
- `src/App.test.tsx` — fluxo da UI (React Testing Library): submissão com sucesso mostra prévia + link de download; erro da API e falha de rede mostram a mensagem certa; cookies persistidos no `localStorage`, enviados nas requisições, removíveis, e o download alternando entre link nativo e fetch+blob.

Nenhum teste depende do binário real do yt-dlp/ffmpeg nem faz chamadas de rede — só testam a lógica própria do projeto, então rodam rápido e de forma determinística.

## CI (GitHub Actions)

`.github/workflows/ci.yml` roda em todo push para `main` e em pull requests: instala as dependências (pulando o download do binário do yt-dlp, que não é necessário para lint/build/test), roda `npm run lint`, `npm run build` (type-check dos três `tsconfig` + build do Vite) e `npm run test`.

## Deploy na Vercel

Basta importar o repositório na Vercel normalmente — ela detecta o Vite automaticamente (`vite build` gera o estático, e `api/*.ts` vira funções serverless). O `postinstall` cuida de baixar o binário do yt-dlp durante o build, e o `vercel.json` cuida do resto (timeout e binários inclusos).

### Limitações conhecidas

- `/api/download` está configurado com `maxDuration = 60` segundos (via `vercel.json`). No plano Hobby da Vercel esse é o teto; em planos pagos dá para aumentar se vídeos maiores começarem a estourar o tempo.
- Vídeos de tweets costumam ser curtos (o Twitter limita a 140s para contas gratuitas), então o tempo de download+merge normalmente fica na casa de poucos segundos. Vídeos do YouTube podem ser bem mais longos — um vídeo de 30+ minutos pode não terminar de baixar dentro do limite de 60s no plano Hobby.
- **O YouTube costuma bloquear requisições vindas de IPs de datacenter** (é o caso das funções serverless da Vercel) com a mensagem "Sign in to confirm you're not a bot". Isso é um comportamento do lado do YouTube, fora do nosso controle, e não existe uma chave de API oficial que resolva — a YouTube Data API não expõe download de vídeo, só metadados. A mitigação disponível é o usuário informar cookies de uma sessão logada (ver seção abaixo); sem isso, o erro do yt-dlp aparece direto na tela.
- Por enquanto, suporta apenas links de `twitter.com`/`x.com` e `youtube.com`/`youtu.be`.

### Contornando o bloqueio do YouTube com cookies (opcional)

Na UI existe uma seção recolhível ("Problemas para baixar do YouTube? Usar cookies") onde a pessoa pode colar o conteúdo de um `cookies.txt` (formato Netscape) exportado de uma sessão logada no YouTube — por exemplo com a extensão de navegador ["Get cookies.txt LOCALLY"](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc). Alguns pontos importantes sobre como isso foi implementado:

- **Armazenamento**: o conteúdo fica só no `localStorage` do navegador da pessoa (`src/App.tsx`), nunca no servidor. A cada requisição de info/download, ele é enviado no corpo da requisição; o backend (`lib/yt-dlp.ts`) escreve num arquivo temporário, passa `--cookies <arquivo>` pro yt-dlp, e apaga o arquivo logo em seguida — nunca fica persistido.
- **`POST` em vez de `GET` no download**: como cookies podem ter alguns KB (grande demais/inseguro pra caber numa URL), quando há cookies salvos o botão "Baixar MP4" muda de um link `<a href>` simples para um fetch `POST` que recebe o vídeo como blob e dispara o download via um link temporário. Sem cookies, continua sendo um `GET` simples (mais eficiente em memória pro navegador, que evita bufferizar o arquivo inteiro).
- **Limite de tamanho**: cookies maiores que 32 KB (`MAX_COOKIES_LENGTH` em `lib/yt-dlp.ts`) são rejeitados com 400, tanto em `/api/info` quanto em `/api/download`.
- **Riscos, deixados claros na própria UI**: usar essa sessão pra automatizar downloads é uma zona cinzenta nos Termos de Serviço do YouTube — a conta de quem usar pode sofrer alguma restrição em uso intenso. É uma feature opcional, cada pessoa decide se quer usar sua própria sessão.
