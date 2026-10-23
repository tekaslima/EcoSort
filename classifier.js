// =====================================================================
// EcoSort — classificação de imagens (Teachable Machine + TensorFlow.js)
// Toda a inteligência artificial corre no próprio telemóvel: as imagens
// não são enviadas para nenhum servidor.
// =====================================================================

const Classificador = (() => {
  let modelo = null;
  let classes = []; // [{ nome, categoria }]

  function normalizar(texto) {
    return texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  function categoriaDaClasse(nome) {
    const n = normalizar(nome);
    for (const regra of ECOSORT_MAPA_CLASSES) {
      if (regra.palavras.some((p) => n.includes(p))) return regra.categoria;
    }
    return null;
  }

  function urlBase(url) {
    url = url.trim();
    return url.endsWith("/") ? url : url + "/";
  }

  async function carregar(url) {
    if (typeof tmImage === "undefined") {
      throw new Error("A biblioteca de IA não foi carregada (pasta lib em falta?).");
    }
    const base = urlBase(url);
    modelo = await tmImage.load(base + "model.json", base + "metadata.json");
    classes = modelo.getClassLabels().map((nome) => ({
      nome,
      categoria: categoriaDaClasse(nome),
    }));
    const semCategoria = classes.filter((c) => !c.categoria).map((c) => c.nome);
    const presentes = new Set(classes.map((c) => c.categoria));
    const avisos = [];
    if (semCategoria.length) {
      avisos.push(
        `Classes sem categoria reconhecida (serão tratadas como "não classificável"): ${semCategoria.join(", ")}.`
      );
    }
    for (const cat of ["papel", "amarelo", "vidro"]) {
      if (!presentes.has(cat)) avisos.push(`O modelo não tem nenhuma classe para "${ECOSORT_CATEGORIAS[cat].material}".`);
    }
    return { classes, avisos, temVazio: presentes.has("vazio") };
  }

  function pronto() {
    return modelo !== null;
  }

  // Brilho médio da imagem (0–255), para detetar falta de luz.
  function brilhoMedio(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const { width, height } = canvas;
    const dados = ctx.getImageData(0, 0, width, height).data;
    let soma = 0;
    let n = 0;
    // Amostra 1 em cada 16 píxeis — chega para uma média.
    for (let i = 0; i < dados.length; i += 64) {
      soma += 0.299 * dados[i] + 0.587 * dados[i + 1] + 0.114 * dados[i + 2];
      n++;
    }
    return n ? soma / n : 0;
  }

  // Probabilidades de uma única imagem, na ordem de "classes".
  async function preverUma(canvas) {
    const resultado = await modelo.predict(canvas);
    const porNome = Object.fromEntries(resultado.map((r) => [r.className, r.probability]));
    return classes.map((c) => porNome[c.nome] ?? 0);
  }

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  // Analisa várias imagens seguidas e decide.
  // obterImagem(): devolve um <canvas> com a imagem atual da câmara.
  async function analisar(obterImagem, opcoes = {}) {
    const cfg = { ...ECOSORT_CONFIG, ...opcoes };
    const nFrames = Math.max(1, cfg.framesPorAnalise);
    const todas = [];
    let brilho = 0;
    let ultimaImagem = null;

    for (let i = 0; i < nFrames; i++) {
      const canvas = obterImagem();
      if (!canvas) throw new Error("Sem imagem da câmara.");
      ultimaImagem = canvas;
      brilho += brilhoMedio(canvas);
      todas.push(await preverUma(canvas));
      if (i < nFrames - 1) await esperar(cfg.intervaloFramesMs);
    }
    brilho /= nFrames;

    return decidir(todas, brilho, cfg, ultimaImagem);
  }

  // Regras de decisão — separadas para poderem ser lidas e testadas.
  // O modelo pode ter várias classes visuais para o mesmo destino (ex.: "Plástico"
  // e "Metal" vão ambas para o amarelo). A decisão é tomada sobre a soma das
  // probabilidades de cada destino: hesitar entre plástico e metal não impede
  // recomendar o amarelo, mas hesitar entre plástico e vidro impede.
  function decidir(todas, brilho, cfg, imagem) {
    const nC = classes.length;
    const catDe = (j) => classes[j].categoria || "outro";
    const porCategoria = (p) => {
      const r = {};
      p.forEach((v, j) => (r[catDe(j)] = (r[catDe(j)] || 0) + v));
      return r;
    };
    const melhor = (r) => Object.keys(r).sort((a, b) => r[b] - r[a]);

    const media = new Array(nC).fill(0);
    for (const p of todas) p.forEach((v, j) => (media[j] += v / todas.length));
    const mediaCat = porCategoria(media);
    const ordemCat = melhor(mediaCat);
    const cat = ordemCat[0];
    const confianca = mediaCat[cat];
    const margem = confianca - (ordemCat.length > 1 ? mediaCat[ordemCat[1]] : 0);
    const votos = todas.filter((p) => melhor(porCategoria(p))[0] === cat).length;
    const consistencia = votos / todas.length;

    // Classe visual mais provável dentro do destino escolhido (ex.: "Metal").
    let topClasse = -1;
    media.forEach((v, j) => {
      if (catDe(j) === cat && (topClasse < 0 || v > media[topClasse])) topClasse = j;
    });
    const nClassesCat = classes.filter((c, j) => catDe(j) === cat).length;
    const partilha = confianca > 0 ? media[topClasse] / confianca : 0;

    const detalhes = classes
      .map((c, j) => ({ nome: c.nome, categoria: c.categoria, prob: media[j] }))
      .sort((a, b) => b.prob - a.prob);

    const base = {
      confianca,
      margem,
      consistencia,
      brilho,
      detalhes,
      imagem,
      classeVencedora: classes[topClasse].nome,
      // Só se indica o material concreto se o destino tiver várias classes
      // e uma delas dominar claramente.
      materialProvavel: nClassesCat > 1 && partilha >= 0.75 ? classes[topClasse].nome : null,
    };

    if (brilho < cfg.brilhoMinimo) {
      return { ...base, estado: "pouca_luz" };
    }

    const seguro =
      confianca >= cfg.confiancaMinima &&
      margem >= cfg.margemMinima &&
      consistencia >= cfg.consistenciaMinima;

    if (cat === "vazio") {
      return { ...base, estado: seguro ? "vazio" : "incerto", categoria: null };
    }
    if (cat === "outro") {
      return { ...base, estado: "nao_classificavel", categoria: null };
    }
    if (seguro) {
      return { ...base, estado: "certo", categoria: cat };
    }
    return {
      ...base,
      estado: "incerto",
      // Só se mostra uma sugestão se houver alguma evidência.
      sugestao: confianca >= cfg.confiancaSugestao ? cat : null,
      categoria: null,
    };
  }

  return { carregar, pronto, analisar, decidir, getClasses: () => classes };
})();
