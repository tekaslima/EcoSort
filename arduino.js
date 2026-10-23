// =====================================================================
// EcoSort — comunicação com o Arduino
//
// Protocolo de texto, uma mensagem por linha (terminada em "\n"):
//   Telemóvel -> Arduino            Arduino -> Telemóvel
//   PING                            PONG
//   START                           ACK:START   (passadeira em ciclo)
//   STOP                            ACK:STOP    (tudo parado)
//   C:P | C:A | C:V                 ACK:P ...   e depois DONE:P ...
//   C:E  (zona vazia)               ACK:E       (avança a passadeira)
//   C:X  (não classificável)        ACK:X       e depois HOLD
//                                   READY       (Arduino ligado)
//                                   OBJ         (objeto na zona da câmara,
//                                                passadeira parada à espera)
//                                   HOLD        (parado, precisa de operador)
//                                   ERR:<motivo>
//
// Três formas de ligação:
//   "serial"     Web Serial — Bluetooth clássico (HC-05/HC-06) no Chrome
//                para Android, ou cabo USB no Chrome/Edge de um computador.
//   "ble"        Web Bluetooth — módulos BLE (HM-10 e semelhantes, ou ESP32
//                com "Nordic UART").
//   "simulador"  Arduino imaginário dentro da aplicação, para testar sem
//                hardware.
// =====================================================================

const UUID_SPP = "00001101-0000-1000-8000-00805f9b34fb";
const BLE_PERFIS = [
  // HM-10, AT-09, MLT-BT05, JDY-08 ... (serviço FFE0, característica FFE1)
  { servico: 0xffe0, rx: 0xffe1, tx: 0xffe1 },
  // Nordic UART Service (ESP32, nRF, Arduino Nano 33 BLE com sketch NUS)
  {
    servico: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
    rx: "6e400003-b5a3-f393-e0a9-e50e24dcca9e", // notificações (Arduino -> telemóvel)
    tx: "6e400002-b5a3-f393-e0a9-e50e24dcca9e", // escrita (telemóvel -> Arduino)
  },
];

function suporteLigacoes() {
  return {
    serial: "serial" in navigator,
    ble: "bluetooth" in navigator,
    simulador: true,
  };
}

// ---------------------------------------------------------------------
// Transportes: cada um sabe abrir, enviar texto e fechar.
// ---------------------------------------------------------------------

class TransporteSerial {
  constructor(aoReceber, aoPerder) {
    this.aoReceber = aoReceber;
    this.aoPerder = aoPerder;
    this.porta = null;
    this.leitor = null;
  }
  async abrir() {
    this.porta = await navigator.serial.requestPort({
      allowedBluetoothServiceClassIds: [UUID_SPP],
    });
    await this.porta.open({ baudRate: ECOSORT_CONFIG.baudRate });
    this.lerEmCiclo();
  }
  async lerEmCiclo() {
    const descodificador = new TextDecoder();
    try {
      while (this.porta && this.porta.readable) {
        this.leitor = this.porta.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await this.leitor.read();
            if (done) return;
            this.aoReceber(descodificador.decode(value, { stream: true }));
          }
        } finally {
          this.leitor.releaseLock();
          this.leitor = null;
        }
      }
    } catch (e) {
      this.aoPerder(e);
    }
  }
  async enviar(texto) {
    const escritor = this.porta.writable.getWriter();
    try {
      await escritor.write(new TextEncoder().encode(texto));
    } finally {
      escritor.releaseLock();
    }
  }
  async fechar() {
    const porta = this.porta;
    this.porta = null;
    try {
      if (this.leitor) await this.leitor.cancel();
    } catch (_) {}
    try {
      if (porta) await porta.close();
    } catch (_) {}
  }
}

