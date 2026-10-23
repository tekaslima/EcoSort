// =====================================================================
// EcoSort — lógica da interface
// =====================================================================

const $ = (id) => document.getElementById(id);

// ---------- Armazenamento local (pode falhar em modo privado) ----------
function lerLocal(chave, padrao) {
  try {
    const v = localStorage.getItem(chave);
    return v === null ? padrao : JSON.parse(v);
  } catch (_) {
    return padrao;
  }
}
function guardarLocal(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch (_) {}
}

const PADROES = { ...ECOSORT_CONFIG };
const definicoes = {
  modelUrl: lerLocal("ecosort.modelUrl", ECOSORT_CONFIG.modelUrl),
  confiancaMinima: lerLocal("ecosort.confiancaMinima", ECOSORT_CONFIG.confiancaMinima),
  margemMinima: lerLocal("ecosort.margemMinima", ECOSORT_CONFIG.margemMinima),
  framesPorAnalise: lerLocal("ecosort.framesPorAnalise", ECOSORT_CONFIG.framesPorAnalise),
};

function escapar(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const pct = (v) => Math.round(v * 100) + "%";

// =====================================================================
// Separadores
// =====================================================================
document.querySelectorAll(".sep").forEach((b) =>
  b.addEventListener("click", () => mostrarVista(b.dataset.vista))
);
function mostrarVista(nome) {
  for (const v of ["Identificar", "Passadeira", "Testes", "Definicoes"]) {
    $("vista" + v).hidden = v !== nome;
  }
  document.querySelectorAll(".sep").forEach((b) => b.classList.toggle("ativo", b.dataset.vista === nome));
  $("seccaoCamara").hidden = !(nome === "Identificar" || nome === "Passadeira");
  if (nome === "Testes") desenharTestes();
  window.scrollTo(0, 0);
}
$("pilulaArduino").addEventListener("click", () => mostrarVista("Passadeira"));

// =====================================================================
// Modelo de IA
// =====================================================================
function aviso(html, tipo = "") {
  const el = $("avisoModelo");
  el.className = "aviso " + tipo;
  el.innerHTML = html;
  el.hidden = !html;
}

async function iniciarModelo() {
  aviso('<span class="spinner" style="border-color:#2e8b5755;border-top-color:#2e8b57;display:inline-block;vertical-align:middle"></span> A carregar o modelo de IA…');
  $("infoModelo").textContent = "";
  try {
    const { classes, avisos, temVazio } = await Classificador.carregar(definicoes.modelUrl);
    aviso(avisos.length ? "<strong>Modelo carregado, com avisos:</strong><br>" + avisos.map(escapar).join("<br>") : "", avisos.length ? "aviso-alerta" : "");
    $("infoModelo").innerHTML =
      "<strong>Classes do modelo:</strong><br>" +
      classes
        .map((c) => `${escapar(c.nome)} → ${c.categoria ? escapar(nomeCategoria(c.categoria)) : "<em>sem categoria</em>"}`)
        .join("<br>") +
      (temVazio
        ? ""
        : '<br><br>Este modelo não tem a classe "Vazio": sem objeto à frente da câmara, a resposta será "Não tenho certeza" ou "Não consigo classificar".');
  } catch (e) {
    console.warn(e);
    aviso(
      "<strong>Modelo de IA não encontrado.</strong> A aplicação está em <em>modo demonstração</em>. " +
        "Treine o modelo no Teachable Machine e coloque-o na pasta <code>modelo</code> ou indique o endereço em Definições.",
      "aviso-alerta"
    );
    $("infoModelo").textContent = "Erro: " + (e.message || e);
  }
}

function nomeCategoria(cat) {
  if (ECOSORT_CATEGORIAS[cat]) return ECOSORT_CATEGORIAS[cat].material;
  return { vazio: "Vazio (sem objeto)", outro: "Outro / não classificável" }[cat] || cat;
}

// =====================================================================
// Câmara
// =====================================================================
let stream = null;
let usarFoto = false;
const video = $("video");

function erroCamara(texto) {
  $("erroCamara").textContent = texto;
  $("erroCamara").hidden = !texto;
}

// Abre a aplicação de câmara do telemóvel para tirar uma fotografia.
// É a alternativa quando a câmara em direto não está disponível.
function abrirCamaraNativa() {
  $("inputCamaraNativa").click();
}

// A página pode estar dentro de uma moldura que proíbe a câmara em direto
// (por exemplo, quando publicada no claude.ai).
function camaraEmDiretoPermitida() {
  const politica = document.permissionsPolicy || document.featurePolicy;
  try {
    return politica ? politica.allowsFeature("camera") : true;
  } catch (_) {
    return true;
  }
}

async function ligarCamara() {
  erroCamara("");
  if (!navigator.mediaDevices?.getUserMedia || !camaraEmDiretoPermitida()) {
    erroCamara("A câmara em direto não está disponível aqui. Tire a fotografia com a câmara do telemóvel.");
    abrirCamaraNativa();
    return false;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
  } catch (e) {
    erroCamara(
      e.name === "NotAllowedError"
        ? "A câmara em direto foi bloqueada. Tire a fotografia com a câmara do telemóvel, ou permita a câmara (ícone junto ao endereço) e toque de novo em «Usar câmara»."
        : "Não foi possível ligar a câmara em direto (" + e.message + "). Tire a fotografia com a câmara do telemóvel."
    );
    abrirCamaraNativa();
    return false;
  }
  video.srcObject = stream;
  await video.play().catch(() => {});
  usarFoto = false;
  $("fotoCarregada").hidden = true;
  video.hidden = false;
  $("camaraDesligada").hidden = true;
  $("btnCamara").textContent = "Desligar câmara";
  return true;
}

function desligarCamara() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
  $("camaraDesligada").hidden = usarFoto;
  $("btnCamara").textContent = "Usar câmara";
}

