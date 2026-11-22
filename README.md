# Frame do Pregador

Site estático que encontra o pregador num vídeo de pregação e entrega os frames com a melhor pose, prontos para artes de divulgação. Todo o processamento acontece no navegador: sem backend, sem upload.

## Como rodar

```bash
npm install        # instala dependências e copia os runtimes WASM para public/vendor
npm run dev        # http://localhost:3000
npm run build      # build do Next.js (site + rotas /api/frame)
```

## Importar do YouTube (Frame API)

O site não baixa vídeos do YouTube sozinho. Uma API separada (`scripts/frame-api.mjs`) faz isso com o **yt-dlp** e extrai as fotos com o **FFmpeg**. Ela roda no seu computador para testes ou numa VM Linux; o site continua na Vercel.

Fluxo:

1. O navegador manda o link para `POST /api/frame/jobs` (Next.js). O Next.js chama a Frame API com o token, e ela baixa uma versão de até 360p (H.264, sem áudio).
2. O navegador recebe a prévia **direto da Frame API**, por uma URL assinada que vence em 10 min. O token nunca vai para o navegador e o MP4 não passa pela Vercel. A prévia entra no mesmo fluxo do upload: análise, escolha da pessoa e das fotos.
3. Ao baixar a primeira foto, o navegador manda **todos os instantes escolhidos num único pedido** (`POST /api/frame/jobs/{id}/export`). A API baixa uma única versão de até 1080p, extrai os PNGs com o FFmpeg e entrega só as fotos, também por URL assinada. Se o usuário exportar de novo enquanto a tarefa estiver ativa, a versão alta é reaproveitada. O recorte 4:5 é convertido da prévia para a resolução real.

Contrato da Frame API:

| Rota | Acesso | O que faz |
|---|---|---|
| `GET /health` | livre | verifica se responde |
| `POST /jobs` `{"url": "..."}` | token | cria a tarefa (HTTP 202) |
| `GET /jobs/{id}` | token | status: `downloading`, `ready`, `exporting`, `complete`, `failed` |
| `GET /jobs/{id}/preview` | URL assinada | MP4 de análise (aceita `Range`) |
| `POST /jobs/{id}/export` `{"timestamps": [12.345]}` | token | extrai as fotos (HTTP 202) |
| `GET /jobs/{id}/frames/{n}` | URL assinada | PNG |

Limites (configuráveis por variável): 1 processamento por vez, 8 tarefas, vídeo de até 4 h e 1 GB, até 30 fotos por pedido, instantes dentro da duração real do vídeo. Tarefas e arquivos são apagados 60 min depois de terminar. yt-dlp e FFmpeg recebem os argumentos direto, sem shell.

**Em produção a importação fica desligada** (`src/server/frame-api.ts`): o site é público e não tem login, então qualquer pessoa poderia usar a VM. Ligue só depois de existir controle de acesso e de uso.

### Variáveis

Next.js (`.env.local` no computador; Environment Variables na Vercel):

| Variável | Exemplo | Para quê |
|---|---|---|
| `FRAME_API_BASE_URL` | `http://127.0.0.1:8787` | onde o servidor do Next.js chama a API |
| `FRAME_API_PUBLIC_URL` | `https://frame-api.seudominio.com.br` | endereço da API visto pelo navegador (padrão: o mesmo do anterior) |
| `FRAME_API_TOKEN` | (32+ caracteres aleatórios) | segredo compartilhado; nunca com prefixo `NEXT_PUBLIC_` |

Frame API (`.env.frame-api`, lido por `npm run frame:api`, ou variáveis do sistema):

| Variável | Padrão | Para quê |
|---|---|---|
| `FRAME_API_TOKEN` | (obrigatória) | o mesmo valor do Next.js |
| `FRAME_API_HOST` / `FRAME_API_PORT` | `127.0.0.1` / `8787` | onde escutar |
| `FRAME_API_ALLOWED_ORIGINS` | `http://localhost:3000` | origens do site (CORS da prévia e dos PNGs), separadas por vírgula |
| `YT_DLP_PATH` | vazio (`python -m yt_dlp`) | executável do yt-dlp |
| `YT_DLP_JS_RUNTIME` | `node` | runtime JS que o yt-dlp usa nos desafios do YouTube |
| `FFMPEG_PATH` | vazio (`ffmpeg` do PATH ou do pacote `imageio-ffmpeg`) | executável do FFmpeg |
| `FRAME_API_MAX_DURATION` / `MAX_FILESIZE` / `MAX_JOBS` / `MAX_ACTIVE` / `MAX_FRAMES` / `JOB_TTL_MIN` | `14400` / `1G` / `8` / `1` / `30` / `60` | limites |