class TransporteBLE {
  constructor(aoReceber, aoPerder) {
    this.aoReceber = aoReceber;
    this.aoPerder = aoPerder;
    this.dispositivo = null;
    this.carTx = null;
  }
  async abrir() {
    this.dispositivo = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLE_PERFIS.map((p) => p.servico),
    });
    this.dispositivo.addEventListener("gattserverdisconnected", () =>
      this.aoPerder(new Error("Bluetooth desligado"))
    );
    const servidor = await this.dispositivo.gatt.connect();
    for (const perfil of BLE_PERFIS) {
      let servico;
      try {
        servico = await servidor.getPrimaryService(perfil.servico);
      } catch (_) {
        continue;
      }
      const carRx = await servico.getCharacteristic(perfil.rx);
      this.carTx = await servico.getCharacteristic(perfil.tx);
      const desc = new TextDecoder();
      carRx.addEventListener("characteristicvaluechanged", (ev) =>
        this.aoReceber(desc.decode(ev.target.value, { stream: true }))
      );
      await carRx.startNotifications();
      return;
    }
    servidor.disconnect();
    throw new Error(
      "O dispositivo não tem um serviço série BLE conhecido (FFE0 ou Nordic UART)."
    );
  }
  async enviar(texto) {
    const bytes = new TextEncoder().encode(texto);
    // BLE envia no máximo 20 bytes de cada vez em muitos módulos.
    for (let i = 0; i < bytes.length; i += 20) {
      await this.carTx.writeValue(bytes.slice(i, i + 20));
    }
  }
  async fechar() {
    if (this.dispositivo && this.dispositivo.gatt.connected) {
      this.dispositivo.gatt.disconnect();
    }
    this.dispositivo = null;
  }
}

// Arduino imaginário que segue o mesmo protocolo e as mesmas regras de
// segurança do sketch ecosort.ino (modo sem sensor, passadeira aos passos).
class TransporteSimulador {
  constructor(aoReceber) {
    this.aoReceber = aoReceber;
    this.estado = "PARADO";
    this.timers = [];
  }
  responder(linha, atrasoMs = 60) {
    this.timers.push(setTimeout(() => this.aoReceber(linha + "\n"), atrasoMs));
  }
  limpar() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
  avancar(ms) {
    this.estado = "A_AVANCAR";
    this.timers.push(
      setTimeout(() => {
        if (this.estado !== "A_AVANCAR") return;
        this.estado = "ESPERA_DECISAO";
        this.aoReceber("OBJ\n");
        this.timers.push(
          setTimeout(() => {
            if (this.estado === "ESPERA_DECISAO") {
              this.estado = "HOLD";
              this.aoReceber("ERR:TIMEOUT\nHOLD\n");
            }
          }, 8000)
        );
      }, ms)
    );
  }
  async abrir() {
    this.responder("READY", 300);
  }
  async enviar(texto) {
    for (const cmd of texto.split("\n").map((s) => s.trim()).filter(Boolean)) {
      if (cmd === "PING") this.responder("PONG");
      else if (cmd === "START") {
        const vemDeHold = this.estado === "HOLD";
        this.limpar();
        this.responder("ACK:START");
        // Tal como o Arduino: depois de um HOLD reanalisa a zona antes de avançar.
        this.avancar(vemDeHold ? 400 : 1500);
      } else if (cmd === "STOP") {
        this.limpar();
        this.estado = "PARADO";
        this.responder("ACK:STOP");
      } else if (/^C:[PAVEX]$/.test(cmd)) {
        const c = cmd[2];
        if (this.estado !== "ESPERA_DECISAO" && this.estado !== "HOLD") {
          this.responder("ERR:ESTADO");
          continue;
        }
        this.limpar();
        this.responder("ACK:" + c);
        if (c === "X") {
          this.estado = "HOLD";
          this.responder("HOLD", 150);
        } else if (c === "E") {
          this.avancar(1200);
        } else {
          this.estado = "A_ENCAMINHAR";
          this.timers.push(
            setTimeout(() => {
              this.aoReceber("DONE:" + c + "\n");
              this.avancar(1500);
            }, 1800)
          );
        }
      } else this.responder("ERR:CMD");
    }
  }
  async fechar() {
    this.limpar();
  }
}

