// Monta o modelo final (MobileNet truncada + cabeça) com a biblioteca do Teachable Machine (tfjs 1.3.1).
const tf = require('../pk/node_modules/@tensorflow/tfjs');
const tm = require('../pk/node_modules/@teachablemachine/image');
const fs = require('fs');
const [dir, saida] = [process.argv[2], process.argv[3]];
const classes = JSON.parse(fs.readFileSync(dir + '/classes.json'));
const pesos = JSON.parse(fs.readFileSync(saida + '/cabeca.json'));
const aval = JSON.parse(fs.readFileSync(saida + '/avaliacao.json'));
(async () => {
  const truncada = await tm.createTeachable({}, { checkpointUrl: 'http://localhost:8770/model.json', trainingLayer: 'out_relu' }).then((t) => t.truncatedModel);
  const cabeca = tf.sequential({ layers: [
    tf.layers.dense({ inputShape: [1280], units: 100, activation: 'relu', useBias: true }),
    tf.layers.dense({ units: classes.length, activation: 'softmax', useBias: false }) ] });
  cabeca.setWeights(pesos.map((w) => tf.tensor(w.data, w.shape)));
  const modelo = tf.sequential();
  modelo.add(truncada);
  modelo.add(cabeca);
  // Verificação com imagens de teste em bruto
  const buf = fs.readFileSync(dir + '/teste_X.u8');
  let dif = 0;
  for (let i = 0; i < 8; i++) {
    const p = tf.tidy(() => modelo.predict(tf.tensor4d(new Uint8Array(buf.buffer, buf.byteOffset + i * 150528, 150528), [1, 224, 224, 3], 'int32').toFloat().div(127).sub(1)).dataSync());
    p.forEach((v, j) => (dif = Math.max(dif, Math.abs(v - aval.resultados.teste.P[i][j]))));
  }
  console.log('diferença máxima vs. treino:', dif.toFixed(5));
  await modelo.save(tf.io.withSaveHandler(async (a) => {
    fs.writeFileSync(saida + '/weights.bin', Buffer.from(a.weightData));
    fs.writeFileSync(saida + '/model.json', JSON.stringify({ modelTopology: a.modelTopology, format: 'layers-model', generatedBy: 'TensorFlow.js tfjs-layers v1.3.1', convertedBy: null, weightsManifest: [{ paths: ['weights.bin'], weights: a.weightSpecs }] }));
    return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
  }));
  fs.writeFileSync(saida + '/metadata.json', JSON.stringify({
    tfjsVersion: '1.3.1', tmVersion: '2.4.5', packageVersion: '0.8.5', packageName: '@teachablemachine/image',
    timeStamp: new Date().toISOString(), userMetadata: { origem: 'Modelo inicial EcoSort treinado com o conjunto TrashNet (licença MIT)' },
    modelName: 'ecosort-inicial-trashnet', grayscale: false, labels: classes, imageSize: 224 }, null, 1));
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