Gerar um token: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`

### Rodar no seu computador

```bash
python -m pip install -U "yt-dlp[default]" imageio-ffmpeg   # yt-dlp + componente oficial dos desafios + FFmpeg
# terminal 1 (API)
FRAME_API_TOKEN=... npm run frame:api
# terminal 2 (site), com o mesmo token em .env.local
npm run dev
```

O yt-dlp precisa de um runtime JavaScript para os desafios do YouTube; o Node.js já instalado serve (`YT_DLP_JS_RUNTIME=node`).

### Rodar numa VM Linux (Ubuntu/Debian)

```bash
sudo apt update && sudo apt install -y python3-pip ffmpeg nodejs
python3 -m pip install -U "yt-dlp[default]"
git clone https://github.com/habynner-samuel/perfect-frame.git && cd perfect-frame
printf 'FRAME_API_TOKEN=...\nFRAME_API_ALLOWED_ORIGINS=https://seu-site.vercel.app\n' > .env.frame-api
node --env-file=.env.frame-api scripts/frame-api.mjs
```

Para manter ligada, use um serviço do systemd com `ExecStart=/usr/bin/node --env-file=/caminho/.env.frame-api /caminho/scripts/frame-api.mjs` e coloque um proxy com HTTPS (Caddy ou Nginx) na frente da porta 8787. O navegador precisa de HTTPS, porque o site da Vercel é HTTPS. Atualize o yt-dlp com frequência, já que o YouTube muda sempre. **Um teste local que funciona não garante que a VM consegue baixar:** o YouTube bloqueia mais os IPs de nuvem.

## Estrutura

- `src/app/page.tsx`: fluxo da tela (início, varredura, escolha da pessoa, resultado).
- `src/components/`: telas e componentes visuais.
- `src/worker/analyzer.worker.ts`: Web Worker com MediaPipe FaceLandmarker e SFace (onnxruntime-web). Compilado por `scripts/build-worker.mjs` para `public/analyzer.worker.js`.
- `src/lib/people.ts`: agrupamento de rostos em pessoas e escolha do provável pregador.
- `src/lib/scoring.ts`: notas de cada frame, nota de expressão e recorte 4:5.
- `src/lib/pipeline.ts`: varredura, refinamento nos frames vizinhos e exportação PNG/zip.
- `src/lib/storage.ts`: progresso salvo no IndexedDB (só números, nunca imagens).
- `public/models/`: `face_landmarker.task` (float16), `face_recognition_sface_2021dec.onnx` , `pose_landmarker_lite.task` (postura do corpo nas fotos finais) e `face_detection_yunet_2023mar.onnx` (detector rápido da varredura).

## Decisões técnicas

- **Varredura rápida.** A varredura usa o YuNet (227 KB), que acha rostos pequenos numa única passada e já dá os 5 pontos que o SFace precisa. O FaceLandmarker (olhos, boca, pose da cabeça) só roda no refinamento das fotos finais. A impressão digital é reaproveitada quando o rosto continua no mesmo lugar, quadros praticamente iguais ao anterior são pulados, e a análise roda em 2 a 3 workers em paralelo, cada um com seu próprio leitor do vídeo.
- **Detecção em blocos (refinamento).** O detector embutido no FaceLandmarker é de curto alcance e quase não encontra rostos pequenos (pregador em plano aberto). Além do quadro inteiro reduzido para 960 px, o worker analisa blocos quadrados sobrepostos da parte de cima do quadro. Para não ficar lento, todos os blocos são olhados a cada 3 frames; nos outros, só os blocos onde apareceu rosto recentemente. No refinamento, só a região em volta do rosto candidato.
- **Acelerador escolhido por medição.** Na primeira carga o worker mede GPU e CPU (WASM) para o FaceLandmarker, e WebGPU, WebGL e WASM para o SFace, e usa o mais rápido em cada um. Em muitos computadores o WASM ganha porque cada chamada na GPU paga um custo fixo de sincronização.
- **Confiança da detecção.** O FaceLandmarker não expõe a confiança. Usamos como aproximação a fração dos pontos do rosto dentro do quadro vezes o tamanho do rosto na imagem que o detector viu.
- **Cache dos modelos.** Os modelos são baixados uma vez e guardados no Cache Storage do navegador. O `vercel.json` também manda cache longo para `/models` e `/vendor`.
- **COOP/COEP.** Os cabeçalhos de isolamento ficam no `vercel.json` para liberar várias threads no WASM.
