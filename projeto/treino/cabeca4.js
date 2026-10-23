// Treina a cabeça (mesma arquitetura do Teachable Machine) com tfjs-node, rápido.
const tf = require('../pk4/node_modules/@tensorflow/tfjs-node');
const fs = require('fs');
const [dir, saida, epocas] = [process.argv[2], process.argv[3], +(process.argv[4] || 25)];
const classes = JSON.parse(fs.readFileSync(dir + '/classes.json'));
const ler = (k) => ({ E: new Float32Array(fs.readFileSync(`${dir}/${k}_E.f32`).buffer.slice(0)), ...JSON.parse(fs.readFileSync(`${dir}/${k}_y.json`)) });
(async () => {
  const tr = ler('treino');
  // validação: 15% das imagens ORIGINAIS (todas as variações dessa imagem ficam de fora do treino)
  const fontes = [...new Set(tr.src.map((s, i) => tr.y[i] + '/' + s))];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const val = new Set(fontes.filter(() => rnd() < 0.15));
  const idxT = [], idxV = [];
  tr.y.forEach((y, i) => (val.has(y + '/' + tr.src[i]) ? idxV : idxT).push(i));
  const pegar = (idx) => {
    const X = new Float32Array(idx.length * 1280);
    idx.forEach((i, k) => X.set(tr.E.subarray(i * 1280, (i + 1) * 1280), k * 1280));
    return [tf.tensor2d(X, [idx.length, 1280]), tf.oneHot(tf.tensor1d(idx.map((i) => tr.y[i]), 'int32'), classes.length)];
  };
  const [xt, yt] = pegar(idxT), [xv, yv] = pegar(idxV);
  const vs = tf.initializers.varianceScaling({ seed: 3.14 });
  const m = tf.sequential({ layers: [
    tf.layers.dense({ inputShape: [1280], units: 100, activation: 'relu', kernelInitializer: vs, useBias: true }),
    tf.layers.dropout({ rate: 0.3 }),
    tf.layers.dense({ units: classes.length, activation: 'softmax', kernelInitializer: vs, useBias: false }) ] });
  m.compile({ optimizer: tf.train.adam(0.001), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  let melhor = { val: Infinity, pesos: null, ep: 0 };
  await m.fit(xt, yt, { epochs: epocas, batchSize: 32, shuffle: true, validationData: [xv, yv], verbose: 0,
    callbacks: { onEpochEnd: async (ep, l) => {
      console.log(`época ${ep + 1}: acc ${l.acc.toFixed(3)} | val perda ${l.val_loss.toFixed(3)} val acc ${l.val_acc.toFixed(3)}`);
      if (l.val_loss < melhor.val) melhor = { val: l.val_loss, ep: ep + 1, pesos: m.getWeights().map((w) => ({ shape: w.shape, data: Array.from(w.dataSync()) })) };
    } } });
  console.log('melhor época', melhor.ep);
  m.setWeights(melhor.pesos.map((w) => tf.tensor(w.data, w.shape)));
  fs.writeFileSync(saida + '/cabeca.json', JSON.stringify(melhor.pesos));
  const resultados = {};
  for (const k of ['teste', 'teste_dificil']) {
    const d = ler(k);
    resultados[k] = { y: d.y, src: d.src, P: m.predict(tf.tensor2d(d.E, [d.y.length, 1280])).arraySync() };
  }
  fs.writeFileSync(saida + '/avaliacao.json', JSON.stringify({ classes, resultados }));
})();
