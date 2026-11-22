# Frame do Pregador

Site estático que encontra o pregador num vídeo de pregação e entrega os frames com a melhor pose, prontos para artes de divulgação. Todo o processamento acontece no navegador: sem backend, sem upload.

## Como rodar

```bash
npm install        # instala dependências e copia os runtimes WASM para public/vendor
npm run dev        # http://localhost:3000
npm run build      # gera o site estático em out/
```

## Estrutura

- `src/app/page.tsx`: fluxo da tela (início, varredura, escolha da pessoa, resultado).
- `src/components/`: telas e componentes visuais.
- `src/worker/analyzer.worker.ts`: Web Worker com MediaPipe FaceLandmarker e SFace (onnxruntime-web). Compilado por `scripts/build-worker.mjs` para `public/analyzer.worker.js`.
- `src/lib/people.ts`: agrupamento de rostos em pessoas e escolha do provável pregador.
- `src/lib/scoring.ts`: notas de cada frame, nota de expressão e recorte 4:5.
- `src/lib/pipeline.ts`: varredura, refinamento nos frames vizinhos e exportação PNG/zip.
- `src/lib/storage.ts`: progresso salvo no IndexedDB (só números, nunca imagens).
- `public/models/`: `face_landmarker.task` (float16), `face_recognition_sface_2021dec.onnx` e `pose_landmarker_lite.task` (postura do corpo nas fotos finais).

## Decisões técnicas

- **Detecção em blocos.** O detector embutido no FaceLandmarker é de curto alcance e quase não encontra rostos pequenos (pregador em plano aberto). Além do quadro inteiro reduzido para 960 px, o worker analisa blocos quadrados sobrepostos da parte de cima do quadro. Para não ficar lento, todos os blocos são olhados a cada 3 frames; nos outros, só os blocos onde apareceu rosto recentemente. No refinamento, só a região em volta do rosto candidato.
- **Acelerador escolhido por medição.** Na primeira carga o worker mede GPU e CPU (WASM) para o FaceLandmarker, e WebGPU, WebGL e WASM para o SFace, e usa o mais rápido em cada um. Em muitos computadores o WASM ganha porque cada chamada na GPU paga um custo fixo de sincronização.
- **Confiança da detecção.** O FaceLandmarker não expõe a confiança. Usamos como aproximação a fração dos pontos do rosto dentro do quadro vezes o tamanho do rosto na imagem que o detector viu.
- **Cache dos modelos.** Os modelos são baixados uma vez e guardados no Cache Storage do navegador. O `vercel.json` também manda cache longo para `/models` e `/vendor`.
- **COOP/COEP.** Os cabeçalhos de isolamento ficam no `vercel.json` para liberar várias threads no WASM.
