// =====================================================================
// EcoSort — configuração
// Este é o ÚNICO ficheiro que normalmente precisa de alterar.
// =====================================================================

const ECOSORT_CONFIG = {
  // Onde está o modelo do Teachable Machine.
  // "./modelo_v2/": versão 2 (fotos públicas + fotos do grupo) — padrão.
  // "./modelo/": modelo inicial (só fotos públicas TrashNet).
  // Para um modelo vosso: copie model.json, metadata.json e weights.bin
  //   para uma pasta e indique-a aqui (ex.: "./modelo_v3/").
  // Opção B: cole o link de partilha do Teachable Machine, por exemplo
  //   "https://teachablemachine.withgoogle.com/models/AbCdEf123/"
  // Também pode alterar este valor na própria aplicação (separador Definições).
  modelUrl: "./modelo_v2/",

  // --- Regras de decisão (ver GUIA.md, etapa 6, para as afinar) ---
  // Quantas imagens seguidas são analisadas e combinadas em cada identificação.
  framesPorAnalise: 8,
  // Intervalo entre imagens (milissegundos).
  intervaloFramesMs: 120,
  // Confiança média mínima da classe vencedora para dar uma resposta "certa".
  confiancaMinima: 0.80,
  // Diferença mínima entre a 1.ª e a 2.ª classe (evita empates 50/50).
  margemMinima: 0.25,
  // Percentagem mínima de imagens que têm de concordar com a decisão final.
  consistenciaMinima: 0.75,
  // Abaixo deste valor nem sequer se sugere uma categoria provável.
  confiancaSugestao: 0.55,
  // Brilho médio mínimo (0–255). Abaixo disto pede-se mais luz.
  brilhoMinimo: 45,

  // --- Secções da aplicação ---
  // false: esconde o separador "Passadeira" e o estado do Arduino.
  mostrarPassadeira: false,

  // --- Ligação ao Arduino ---
  // Tempo máximo à espera da confirmação (ACK) de um comando.
  timeoutAckMs: 1500,
  // Intervalo do sinal de vida (PING) enviado ao Arduino.
  heartbeatMs: 2000,
  // Velocidade da porta série (tem de ser igual à do Arduino/módulo).
  baudRate: 9600,
};

// Categorias de destino. A chave "code" é a letra enviada ao Arduino.
// Regras de separação seguem as orientações gerais usadas em Portugal;
// confirme sempre as regras do seu município.
const ECOSORT_CATEGORIAS = {
  papel: {
    code: "P",
    material: "Papel e cartão",
    ecoponto: "Ecoponto azul",
    cor: "#1f6fd1",
    corTexto: "#ffffff",
    simbolo: "📄",
    explicacao:
      "O objeto parece ser papel ou cartão (folhas, jornais, caixas de cartão).",
    instrucoes: [
      "Espalme as caixas para ocuparem menos espaço.",
      "Papel com muita gordura ou restos de comida, guardanapos e lenços usados não vão para o azul.",
    ],
  },
  amarelo: {
    code: "A",
    material: "Embalagem de plástico, metal ou pacote de bebida",
    ecoponto: "Ecoponto amarelo",
    cor: "#f2c200",
    corTexto: "#2b2300",
    simbolo: "🥫",
    explicacao:
      "O objeto parece ser uma embalagem de plástico, metal ou um pacote de bebida.",
    instrucoes: [
      "Esvazie a embalagem; não precisa de a lavar.",
      "Espalme garrafas e latas, se possível.",
      "Brinquedos, utensílios ou objetos de plástico que não são embalagens não vão para o amarelo.",
    ],
  },
  vidro: {
    code: "V",
    material: "Embalagem de vidro",
    ecoponto: "Ecoponto verde (vidrão)",
    cor: "#1f9d55",
    corTexto: "#ffffff",
    simbolo: "🍾",
    explicacao: "O objeto parece ser uma garrafa, frasco ou boião de vidro.",
    instrucoes: [
      "Retire tampas e rolhas (tampas metálicas vão para o amarelo).",
      "Loiça, cerâmica, espelhos, lâmpadas e vidro de janela NÃO vão para o vidrão.",
    ],
  },
};

// Como os nomes das classes do Teachable Machine são associados às categorias.
// A comparação ignora maiúsculas e acentos e procura estas palavras no nome.
const ECOSORT_MAPA_CLASSES = [
  { palavras: ["vazio", "fundo", "nada", "empty", "background"], categoria: "vazio" },
  { palavras: ["outro", "outros", "desconhecido", "rejeitar", "other"], categoria: "outro" },
  // A ordem importa: "Embalagens de vidro" tem de ser apanhado por "vidro"
  // antes de qualquer outra regra, e "Pacotes de bebida" (cartão para
  // líquidos) vai para o amarelo, antes da regra do papel/cartão.
  { palavras: ["vidro", "verde", "glass"], categoria: "vidro" },
  { palavras: ["pacote", "bebida", "tetra"], categoria: "amarelo" },
  { palavras: ["papel", "cartao", "azul", "paper"], categoria: "papel" },
  { palavras: ["plastico", "metal", "amarelo", "plastic"], categoria: "amarelo" },
];