$("btnCamara").addEventListener("click", () => (stream ? desligarCamara() : ligarCamara()));

function aoEscolherFoto(ev) {
  const ficheiro = ev.target.files[0];
  if (!ficheiro) return;
  desligarCamara();
  const img = $("fotoCarregada");
  erroCamara("");
  img.onload = () => {
    usarFoto = true;
    img.hidden = false;
    video.hidden = true;
    $("camaraDesligada").hidden = true;
    identificar();
  };
  img.src = URL.createObjectURL(ficheiro);
  ev.target.value = "";
}
$("inputFoto").addEventListener("change", aoEscolherFoto);
$("inputCamaraNativa").addEventListener("change", aoEscolherFoto);

// Devolve um canvas 224×224 com o quadrado central da imagem atual.
function obterImagem() {
  const fonte = usarFoto ? $("fotoCarregada") : video;
  const w = usarFoto ? fonte.naturalWidth : fonte.videoWidth;
  const h = usarFoto ? fonte.naturalHeight : fonte.videoHeight;
  if (!w || !h) return null;
  const lado = Math.min(w, h);
  const c = document.createElement("canvas");
  c.width = c.height = 224;
  c.getContext("2d").drawImage(fonte, (w - lado) / 2, (h - lado) / 2, lado, lado, 0, 0, 224, 224);
  return c;
}

const imagemDisponivel = () => usarFoto || (stream && video.videoWidth > 0);

// =====================================================================
// Identificação manual
// =====================================================================
let ultimaDecisao = null;

$("btnIdentificar").addEventListener("click", identificar);

