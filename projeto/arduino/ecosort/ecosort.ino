/*
  EcoSort — controlador da passadeira e da comporta
  ---------------------------------------------------------------
  Recebe comandos de texto do telemóvel (uma linha por comando):
    PING            -> responde PONG
    START           -> põe a passadeira em ciclo        (ACK:START)
    STOP            -> pára tudo                         (ACK:STOP)
    C:P / C:A / C:V -> encaminha para azul/amarelo/verde (ACK:x ... DONE:x)
    C:E             -> zona vazia, avança                (ACK:E)
    C:X             -> não classificável, fica parado    (ACK:X, HOLD)
  Envia por iniciativa própria:
    READY, OBJ (objeto parado na zona da câmara), HOLD, ERR:<motivo>

  Regra de segurança: na dúvida, PARA. A passadeira só anda enquanto o
  telemóvel estiver a dar sinal de vida, e um objeto só é encaminhado
  depois de uma decisão explícita (C:P, C:A ou C:V).

  ATENÇÃO: os pinos e ligações abaixo são um ponto de partida. Confirme-os
  com o modelo exato do seu Arduino, módulo Bluetooth, motor e driver
  antes de ligar a alimentação (ver GUIA.md, etapa 7).
*/

#include <Servo.h>
#include <SoftwareSerial.h>

// ===================== CONFIGURAÇÃO =====================

// --- Comunicação ---
// Módulo Bluetooth (HC-05/HC-06 ou HM-10) nos pinos 10 (RX) e 11 (TX).
// O cabo USB (Serial) continua a funcionar ao mesmo tempo, para testes.
const uint8_t BT_RX_PIN = 10;   // liga ao TX do módulo
const uint8_t BT_TX_PIN = 11;   // liga ao RX do módulo (atenção à tensão!)
const long    BAUD      = 9600; // HC-05/HC-06/HM-10 vêm normalmente a 9600

// --- Comporta (servomotor) ---
const uint8_t SERVO_PIN      = 9;
const int     ANGULO_REPOUSO = 90;   // posição neutra
const int     ANGULO_AZUL    = 30;   // papel/cartão      (afinar no protótipo)
const int     ANGULO_AMARELO = 90;   // plástico/metal    (afinar no protótipo)
const int     ANGULO_VERDE   = 150;  // vidro             (afinar no protótipo)
const unsigned long SERVO_ESPERA_MS = 500;  // tempo para a comporta chegar à posição

// --- Passadeira (motor através de um driver/relé/MOSFET, NUNCA direto ao pino) ---
const uint8_t BELT_PIN        = 7;
const bool    BELT_ATIVO_HIGH = true;   // false se o módulo de relé ativar com LOW

// Tempo que o objeto demora a ir da zona da câmara até cair no compartimento.
const unsigned long TRANSITO_MS = 2500;  // MEDIR no protótipo e ajustar

// --- Deteção de objeto na zona da câmara ---
// false: sem sensor. A passadeira avança aos "passos" e, depois de cada
//        passo, pergunta ao telemóvel o que está na zona (OBJ).
// true:  com sensor de obstáculo infravermelho (ex.: módulo IR com saída digital).
const bool    USAR_SENSOR      = false;
const uint8_t SENSOR_PIN       = 2;
const bool    SENSOR_ATIVO_LOW = true;   // a maioria dos módulos IR dá LOW com objeto
const unsigned long PASSO_MS   = 1200;   // só sem sensor: duração de cada avanço

// --- Tempos de segurança ---
const unsigned long ESTABILIZAR_MS   = 400;   // espera após parar, para a imagem não sair tremida
const unsigned long DECISAO_MAX_MS   = 8000;  // tempo máximo à espera da decisão do telemóvel
const unsigned long SEM_SINAL_MAX_MS = 6000;  // sem mensagens do telemóvel -> pára

// =========================================================

SoftwareSerial bt(BT_RX_PIN, BT_TX_PIN);
Servo comporta;

enum Estado { PARADO, A_AVANCAR, A_ESTABILIZAR, ESPERA_DECISAO, A_ENCAMINHAR, HOLD };
Estado estado = PARADO;

unsigned long inicioEstado = 0;
unsigned long ultimaMensagem = 0;
char destinoAtual = 0;
bool comportaPosicionada = false;
bool sensorLiberto = true;

String linhaUSB, linhaBT;

// ---------- utilitários ----------
void enviar(const String &msg) {
  Serial.println(msg);
  bt.print(msg);
  bt.print('\n');
}

void passadeira(bool ligada) {
  digitalWrite(BELT_PIN, (ligada == BELT_ATIVO_HIGH) ? HIGH : LOW);
}

bool objetoNoSensor() {
  bool leitura = digitalRead(SENSOR_PIN);
  return SENSOR_ATIVO_LOW ? (leitura == LOW) : (leitura == HIGH);
}

