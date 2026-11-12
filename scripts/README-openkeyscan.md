# Como o modelo OpenKeyScan foi convertido

1. `checkpoints/openkeyscan3.pt` (MIT, rekordcloud/openkeyscan-analyzer) carregado com `torch.load(..., weights_only=True)` numa reimplementação da arquitetura KeyNet (Nf=64).
2. Exportado com `torch.onnx.export` (opset 17, eixo de tempo dinâmico). Diferença máxima entre PyTorch e ONNX: 8e-7.
3. Convertido para float16 (`onnxconverter_common.float16`, entradas e saídas em float32): 9,4 MB, mesmas classes em 30/30 entradas aleatórias.
4. CQT reescrito em TypeScript (`src/lib/keyscan/cqt.ts`). Contra o `librosa.cqt`: correlação ≥ 0,9999 e a mesma key em 9/9 prévias reais. Os testes estão em `src/lib/keyscan/*.test.ts`.
