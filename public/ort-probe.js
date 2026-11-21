// Sonda descartavel: testa se o ONNX Runtime consegue iniciar com varias
// threads neste navegador/servidor. Em alguns ambientes a inicializacao com
// threads trava; nesse caso o worker principal usa 1 thread.
importScripts("/vendor/ort/ort.all.min.js");
onmessage = async (e) => {
  ort.env.wasm.wasmPaths = "/vendor/ort/";
  ort.env.wasm.numThreads = e.data.threads;
  try {
    // bytes invalidos de proposito: so queremos ver o WASM iniciar
    await ort.InferenceSession.create(new Uint8Array([8, 1]), { executionProviders: ["wasm"], logSeverityLevel: 4 });
  } catch (err) {
    /* esperado: "No graph was found" */
  }
  postMessage("ok");
};
