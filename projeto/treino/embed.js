// Calcula os vetores de características (1280 valores) com a MobileNet v2 0.35 do Teachable Machine.
const tf = require('../pk4/node_modules/@tensorflow/tfjs-node');
const fs = require('fs');
const dir = process.argv[2];
(async () => {
  const m = await tf.loadLayersModel('http://localhost:8770/model.json');
  const trunc = tf.model({ inputs: m.inputs, outputs: m.getLayer('out_relu').output });
  for (const k of ['treino', 'teste', 'teste_dificil']) {
    const buf = fs.readFileSync(`${dir}/${k}_X.u8`);
    const n = buf.length / (224 * 224 * 3);
    const out = new Float32Array(n * 1280);
    for (let i = 0; i < n; i += 64) {
      const b = Math.min(64, n - i);
      const e = tf.tidy(() => {
        const x = tf.tensor4d(new Uint8Array(buf.buffer, buf.byteOffset + i * 150528, b * 150528), [b, 224, 224, 3], 'int32');
        // mesma normalização do Teachable Machine: /127 - 1
        return trunc.predict(x.toFloat().div(127).sub(1)).mean([1, 2]);
      });
      out.set(await e.data(), i * 1280); e.dispose();
    }
    fs.writeFileSync(`${dir}/${k}_E.f32`, Buffer.from(out.buffer));
    console.log(k, n);
  }
})();