// ---------------------------------------------------------------------
// Ligação: junta as linhas, trata das confirmações (ACK) e do sinal de vida.
// ---------------------------------------------------------------------

const Ligacao = (() => {
  let transporte = null;
  let tipo = null;
  let buffer = "";
  let estado = "desligado";
  let ultimoContacto = 0;
  let heartbeat = null;
  let aguardaAck = null; // { esperado, resolver, timer }
  const ouvintes = { estado: [], mensagem: [] };

  function emitir(evento, ...args) {
    ouvintes[evento].forEach((f) => f(...args));
  }
  function mudarEstado(novo, detalhe = "") {
    estado = novo;
    emitir("estado", novo, detalhe, tipo);
  }

  function aoReceber(texto) {
    buffer += texto;
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const linha = buffer.slice(0, i).replace(/\r/g, "").trim();
      buffer = buffer.slice(i + 1);
      if (!linha) continue;
      ultimoContacto = Date.now();
      if (estado === "sem resposta") mudarEstado("ligado");
      if (aguardaAck && linha === aguardaAck.esperado) {
        clearTimeout(aguardaAck.timer);
        const r = aguardaAck.resolver;
        aguardaAck = null;
        r(true);
      }
      if (linha !== "PONG") emitir("mensagem", linha);
    }
  }

  function aoPerder(erro) {
    if (estado === "desligado") return;
    pararHeartbeat();
    mudarEstado("erro", "Ligação perdida: " + (erro?.message || erro));
  }

  function iniciarHeartbeat() {
    pararHeartbeat();
    ultimoContacto = Date.now();
    heartbeat = setInterval(async () => {
      try {
        await transporte.enviar("PING\n");
      } catch (e) {
        aoPerder(e);
        return;
      }
      if (estado === "ligado" && Date.now() - ultimoContacto > 3 * ECOSORT_CONFIG.heartbeatMs) {
        mudarEstado("sem resposta", "O Arduino não responde.");
      }
    }, ECOSORT_CONFIG.heartbeatMs);
  }
  function pararHeartbeat() {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
  }

  async function ligar(novoTipo) {
    await desligar();
    tipo = novoTipo;
    const Classe = { serial: TransporteSerial, ble: TransporteBLE, simulador: TransporteSimulador }[tipo];
    transporte = new Classe(aoReceber, aoPerder);
    mudarEstado("a ligar");
    try {
      await transporte.abrir();
    } catch (e) {
      transporte = null;
      mudarEstado("desligado", e.name === "NotFoundError" ? "Nenhum dispositivo escolhido." : e.message);
      throw e;
    }
    mudarEstado("ligado");
    iniciarHeartbeat();
  }

  async function desligar() {
    pararHeartbeat();
    if (aguardaAck) {
      clearTimeout(aguardaAck.timer);
      aguardaAck.resolver(false);
      aguardaAck = null;
    }
    if (transporte) {
      const t = transporte;
      transporte = null;
      try {
        await t.enviar("STOP\n");
      } catch (_) {}
      await t.fechar();
    }
    buffer = "";
    mudarEstado("desligado");
  }

  // Envia um comando e espera pela confirmação. Tenta 2 vezes.
  async function comando(cmd, ackEsperado) {
    if (!transporte || estado === "desligado" || estado === "erro") return false;
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const ok = await new Promise((resolver) => {
        aguardaAck = {
          esperado: ackEsperado,
          resolver,
          timer: setTimeout(() => {
            aguardaAck = null;
            resolver(false);
          }, ECOSORT_CONFIG.timeoutAckMs),
        };
        transporte.enviar(cmd + "\n").catch(() => {
          clearTimeout(aguardaAck?.timer);
          aguardaAck = null;
          resolver(false);
        });
      });
      if (ok) return true;
    }
    return false;
  }

  return {
    ligar,
    desligar,
    comando,
    getEstado: () => estado,
    getTipo: () => tipo,
    on: (evento, f) => ouvintes[evento].push(f),
  };
})();