async function identificar() {
  if (!Classificador.pronto()) {
    $("escolhaDemo").hidden = false;
    $("escolhaDemo").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (!imagemDisponivel()) {
    const ok = await ligarCamara();
    if (!ok) return;
    await new Promise((r) => setTimeout(r, 800)); // deixa a câmara ajustar a exposição
  }
  $("btnIdentificar").disabled = true;
  $("aAnalisar").hidden = false;
  try {
    const dec = await Classificador.analisar(obterImagem, {
      ...definicoes,
      framesPorAnalise: usarFoto ? 1 : definicoes.framesPorAnalise,
      consistenciaMinima: usarFoto ? 0 : ECOSORT_CONFIG.consistenciaMinima,
    });
    mostrarResultado(dec);
  } catch (e) {
    console.error(e);
    mostrarResultado({ estado: "erro", mensagem: e.message });
  } finally {
    $("btnIdentificar").disabled = false;
    $("aAnalisar").hidden = true;
  }
}

document.querySelectorAll(".demo").forEach((b) =>
  b.addEventListener("click", () => {
    const cat = b.dataset.cat;
    const img = imagemDisponivel() ? obterImagem() : null;
    mostrarResultado(
      cat === "incerto"
        ? { estado: "incerto", sugestao: null, demo: true, imagem: img }
        : { estado: "certo", categoria: cat, confianca: 1, demo: true, imagem: img }
    );
  })
);

function mostrarResultado(dec) {
  ultimaDecisao = dec;
  const el = $("resultado");
  el.hidden = false;
  el.className = "cartao resultado";
  const mini = dec.imagem ? `<img class="miniatura" src="${dec.imagem.toDataURL("image/jpeg", 0.8)}" alt="Imagem analisada">` : "";
  const etiquetaDemo = dec.demo ? " (demonstração)" : "";
  let html = "";

  if (dec.estado === "certo") {
    const c = ECOSORT_CATEGORIAS[dec.categoria];
    html = `
      <div class="resultado-cabecalho" style="background:${c.cor};color:${c.corTexto}">
        <div class="simbolo-ecoponto" aria-hidden="true">${c.simbolo}</div>
        <div>
          <p class="rotulo">Material identificado${etiquetaDemo}</p>
          <p class="material">${c.material}</p>
          ${dec.materialProvavel ? `<p class="rotulo">Parece: ${escapar(dec.materialProvavel)}</p>` : ""}
          <p class="ecoponto">→ ${c.ecoponto}</p>
        </div>${mini}
      </div>
      <div class="resultado-corpo">
        ${dec.demo ? "" : `<small>Confiança do modelo: ${pct(dec.confianca)}</small><div class="barra"><span style="width:${pct(dec.confianca)}"></span></div>`}
        <p>${c.explicacao}</p>
        ${c.aviso ? `<p class="aviso aviso-alerta">${c.aviso}</p>` : ""}
        <strong>Como separar corretamente:</strong>
        <ul>${c.instrucoes.map((i) => `<li>${i}</li>`).join("")}</ul>
        ${detalhesHtml(dec)}${feedbackHtml(dec)}
      </div>`;
  } else {
    el.classList.add("incerto");
    const textos = {
      incerto: {
        titulo: "Não tenho certeza",
        texto: dec.sugestao
          ? `Pode ser <strong>${escapar(nomeCategoria(dec.sugestao))}</strong>, mas a evidência não chega para recomendar um ecoponto.`
          : "As imagens não são suficientemente claras para identificar o material.",
      },
      vazio: { titulo: "Nenhum resíduo detetado", texto: "Coloque o resíduo dentro do quadrado e tente de novo." },
      nao_classificavel: {
        titulo: "Não consigo classificar este objeto",
        texto: "Não parece pertencer a nenhuma das três categorias. Verifique as regras do seu município (pode ser lixo indiferenciado, pilhas, eletrónica…).",
      },
      pouca_luz: { titulo: "Pouca luz", texto: "A imagem está demasiado escura. Aumente a iluminação e tente de novo." },
      erro: { titulo: "Ocorreu um erro", texto: escapar(dec.mensagem || "") },
    }[dec.estado];
    html = `
      <div class="resultado-cabecalho">
        <div class="simbolo-ecoponto" aria-hidden="true">${dec.estado === "pouca_luz" ? "💡" : "❔"}</div>
        <div><p class="material">${textos.titulo}</p></div>${mini}
      </div>
      <div class="resultado-corpo">
        <p>${textos.texto}</p>
        <strong>Para uma nova imagem:</strong>
        <ul>
          <li>Use um fundo liso e boa iluminação, sem reflexos fortes.</li>
          <li>Mostre o objeto inteiro, centrado no quadrado.</li>
          <li>Rode o objeto para mostrar o rótulo ou a forma.</li>
        </ul>
        <div class="botoes"><button class="btn btn-principal" type="button" id="btnNovaImagem">Tentar com nova imagem</button></div>
        ${detalhesHtml(dec)}${dec.estado === "erro" ? "" : feedbackHtml(dec)}
      </div>`;
  }
  el.innerHTML = html;
  $("btnNovaImagem")?.addEventListener("click", identificar);
  el.querySelectorAll("[data-real]").forEach((b) =>
    b.addEventListener("click", () => registarTeste(b.dataset.real))
  );
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function detalhesHtml(dec) {
  if (!dec.detalhes) return "";
  return `<details><summary>Detalhes técnicos</summary>
    <div class="prob">${dec.detalhes.map((d) => `<span>${escapar(d.nome)}</span><span>${pct(d.prob)}</span>`).join("")}</div>
    <p class="pequeno">Margem para a 2.ª classe: ${pct(dec.margem)} · Imagens concordantes: ${pct(dec.consistencia)} · Brilho: ${Math.round(dec.brilho)}</p>
  </details>`;
}

function feedbackHtml(dec) {
  if (dec.demo || !admin) return "";
  return `<div class="feedback" id="feedback">
    <p>Para os testes: o que era realmente?</p>
    <div class="grelha-demo">
      <button class="btn demo" type="button" data-real="papel">Papel/cartão</button>
      <button class="btn demo" type="button" data-real="amarelo">Plástico/metal</button>
      <button class="btn demo" type="button" data-real="vidro">Vidro</button>
      <button class="btn demo" type="button" data-real="outro">Outro</button>
    </div></div>`;
}

// =====================================================================
// Registo de testes
// =====================================================================
let testes = lerLocal("ecosort.testes", []);
const COLUNAS_PREVISTO = ["papel", "amarelo", "vidro", "sem_decisao"];
const LINHAS_REAL = ["papel", "amarelo", "vidro", "outro"];

function previstoDe(dec) {
  return dec.estado === "certo" ? dec.categoria : "sem_decisao";
}

function registarTeste(real) {
  const d = ultimaDecisao;
  if (!d) return;
  testes.push({
    data: new Date().toISOString(),
    real,
    previsto: previstoDe(d),
    estado: d.estado,
    classe: d.classeVencedora || "",
    confianca: d.confianca != null ? +d.confianca.toFixed(3) : "",
    brilho: d.brilho != null ? Math.round(d.brilho) : "",
  });
  guardarLocal("ecosort.testes", testes);
  const fb = $("feedback");
  if (fb) fb.innerHTML = `<p>✔ Teste n.º ${testes.length} registado. Obrigado!</p>`;
}

function rotuloCurto(c) {
  return { papel: "Azul", amarelo: "Amarelo", vidro: "Verde", sem_decisao: "Sem decisão", outro: "Outro" }[c];
}

function desenharTestes() {
  const n = testes.length;
  const decididos = testes.filter((t) => t.previsto !== "sem_decisao");
  const certos = decididos.filter((t) => t.previsto === t.real).length;
  // Um objeto "outro" corretamente recusado também é uma boa resposta.
  const recusasCorretas = testes.filter((t) => t.real === "outro" && t.previsto === "sem_decisao").length;
  $("resumoTestes").innerHTML = n
    ? `<div class="kpis">
        <div class="kpi"><strong>${n}</strong><small>testes</small></div>
        <div class="kpi"><strong>${decididos.length ? pct(certos / decididos.length) : "—"}</strong><small>acerto quando decide</small></div>
        <div class="kpi"><strong>${pct(decididos.length / n)}</strong><small>taxa de decisão</small></div>
      </div>
      <p class="pequeno">Encaminhamentos errados: <strong>${decididos.length - certos}</strong> · Recusas corretas de "outro": ${recusasCorretas}.
      ${n < 30 ? "<br>⚠ Ainda há poucos testes para tirar conclusões (recomendado: pelo menos 20 por categoria)." : ""}</p>`
    : '<p class="pequeno">Ainda não há testes registados.</p>';

  let t = "<tr><th>Real ↓ / Previsto →</th>" + COLUNAS_PREVISTO.map((c) => `<th>${rotuloCurto(c)}</th>`).join("") + "</tr>";
  for (const r of LINHAS_REAL) {
    t += `<tr><th>${rotuloCurto(r)}</th>`;
    for (const c of COLUNAS_PREVISTO) {
      const v = testes.filter((x) => x.real === r && x.previsto === c).length;
      t += `<td class="${r === c ? "diag" : ""}">${v}</td>`;
    }
    t += "</tr>";
  }
  $("matriz").innerHTML = t;

  // Lista dos testes, do mais recente para o mais antigo, com correção do material real.
  const opcoes = LINHAS_REAL.map((r) => [r, { papel: "Papel/cartão", amarelo: "Plástico/metal", vidro: "Vidro", outro: "Outro" }[r]]);
  $("listaTestes").innerHTML = testes
    .map((x, i) => ({ x, i }))
    .reverse()
    .map(
      ({ x, i }) => `<li>
        <span class="n">N.º ${i + 1}</span>
        <span class="prev">App: <strong>${rotuloCurto(x.previsto)}</strong></span>
        <label class="real">Real:
          <select data-teste="${i}" aria-label="Material real do teste ${i + 1}">
            ${opcoes.map(([v, t]) => `<option value="${v}"${v === x.real ? " selected" : ""}>${t}</option>`).join("")}
          </select>
        </label>
        <button class="apagar" type="button" data-apagar="${i}" aria-label="Apagar teste ${i + 1}">✕</button>
      </li>`
    )
    .join("");
}

$("listaTestes").addEventListener("change", (ev) => {
  const i = ev.target.dataset.teste;
  if (i === undefined || !testes[i]) return;
  testes[i].real = ev.target.value;
  guardarLocal("ecosort.testes", testes);
  desenharTestes();
});
$("listaTestes").addEventListener("click", (ev) => {
  const i = ev.target.dataset?.apagar;
  if (i === undefined || !testes[i]) return;
  testes.splice(+i, 1);
  guardarLocal("ecosort.testes", testes);
  desenharTestes();
});

function testesCsv() {
  const cab = ["n", "data", "real", "previsto", "estado", "classe", "confianca", "brilho"];
  return [cab.join(";")]
    .concat(testes.map((t, i) => cab.map((k) => String(k === "n" ? i + 1 : t[k]).replace(/;/g, ",")).join(";")))
    .join("\n");
}

// Copiar funciona em todo o lado (incluindo no claude.ai, onde os downloads são bloqueados).
$("btnCopiar").addEventListener("click", () => {
  const csv = testesCsv();
  const caixa = $("textoTestes");
  const mostrarCaixa = (msg) => {
    caixa.value = csv;
    caixa.hidden = false;
    caixa.focus();
    caixa.select();
    $("estadoCopia").textContent = msg;
  };
  try {
    navigator.clipboard
      .writeText(csv)
      .then(() => ($("estadoCopia").textContent = `✔ ${testes.length} testes copiados. Cole-os numa mensagem ou numa folha de cálculo.`))
      .catch(() => mostrarCaixa("Não foi possível copiar automaticamente. O texto está selecionado abaixo: copie-o à mão."));
  } catch (_) {
    mostrarCaixa("Não foi possível copiar automaticamente. O texto está selecionado abaixo: copie-o à mão.");
  }
});

$("btnExportar").addEventListener("click", () => {
  const csv = testesCsv();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
  a.download = "ecosort-testes.csv";
  a.click();
});

// Apagar pede um segundo toque para confirmar (sem janelas de diálogo).
let confirmarApagar = null;
$("btnLimparTestes").addEventListener("click", () => {
  const btn = $("btnLimparTestes");
  if (!confirmarApagar) {
    btn.textContent = `Tocar de novo para apagar ${testes.length} testes`;
    confirmarApagar = setTimeout(() => {
      confirmarApagar = null;
      btn.textContent = "Apagar testes";
    }, 4000);
    return;
  }
  clearTimeout(confirmarApagar);
  confirmarApagar = null;
  btn.textContent = "Apagar testes";
  testes = [];
  guardarLocal("ecosort.testes", testes);
  desenharTestes();
});

// =====================================================================
// Passadeira / Arduino
// =====================================================================
const suporte = suporteLigacoes();
let cicloAtivo = false;
let aProcessar = false;
let wakeLock = null;
const contagem = { P: 0, A: 0, V: 0, X: 0 };

function atualizarInfoLigacao() {
  const tipo = $("tipoLigacao").value;
  const textos = {
    serial: suporte.serial
      ? "Android: emparelhe primeiro o HC-05/HC-06 nas definições de Bluetooth do telemóvel (PIN habitual 1234 ou 0000). Computador: ligue o Arduino por USB."
      : "⚠ Este navegador não suporta Web Serial. Use o Chrome para Android (versão 137 ou superior) ou o Chrome/Edge num computador.",
    ble: suporte.ble
      ? "Escolha o módulo BLE na lista (ex.: HMSoft, BT05, ESP32)."
      : "⚠ Este navegador não suporta Web Bluetooth (o Safari do iPhone não suporta). Use o Chrome para Android.",
    simulador: "Simula o Arduino dentro da aplicação. Útil para testar o funcionamento antes de ter o hardware montado.",
  };
  $("infoLigacao").textContent = textos[tipo];
  $("btnLigar").disabled = !suporte[tipo] || Ligacao.getEstado() !== "desligado";
}
$("tipoLigacao").addEventListener("change", atualizarInfoLigacao);

function registo(texto) {
  const li = document.createElement("li");
  li.textContent = new Date().toLocaleTimeString("pt-PT") + "  " + texto;
  const lista = $("registo");
  lista.prepend(li);
  while (lista.children.length > 80) lista.lastChild.remove();
}

Ligacao.on("estado", (estado, detalhe, tipo) => {
  const nomes = {
    desligado: "Arduino desligado",
    "a ligar": "A ligar…",
    ligado: tipo === "simulador" ? "Simulador ligado" : "Arduino ligado",
    "sem resposta": "Arduino sem resposta",
    erro: "Erro de ligação",
  };
  $("pilulaArduino").dataset.estado = estado;
  $("textoArduino").textContent = nomes[estado];
  const ligado = estado === "ligado" || estado === "sem resposta";
  $("btnLigar").disabled = estado !== "desligado" && estado !== "erro";
  $("btnDesligar").disabled = estado === "desligado";
  $("btnIniciar").disabled = !ligado;
  $("btnParar").disabled = !ligado;
  if (detalhe) registo(detalhe);
  if (estado === "sem resposta") {
    $("estadoCiclo").textContent = "⚠ Sem resposta do Arduino — a passadeira deve parar sozinha por segurança.";
  }
  if (estado === "erro" || estado === "desligado") pararCicloLocal("Ligação terminada.");
  if (estado === "desligado" || estado === "erro") atualizarInfoLigacao();
});

Ligacao.on("mensagem", (linha) => {
  registo("← " + linha);
  if (linha === "OBJ") aoObjeto();
  else if (linha.startsWith("DONE:")) {
    const c = linha[5];
    if (c in contagem) {
      contagem[c]++;
      $("cnt" + c).textContent = contagem[c];
    }
  } else if (linha === "HOLD") mostrarHold($("motivoHold").textContent || "O Arduino parou a passadeira.");
  else if (linha === "ERR:TIMEOUT") $("motivoHold").textContent = "O Arduino não recebeu a decisão a tempo.";
  else if (linha === "ERR:SEMLIGACAO") mostrarHold("O Arduino deixou de receber sinal do telemóvel.");
  else if (linha === "READY" && cicloAtivo) {
    // O Arduino reiniciou a meio do ciclo (ex.: falha de energia).
    pararCicloLocal("O Arduino reiniciou. Verifique a alimentação e volte a iniciar.");
  }
});

$("btnLigar").addEventListener("click", async () => {
  try {
    await Ligacao.ligar($("tipoLigacao").value);
  } catch (e) {
    registo("Falha ao ligar: " + (e.message || e));
  }
});
$("btnDesligar").addEventListener("click", () => Ligacao.desligar());

$("btnIniciar").addEventListener("click", async () => {
  if (Classificador.pronto() && !stream) {
    const ok = await ligarCamara();
    if (!ok) return;
  }
  esconderHold();
  const ok = await Ligacao.comando("START", "ACK:START");
  if (!ok) {
    registo("O Arduino não confirmou o arranque.");
    return;
  }
  cicloAtivo = true;
  $("estadoCiclo").textContent = "▶ Em funcionamento — à espera de objeto";
  try {
    wakeLock = await navigator.wakeLock?.request("screen");
  } catch (_) {}
});

$("btnParar").addEventListener("click", async () => {
  pararCicloLocal("Parado pelo operador.");
  const ok = await Ligacao.comando("STOP", "ACK:STOP");
  if (!ok) registo("⚠ O Arduino não confirmou a paragem! Desligue a alimentação dos motores.");
});

$("btnRetomar").addEventListener("click", async () => {
  esconderHold();
  const ok = await Ligacao.comando("START", "ACK:START");
  if (ok) {
    cicloAtivo = true;
    $("estadoCiclo").textContent = "▶ Em funcionamento — à espera de objeto";
  } else registo("O Arduino não confirmou o arranque.");
});

function pararCicloLocal(motivo) {
  cicloAtivo = false;
  if (cancelarManual) cancelarManual();
  $("estadoCiclo").textContent = "■ Parado. " + (motivo || "");
  try {
    wakeLock?.release();
  } catch (_) {}
  wakeLock = null;
}
function mostrarHold(motivo) {
  $("motivoHold").textContent = motivo;
  $("avisoHold").hidden = false;
  $("estadoCiclo").textContent = "⏸ Em espera — precisa do operador";
}
function esconderHold() {
  $("avisoHold").hidden = true;
  $("motivoHold").textContent = "";
}

// Espera que o operador escolha o destino (modo demonstração).
// Se o ciclo parar entretanto, a espera é cancelada com "X".
let cancelarManual = null;
function esperarDecisaoManual() {
  $("decisaoManual").hidden = false;
  return new Promise((resolver) => {
    const botoes = document.querySelectorAll(".demo-pass");
    const terminar = (code) => {
      botoes.forEach((b) => b.removeEventListener("click", escolher));
      $("decisaoManual").hidden = true;
      cancelarManual = null;
      resolver(code);
    };
    const escolher = (ev) => terminar(ev.currentTarget.dataset.code);
    cancelarManual = () => terminar("X");
    botoes.forEach((b) => b.addEventListener("click", escolher));
  });
}

// O Arduino parou um objeto na zona da câmara e espera uma decisão.
async function aoObjeto() {
  if (aProcessar || !cicloAtivo) return;
  aProcessar = true;
  let code = "X";
  let motivo = "";
  try {
    $("estadoCiclo").textContent = "🔍 A identificar objeto…";
    if (!Classificador.pronto()) {
      code = await esperarDecisaoManual();
    } else if (!imagemDisponivel()) {
      motivo = "A câmara está desligada.";
    } else {
      $("aAnalisar").hidden = false;
      const dec = await Classificador.analisar(obterImagem, definicoes);
      $("aAnalisar").hidden = true;
      mostrarResultado(dec);
      if (dec.estado === "certo") code = ECOSORT_CATEGORIAS[dec.categoria].code;
      else if (dec.estado === "vazio") code = "E";
      else
        motivo =
          {
            incerto: "Identificação incerta",
            nao_classificavel: "Objeto não classificável",
            pouca_luz: "Pouca luz",
          }[dec.estado] + (dec.confianca != null ? ` (confiança ${pct(dec.confianca)}).` : ".");
      registo(`Decisão: ${dec.estado} → ${code}` + (dec.confianca != null ? ` (${pct(dec.confianca)})` : ""));
    }
  } catch (e) {
    $("aAnalisar").hidden = true;
    motivo = "Erro na identificação: " + e.message;
    code = "X";
  }

  if (!cicloAtivo) {
    aProcessar = false;
    return;
  }
  registo("→ C:" + code);
  const ok = await Ligacao.comando("C:" + code, "ACK:" + code);
  aProcessar = false;
  if (!ok) {
    pararCicloLocal("Falha de comunicação: o Arduino não confirmou o comando.");
    Ligacao.comando("STOP", "ACK:STOP");
    return;
  }
  if (code === "X") {
    contagem.X++;
    $("cntX").textContent = contagem.X;
    cicloAtivo = false;
    mostrarHold(motivo || "Objeto rejeitado.");
  } else if (code === "E") {
    $("estadoCiclo").textContent = "▶ Zona vazia — a avançar";
  } else {
    const cat = Object.values(ECOSORT_CATEGORIAS).find((c) => c.code === code);
    $("estadoCiclo").textContent = `▶ A encaminhar para o ${cat.ecoponto.toLowerCase()}`;
  }
}

// =====================================================================
// Definições
// =====================================================================
function mostrarDefinicoes() {
  $("inputModelo").value = definicoes.modelUrl;
  $("rangeConf").value = definicoes.confiancaMinima;
  $("rangeMargem").value = definicoes.margemMinima;
  $("rangeFrames").value = definicoes.framesPorAnalise;
  $("valConf").textContent = pct(definicoes.confiancaMinima);
  $("valMargem").textContent = pct(definicoes.margemMinima);
  $("valFrames").textContent = definicoes.framesPorAnalise;
}
function ligarRange(id, chave, conversor) {
  $(id).addEventListener("input", () => {
    definicoes[chave] = conversor($(id).value);
    guardarLocal("ecosort." + chave, definicoes[chave]);
    mostrarDefinicoes();
  });
}
ligarRange("rangeConf", "confiancaMinima", parseFloat);
ligarRange("rangeMargem", "margemMinima", parseFloat);
ligarRange("rangeFrames", "framesPorAnalise", (v) => parseInt(v, 10));

$("btnRepor").addEventListener("click", () => {
  for (const k of ["confiancaMinima", "margemMinima", "framesPorAnalise"]) {
    definicoes[k] = PADROES[k];
    guardarLocal("ecosort." + k, PADROES[k]);
  }
  mostrarDefinicoes();
});

$("btnCarregarModelo").addEventListener("click", () => {
  definicoes.modelUrl = $("inputModelo").value.trim() || PADROES.modelUrl;
  guardarLocal("ecosort.modelUrl", definicoes.modelUrl);
  iniciarModelo();
});

// =====================================================================
// Arranque
// =====================================================================
if (!window.isSecureContext) {
  aviso(
    "<strong>Atenção:</strong> a página não foi aberta por <code>https://</code>. O navegador vai bloquear a câmara e o Bluetooth. Veja o GUIA, etapa 3.",
    "aviso-erro"
  );
}
// =====================================================================
// Secções visíveis e modo de administrador
// =====================================================================
// O separador "Testes" e o registo de testes só aparecem ao administrador:
// - no claude.ai: o dono da página (ou quem a pode editar);
// - noutro alojamento: abrindo o endereço com #admin no fim (fica memorizado
//   neste telemóvel; #sair desliga). Isto só esconde a interface: não é uma
//   proteção de segurança, e os testes ficam guardados em cada telemóvel.
let admin = false;

function aplicarSeccoes() {
  const passadeira = ECOSORT_CONFIG.mostrarPassadeira;
  $("sepPassadeira").hidden = !passadeira;
  $("pilulaArduino").hidden = !passadeira;
  $("sepTestes").hidden = !admin;
  const atual = document.querySelector(".sep.ativo")?.dataset.vista;
  if ((atual === "Passadeira" && !passadeira) || (atual === "Testes" && !admin)) mostrarVista("Identificar");
  $("feedback")?.toggleAttribute("hidden", !admin);
}

async function verificarAdmin() {
  if (location.hash === "#admin") guardarLocal("ecosort.admin", true);
  if (location.hash === "#sair") guardarLocal("ecosort.admin", false);
  admin = lerLocal("ecosort.admin", false) === true;
  aplicarSeccoes();
  if (window.claude?.use) {
    try {
      const user = await window.claude.use("user");
      admin = (await user?.isOwner()) || (await user?.canEdit()) || false;
    } catch (_) {
      admin = false;
    }
    aplicarSeccoes();
  }
}
window.addEventListener("hashchange", verificarAdmin);

aplicarSeccoes();
verificarAdmin();
mostrarDefinicoes();
atualizarInfoLigacao();
if (window.isSecureContext) iniciarModelo();
else $("infoModelo").textContent = "Abra a aplicação por https:// para carregar o modelo.";