void mudar(Estado novo) {
  estado = novo;
  inicioEstado = millis();
}

void parar() {
  passadeira(false);
  comporta.write(ANGULO_REPOUSO);
  mudar(PARADO);
}

void entrarHold(const char *motivo) {
  passadeira(false);
  comporta.write(ANGULO_REPOUSO);
  if (motivo) enviar(String("ERR:") + motivo);
  enviar("HOLD");
  mudar(HOLD);
}

void avancar() {
  passadeira(true);
  mudar(A_AVANCAR);
}

// Para a passadeira e pede ao telemóvel para analisar a zona da câmara.
void pedirDecisao() {
  passadeira(false);
  mudar(A_ESTABILIZAR);
}

int anguloDe(char c) {
  if (c == 'P') return ANGULO_AZUL;
  if (c == 'A') return ANGULO_AMARELO;
  return ANGULO_VERDE;
}

// ---------- comandos ----------
void tratarComando(String cmd) {
  cmd.trim();
  if (cmd.length() == 0) return;
  ultimaMensagem = millis();

  if (cmd == "PING") { enviar("PONG"); return; }

  if (cmd == "STOP") { parar(); enviar("ACK:STOP"); return; }

  if (cmd == "START") {
    enviar("ACK:START");
    if (estado == HOLD) pedirDecisao();          // reanalisa a zona antes de avançar
    else if (estado == PARADO) avancar();
    return;
  }

  if (cmd.length() == 3 && cmd.startsWith("C:")) {
    char c = cmd.charAt(2);
    if (estado != ESPERA_DECISAO && estado != HOLD) { enviar("ERR:ESTADO"); return; }
    if (c == 'P' || c == 'A' || c == 'V') {
      enviar(String("ACK:") + c);
      destinoAtual = c;
      comporta.write(anguloDe(c));
      comportaPosicionada = false;
      mudar(A_ENCAMINHAR);
    } else if (c == 'E') {
      enviar("ACK:E");
      avancar();
    } else if (c == 'X') {
      enviar("ACK:X");
      entrarHold(nullptr);
    } else {
      enviar("ERR:CMD");
    }
    return;
  }

  enviar("ERR:CMD");
}

void lerPorta(Stream &porta, String &buffer) {
  while (porta.available()) {
    char ch = (char)porta.read();
    if (ch == '\n' || ch == '\r') {
      if (buffer.length()) tratarComando(buffer);
      buffer = "";
    } else if (buffer.length() < 32) {
      buffer += ch;
    }
  }
}

// ---------- programa ----------
void setup() {
  pinMode(BELT_PIN, OUTPUT);
  passadeira(false);
  if (USAR_SENSOR) pinMode(SENSOR_PIN, INPUT_PULLUP);
  comporta.attach(SERVO_PIN);
  comporta.write(ANGULO_REPOUSO);
  Serial.begin(BAUD);
  bt.begin(BAUD);
  enviar("READY");
}

void loop() {
  lerPorta(Serial, linhaUSB);
  lerPorta(bt, linhaBT);

  unsigned long agora = millis();
  unsigned long noEstado = agora - inicioEstado;

  // Sem sinal do telemóvel: pára tudo (exceto se já estiver parado).
  if (estado != PARADO && estado != HOLD && agora - ultimaMensagem > SEM_SINAL_MAX_MS) {
    entrarHold("SEMLIGACAO");
    return;
  }

  switch (estado) {
    case A_AVANCAR:
      if (USAR_SENSOR) {
        bool obj = objetoNoSensor();
        if (!obj) sensorLiberto = true;
        if (obj && sensorLiberto) {
          sensorLiberto = false;
          pedirDecisao();
        }
      } else if (noEstado >= PASSO_MS) {
        pedirDecisao();
      }
      break;

    case A_ESTABILIZAR:
      if (noEstado >= ESTABILIZAR_MS) {
        enviar("OBJ");
        mudar(ESPERA_DECISAO);
      }
      break;

    case ESPERA_DECISAO:
      if (noEstado >= DECISAO_MAX_MS) entrarHold("TIMEOUT");
      break;

    case A_ENCAMINHAR:
      // 1) espera a comporta chegar à posição; 2) leva o objeto até ao fim.
      if (!comportaPosicionada && noEstado >= SERVO_ESPERA_MS) {
        comportaPosicionada = true;
        passadeira(true);
        inicioEstado = agora;
      } else if (comportaPosicionada && noEstado >= TRANSITO_MS) {
        passadeira(false);
        comporta.write(ANGULO_REPOUSO);
        enviar(String("DONE:") + destinoAtual);
        avancar();
      }
      break;

    default:
      break;
  }
}
