# EcoSort — Guia completo de desenvolvimento

Este guia acompanha o código das pastas `app/` (aplicação) e `arduino/` (controlador).
Está escrito para quem tem pouca experiência em programação: siga as etapas pela ordem e
**só avance quando a verificação de cada etapa funcionar**.

---

## Etapa 1 — Requisitos e escolha da tecnologia

### 1.1 O que a solução tem mesmo de fazer (por ordem de dificuldade real)

1. Usar a câmara do telemóvel de forma contínua.
2. Classificar a imagem em 3 categorias e **saber dizer "não sei"**.
3. Enviar a decisão a um Arduino e receber confirmação.
4. Funcionar sem custos recorrentes e, de preferência, sem internet durante a demonstração.

A interface bonita é a parte mais fácil. Por isso a escolha foi feita a partir dos pontos 1 a 4.

### 1.2 Opções analisadas

| Opção | Câmara | IA para resíduos | Ligação ao Arduino | Custo | Veredicto |
|---|---|---|---|---|---|
| **Página web + Teachable Machine + TensorFlow.js** | Sim (navegador, precisa de `https`) | Modelo treinado por vocês, corre **no telemóvel**, sem internet | Web Serial (Bluetooth clássico) ou Web Bluetooth (BLE) no **Chrome para Android** | 0 € | **Escolhida** |
| Lovable (gera apps web por IA) | Sim | Não traz modelo próprio; normalmente liga-se a uma IA na nuvem (paga, precisa de internet) | Igual a qualquer página web, mas o código gerado é mais difícil de controlar | Plano gratuito com créditos limitados | Útil só para a interface; não resolve a parte difícil |
| Google AI Studio / API Gemini | Sim (enviando fotos para a nuvem) | Muito boa a reconhecer objetos sem treino | Não ajuda | Gratuito com limites que mudam; exige chave de API (que fica exposta numa app web) | Bom para comparação, **mau para controlar uma máquina**: depende da internet, demora 1–3 s por imagem e as respostas não são sempre iguais |
| MIT App Inventor (app Android por blocos) | Sim | Possível com extensões para Teachable Machine (de terceiros) | Bluetooth clássico (HC-05) nativo | 0 € | **Plano B** se o Chrome do vosso telemóvel não suportar Bluetooth |
| App nativa (Android Studio / Flutter) | Sim | Sim (TensorFlow Lite) | Sim | 0 € | Demasiado complexa para pouca experiência |
| ESP32-CAM em vez do telemóvel | Câmara fraca | Modelos muito limitados | Direta | ~8–12 € | Foge ao requisito "usar o smartphone" |

### 1.3 Arquitetura recomendada

```
 ┌──────────── Telemóvel Android (Chrome) ────────────┐         ┌──────── Arduino ────────┐
 │ Página EcoSort (alojada grátis no GitHub Pages)     │         │ ecosort.ino             │
 │  câmara → modelo Teachable Machine (TensorFlow.js)  │  texto  │  passadeira (motor)     │
 │  → regras de decisão (certo / incerto / vazio)      │ ◄─────► │  comporta (servo)       │
 │  → comando  C:P | C:A | C:V | C:E | C:X             │Bluetooth│  sensor IR (opcional)   │
 └─────────────────────────────────────────────────────┘         └─────────────────────────┘
```

**Funcionamento "pára-e-arranca" (sincronização):** é o Arduino que pára a passadeira com o
objeto na zona da câmara e envia `OBJ`. Só então o telemóvel analisa (cerca de 1 s) e responde.
Como a passadeira está parada durante a análise, não é preciso calcular velocidades nem
compensar atrasos do Bluetooth — é a forma mais simples e fiável de sincronizar.

### 1.4 Limitações técnicas (ler antes de começar)

**Compatibilidade do telemóvel**
- **Android + Chrome atualizado: recomendado.** A câmara, o Web Bluetooth (BLE) e o Web Serial
  por Bluetooth clássico funcionam no Chrome para Android. O suporte a Web Serial por Bluetooth
  no Android foi anunciado pela equipa do Chrome para a versão 137
  ([anúncio](https://groups.google.com/a/chromium.org/g/blink-dev/c/BqUGCcurReE/m/XbuAYkRxEQAJ)).
  A aplicação verifica sozinha se o vosso navegador suporta cada tipo de ligação.
- **Cabo USB entre o telemóvel Android e o Arduino: não recomendado.** O Chrome para Android
  ainda não suporta Web Serial por USB.
- **iPhone:** o Safari (e todos os navegadores do iPhone) **não** suportam Web Serial nem Web
  Bluetooth. No iPhone a identificação funciona, mas a ligação ao Arduino não. Alternativas:
  usar um telemóvel Android emprestado, ou um portátil com Chrome ligado ao Arduino por USB.
- A câmara só funciona se a página for aberta por `https://` (ou `localhost` no computador).

**Limitações de identificar materiais só por imagem**
- A câmara vê **aparência**, não **material**. Uma garrafa de plástico transparente e uma de vidro,
  uma lata e um frasco com rótulo metalizado, ou um pacote de leite (vai para o **amarelo**) e uma
  caixa de cartão (vai para o **azul**) podem ser muito parecidos.
- O modelo só conhece o que viu no treino. Objetos muito diferentes dos exemplos podem ser
  classificados com confiança alta **e errada**. A "confiança" do modelo não é uma probabilidade
  real de acerto.
- Fundo, luz, reflexos e posição afetam o resultado. O modelo deve ser treinado **no mesmo sítio,
  com a mesma luz e o mesmo fundo** em que vai ser usado (a passadeira).
- Objetos sujos, amassados, partidos ou compostos (ex.: frasco de vidro com tampa metálica)
  são difíceis. Por isso existe a resposta "não consigo classificar".
- **Não é possível garantir que o sistema reconhece todos os resíduos.** A precisão só pode ser
  afirmada depois dos testes da etapa 6, indicando quantos objetos foram testados.

**Como a aplicação evita dar como certa uma identificação duvidosa**
Em cada análise combina várias imagens seguidas (8 por defeito) e só decide se, ao mesmo tempo:
- a confiança média da classe vencedora for ≥ 80 %;
- a diferença para a segunda classe for ≥ 25 pontos percentuais;
- pelo menos 75 % das imagens concordarem;
- houver luz suficiente.

Caso contrário mostra "Não tenho certeza" (e, se houver alguma evidência, a categoria provável,
**sem recomendar ecoponto**). Na passadeira, uma identificação incerta faz o Arduino **parar**
(comando `C:X`) em vez de encaminhar.

---

## Custos previstos

### Software e serviços (custos recorrentes)

| Item | Custo |
|---|---|
| Teachable Machine (treino do modelo) | 0 € |
| TensorFlow.js (IA no telemóvel) | 0 € |
| GitHub Pages (alojamento `https`) | 0 € (repositório público) |
| VS Code, Arduino IDE | 0 € |
| Serviços de IA na nuvem | **não usados** → 0 € |
| **Total recorrente** | **0 €/mês** |

### Protótipo (custo único, valores **estimados** de lojas online de eletrónica — confirmem preços)

| Componente | Estimativa | Notas |
|---|---|---|
| Arduino Uno (compatível) | 0 € se já têm · 6–12 € compatível · ~25 € original | |
| Módulo Bluetooth HC-05 ou HC-06 | 4–8 € | Para Android. HM-10 (BLE) é alternativa, 4–8 € |
| Servomotor SG90 (ou MG90S) | 2–5 € | Comporta |
| Motor DC com redutor (tipo "TT") | 2–4 € | Passadeira, se ainda não têm |
| Driver do motor (L9110S, L298N ou módulo MOSFET) | 2–5 € | O motor **nunca** liga diretamente a um pino do Arduino |
| Sensor de obstáculo IR (opcional) | 1–2 € | Melhora a sincronização |
| Fonte/porta-pilhas, cabos, resistências, breadboard | 5–10 € | Reutilizar o que houver |
| Suporte do telemóvel, passadeira, compartimentos | 0–5 € | Cartão, madeira, tubos reutilizados |
| **Total estimado** | **≈ 16–39 €** (sem comprar Arduino) | Dentro do orçamento de 50 € |

---

## Etapa 2 — Primeira versão da interface

### O que fazer
1. Instale o **VS Code** (https://code.visualstudio.com) — gratuito.
2. No VS Code, abra o menu **Extensões** (ícone dos quadrados à esquerda), procure
   **"Live Server"** (autor: Ritwick Dey) e clique em **Install**.
3. Menu **File → Open Folder…** e escolha a pasta `app`.
4. Clique com o botão direito em `index.html` → **Open with Live Server**. Abre-se o navegador
   em `http://127.0.0.1:5500`.

### Como verificar
- Aparece o cabeçalho verde com o logótipo **EcoSort**, a pílula "Arduino desligado" e 4
  separadores em baixo (Identificar, Passadeira, Testes, Definições).
- Não aparece nenhum aviso amarelo: o modelo inicial (pasta `modelo`) foi carregado.
- Carregue em **Usar foto** e escolha uma fotografia de uma garrafa, lata ou caixa: deve
  aparecer o cartão do ecoponto, ou "Não tenho certeza" se a foto for ambígua.

### Se não funcionar
- Página em branco: confirme que abriu a pasta `app` (e não a pasta acima) e que a pasta `lib`
  tem os ficheiros `tf.min.js` e `teachablemachine-image.min.js`.
- Para ver erros: no Chrome, carregue em **F12 → separador Console**. Copie a mensagem vermelha.

---

## Etapa 3 — Acesso à câmara

### 3a. No computador
Com o Live Server aberto, clique em **Usar câmara** e aceite a permissão. Deve ver a imagem da
webcam com um quadrado branco (a zona analisada).

### 3b. No telemóvel (precisa de `https`) — publicar no GitHub Pages
1. Crie uma conta gratuita em https://github.com.
2. Clique em **+ → New repository**. Nome: `ecosort`. Escolha **Public**. Clique em
   **Create repository**.
3. Na página do repositório, clique em **uploading an existing file**.
4. Abra a pasta `app` no seu computador, **selecione todo o conteúdo** (index.html, styles.css,
   os .js, logo.svg, manifest.webmanifest e as pastas `lib` e `modelo`) e arraste para a página.
   Atenção: arraste o **conteúdo** da pasta, não a pasta `app` em si.
5. Clique em **Commit changes**.
6. Vá a **Settings → Pages**. Em *Branch* escolha `main` e `/ (root)` e clique **Save**.
7. Espere 1–2 minutos. O endereço será `https://O-SEU-UTILIZADOR.github.io/ecosort/`.
8. Abra esse endereço no **Chrome do telemóvel** e toque em **Usar câmara** → **Permitir**.

Para atualizar mais tarde: repita os passos 3–5 com os ficheiros alterados (substituem os
anteriores). Pode demorar 1–2 minutos a aparecer; recarregue a página.

### Como verificar
- No telemóvel aparece a imagem da **câmara traseira**.
- Para instalar como app: menu ⋮ do Chrome → **Adicionar ao ecrã principal**.

### Se não funcionar
- Aviso vermelho "a página não foi aberta por https": está a abrir o ficheiro diretamente ou
  por `http://`. Use o endereço do GitHub Pages.
- "Permissão da câmara recusada": toque no ícone à esquerda do endereço → Permissões → Câmara →
  Permitir. Recarregue.
- Página de erro 404: confirme que o `index.html` está na raiz do repositório (não dentro de
  uma pasta `app`).

---

## Etapa 4 — Criar o modelo de reconhecimento (Teachable Machine)

A aplicação **já traz um modelo inicial**, treinado com 2527 fotografias públicas (TrashNet).
Funciona para testar e demonstrar a app, mas foi treinado com fotos de outro sítio. Resultados
e limitações em [MODELO.md](MODELO.md). Para o protótipo final, sigam os passos abaixo e
substituam os 3 ficheiros da pasta `modelo` pelos vossos.

### 4.1 Recolher as fotografias (o passo mais importante)
1. Monte o telemóvel **na posição final**, por cima da zona de identificação da passadeira,
   com a luz que vão usar na apresentação.
2. Junte objetos reais: **pelo menos 10 objetos diferentes por categoria** (ex.: para o vidro,
   garrafas verdes, castanhas, transparentes, frascos, boiões).
3. **Separe já 5 objetos de cada categoria que NUNCA vão ser usados no treino.** Servem para os
   testes da etapa 6. Testar com objetos do treino dá resultados falsamente bons.
4. Fotografe com o telemóvel nessa posição, cada objeto em várias posições, rodado, deitado, de
   pé, com o rótulo visível e escondido. Objetivo: **80–150 fotos por classe**.
5. Fotografe também a **passadeira vazia** (40–80 fotos, com variações de luz).
6. (Opcional, recomendado) Classe **Outro**: objetos que não pertencem a nenhum ecoponto
   (pilhas, brinquedos, loiça, restos de comida, lenços) — 40–80 fotos.
7. Passe as fotos para o computador (cabo USB, Google Drive, etc.), uma pasta por classe.

### 4.2 Treinar
1. No computador, abra https://teachablemachine.withgoogle.com → **Começar** →
   **Projeto de imagem** → **Modelo de imagem padrão**.
2. Mude os nomes das classes (clique no lápis) para exatamente:
   - `Papel e cartão`
   - `Plástico e metal`
   - `Vidro`
   - `Vazio`
   - `Outro` (opcional — clique em **Adicionar uma classe**)

   A aplicação reconhece estas palavras automaticamente (ver `config.js`, `ECOSORT_MAPA_CLASSES`).
3. Em cada classe clique em **Carregar** e arraste as fotos da pasta correspondente.
4. Clique em **Preparar modelo** (Train Model). Não feche o separador enquanto treina.
5. Teste rapidamente na pré-visualização à direita.

### 4.3 Exportar
1. Clique em **Exportar modelo** → separador **Tensorflow.js** → opção **Transferir** →
   **Transferir o meu modelo**. Recebe um ficheiro `.zip`.
2. Extraia o `.zip`. Tem 3 ficheiros: `model.json`, `metadata.json`, `weights.bin`.
3. Copie os 3 ficheiros para a pasta `app/modelo/` e volte a carregar para o GitHub
   (etapa 3b, passos 3–5 — basta arrastar a pasta `modelo`).

   *Alternativa:* em **Exportar modelo** escolha **Carregar o meu modelo** (Upload) e copie o
   link de partilha. Na app, vá a **Definições**, cole o link e toque em **Carregar modelo**.
   Esta opção precisa de internet sempre que a app abre.
4. **Guarde o projeto** do Teachable Machine (menu ☰ → *Guardar projeto no Drive* ou *Transferir
   ficheiro do projeto*) para poder acrescentar fotos mais tarde.

### Como verificar
- A app já não mostra o aviso de "modo demonstração".
- Em **Definições → Modelo de IA** aparece a lista das classes e a categoria associada a cada uma
  (ex.: `Vidro → Embalagem de vidro`). Se alguma aparecer "sem categoria", mude o nome da classe.

---

## Etapa 5 — Resultado e ecoponto recomendado

Já está implementado. Com o modelo carregado:
1. Ligue a câmara, coloque um objeto no quadrado e toque em **Identificar resíduo**.
2. A app analisa 8 imagens (~1 s) e mostra uma de cinco respostas:

| Resposta | Quando |
|---|---|
| Cartão colorido (azul/amarelo/verde) com material, ecoponto, explicação e instruções | Decisão segura |
| **Não tenho certeza** (+ categoria provável, sem ecoponto) | Evidência insuficiente |
| **Nenhum resíduo detetado** | Classe "Vazio" venceu |
| **Não consigo classificar este objeto** | Classe "Outro" venceu |
| **Pouca luz** | Imagem demasiado escura |

3. Em **Detalhes técnicos** vê a percentagem de cada classe — útil para perceber erros.
4. Também pode usar **Usar foto** para analisar uma fotografia da galeria.

### Como verificar
Teste um objeto óbvio de cada categoria, a passadeira vazia, e tape a câmara com a mão
(deve dar "Pouca luz" ou "Não tenho certeza").

---

## Etapa 6 — Testar a classificação com resíduos reais

### Protocolo de teste
1. Use **apenas os objetos reservados** na etapa 4.1 (nunca vistos no treino).
2. Para cada objeto, faça 3 identificações: posição normal, outro ângulo, outra luz (ex.: luz do
   teto desligada, lanterna lateral).
3. Depois de cada resultado, responda à pergunta **"o que era realmente?"** no fim do cartão.
4. No separador **Testes** aparece:
   - **Acerto quando decide** — das vezes que recomendou um ecoponto, quantas estavam certas;
   - **Taxa de decisão** — quantas vezes decidiu (em vez de "não sei");
   - **Encaminhamentos errados** — o número mais importante: um resíduo no compartimento errado;
   - a tabela de confusão (linhas = real, colunas = previsto).
5. Toque em **Exportar CSV** para guardar os resultados (abre no Excel/Google Sheets).

Objetivo mínimo: **20 testes por categoria** antes de tirar conclusões. No relatório, indique
sempre o número de testes (ex.: "acertou 52 de 57 decisões, com 15 objetos não vistos no treino").

### Como melhorar o modelo
- Erros sempre entre as mesmas duas classes → acrescente mais fotos **desses** objetos difíceis
  às duas classes e volte a treinar (etapa 4.2–4.3).
- Muitos "Não tenho certeza" com objetos fáceis → mais fotos e variedade; só depois, se
  necessário, baixe a **Confiança mínima** em Definições (não abaixo de ~70 %).
- Encaminhamentos errados com confiança alta → **suba** a confiança mínima e a margem, e
  acrescente esses objetos ao treino. Na passadeira, um "não sei" é muito melhor do que um erro.
- Depois de cada alteração, **repita os testes** (apague os antigos ou exporte-os antes).

---

## Etapa 7 — Integrar a aplicação com o Arduino

### 7.1 Escolha da forma de comunicação

| Forma | Funciona com | Custo | Avaliação |
|---|---|---|---|
| **Bluetooth clássico HC-05/HC-06 + Web Serial** | Chrome para Android (versão recente) | 4–8 € | **Recomendada para Android** — módulo barato e muito comum |
| Bluetooth BLE HM-10 (ou ESP32) + Web Bluetooth | Chrome para Android | 4–8 € | Alternativa igualmente boa; atenção a clones de HM-10 que não são compatíveis |
| Cabo USB telemóvel → Arduino | Não suportado pelo Chrome para Android | 2–3 € | Não recomendada |
| Cabo USB portátil → Arduino | Chrome/Edge no computador | 0 € | Ótima para **testar** o Arduino na secretária |
| Wi-Fi (ESP8266/ESP32) | Exige servidor no ESP e cria problemas de `https` | 4–8 € | Mais complexa, evitar |

A aplicação suporta as três primeiras formas úteis (Bluetooth clássico/USB, BLE e simulador). A
escolha final depende do vosso hardware.

> **Antes de ligar fios, preciso que me indiquem:**
> 1. Modelo exato do Arduino (ex.: Uno R3 original, Uno compatível com chip CH340, Nano, Mega…).
> 2. Marca/modelo do telemóvel e versão do Android (Definições → Acerca do telefone) e versão do
>    Chrome (Chrome → ⋮ → Definições → Acerca do Chrome).
> 3. Módulo Bluetooth que têm ou pensam comprar (HC-05, HC-06, HM-10…) — idealmente o link ou
>    fotografia da placa.
> 4. Motor da passadeira (tensão nominal, ex.: "motor TT 3–6 V") e driver/relé que têm.
> 5. Modelo do servomotor (ex.: SG90, MG90S, MG996R).
> 6. Como vão alimentar o protótipo (USB, pilhas, transformador — tensão e corrente).
> 7. Se têm (ou querem) um sensor de obstáculo IR.
>
> Com estas informações defino o esquema de ligações final. As indicações abaixo são apenas
> **princípios gerais a confirmar** nas fichas técnicas dos vossos componentes.

**Princípios gerais (a verificar nas especificações dos vossos componentes):**
- Muitos módulos HC-05/HC-06/HM-10 são alimentados a 5 V mas o pino **RX** do módulo trabalha a
  3,3 V. Se a ficha técnica do vosso módulo o indicar, a ligação do TX do Arduino (5 V) ao RX do
  módulo precisa de um divisor de tensão. Confirmem antes de ligar.
- O motor da passadeira **nunca** se liga diretamente a um pino do Arduino: precisa de um driver,
  relé ou MOSFET adequado à tensão e corrente do motor.
- Servos podem puxar picos de corrente; é habitual alimentá-los por uma fonte de 5 V separada,
  com o GND ligado ao GND do Arduino. Confirmem a corrente do vosso servo e da vossa fonte.
- Todos os GND (Arduino, driver, fonte do servo, módulo) têm de estar ligados entre si.

### 7.2 Testar primeiro sem hardware (simulador)
1. Na app, separador **Passadeira** → Tipo de ligação **Simulador** → **Ligar**.
2. A pílula do topo fica verde: "Simulador ligado".
3. Toque em **Iniciar passadeira**. No registo deve aparecer: `READY`, `ACK:START`, `OBJ`,
   a decisão, `C:…`, `ACK:…`, `DONE:…`.
4. Sem modelo carregado aparecem botões para escolher o destino à mão (modo demonstração).

### 7.3 Carregar o programa no Arduino
1. Instale o **Arduino IDE 2** (https://www.arduino.cc/en/software).
2. Abra `arduino/ecosort/ecosort.ino` (o ficheiro tem de estar numa pasta com o mesmo nome — já
   está).
3. Ligue o Arduino ao computador por USB. Em **Tools → Board** escolha o vosso modelo e em
   **Tools → Port** a porta que aparece (COMx no Windows, /dev/tty… no Mac/Linux).
   Se não aparecer porta e o Arduino for compatível com chip CH340, instale o driver CH340.
4. Clique em **Upload** (seta →). Deve aparecer "Done uploading".
   *Importante:* se o módulo Bluetooth estiver ligado aos pinos 0 e 1, desligue-o durante o
   upload. O programa usa os pinos 10 e 11 precisamente para evitar este problema.
   O programa foi compilado com sucesso para Arduino Uno (usa ~25 % da memória).

### 7.4 Verificar o Arduino pelo computador (sem motores ligados)
1. Arduino IDE → **Tools → Serial Monitor**. Em baixo à direita escolha **9600 baud** e
   **New Line**.
2. Deve aparecer `READY`. Escreva `PING` → deve responder `PONG`.
3. Escreva `START` → `ACK:START`; ~1,6 s depois aparece `OBJ`.
4. Escreva `C:V` → `ACK:V`, o servo roda para o ângulo do verde e ~3 s depois `DONE:V`.
   Escreva depressa: sem mensagens durante 6 s o Arduino pára por segurança (passo 5). Se isso
   acontecer, `C:V` continua a ser aceite no estado `HOLD`.
5. Pare de escrever durante 6 s → aparece `ERR:SEMLIGACAO` e `HOLD` (segurança a funcionar).
6. Escreva `STOP` → `ACK:STOP`.

Também pode testar com a app num **computador com Chrome**: feche o Serial Monitor, abra a app,
Passadeira → "Bluetooth clássico ou cabo USB" → Ligar → escolha a porta do Arduino.

### 7.5 Ligar o telemóvel por Bluetooth
1. Ligue o módulo Bluetooth conforme o esquema que definirmos para o vosso hardware.
2. No telemóvel: **Definições → Bluetooth** → emparelhe o módulo (normalmente "HC-05" ou
   "HC-06", PIN `1234` ou `0000`). *(Módulos BLE como o HM-10 não se emparelham aqui.)*
3. Na app: Passadeira → escolha o tipo de ligação → **Ligar** → escolha o módulo na lista.
4. A pílula fica verde "Arduino ligado". Se ficar vermelha "sem resposta", o módulo liga mas
   o Arduino não responde: verifique a velocidade (9600), os fios TX/RX (cruzados: TX→RX) e o GND.

---

## Etapa 8 — Sincronizar a passadeira e a comporta

O ciclo implementado é:

```
 passadeira anda ──► (sensor deteta objeto  OU  fim de um passo de PASSO_MS)
        ▲                       │
        │                       ▼
        │           pára, espera ESTABILIZAR_MS, envia OBJ
        │                       │
        │          telemóvel analisa ~1 s e responde
        │       ┌───────────────┼──────────────┬──────────────┐
        │     C:E (vazio)   C:P/C:A/C:V      C:X (incerto)   nada em 8 s
        │       │               │              │              │
        └───────┘   comporta roda, espera      HOLD           ERR:TIMEOUT → HOLD
        ▲           SERVO_ESPERA_MS, passadeira (parado, à     (parado)
        │           anda TRANSITO_MS, DONE      espera do operador)
        └───────────────────────┘
```

### Afinações (no início de `ecosort.ino`)
1. **Ângulos da comporta** (`ANGULO_AZUL`, `ANGULO_AMARELO`, `ANGULO_VERDE`, `ANGULO_REPOUSO`):
   com a passadeira parada, envie `START` e depois `C:P` no Serial Monitor e veja para onde aponta
   a comporta. Ajuste, volte a carregar, repita para A e V. Não force o servo contra batentes.
2. **`TRANSITO_MS`**: meça com um cronómetro o tempo que um objeto demora da zona da câmara até
   cair no compartimento. Some ~30 % de margem.
3. **Sem sensor (`USAR_SENSOR = false`)**: ajuste `PASSO_MS` para que cada passo avance
   aproximadamente o comprimento da zona da câmara. Coloque os objetos espaçados.
4. **Com sensor IR (`USAR_SENSOR = true`)**: o sensor deve apontar para o centro da zona da câmara.
   Ajuste o potenciómetro do módulo para detetar os objetos (incluindo vidro transparente, que
   alguns sensores IR detetam mal — testar!).
5. Se o telemóvel demorar mais a decidir, aumente `DECISAO_MAX_MS`.

### Segurança implementada
- Sem mensagens do telemóvel durante 6 s → passadeira pára (`ERR:SEMLIGACAO`).
- Nenhuma decisão em 8 s → pára (`ERR:TIMEOUT`).
- Identificação incerta, "Outro", pouca luz ou câmara desligada → `C:X` → pára.
- Comando não confirmado pelo Arduino (2 tentativas) → a app pára o ciclo e envia `STOP`.
- Arduino reiniciado a meio (ex.: falha de energia) → a app pára o ciclo.
- Botão **Retomar** depois de um HOLD: o Arduino reanalisa a zona antes de voltar a andar, por isso
  um objeto que lá tenha ficado não segue sem decisão.
- Botão **PARAR** grande, sempre visível no separador Passadeira.

---

## Etapa 9 — Testar o protótipo completo

Lista de verificação (marque cada ponto):

- [ ] Telemóvel fixo, sem tremer, a câmara cobre a zona de identificação.
- [ ] Ecrã não se desliga durante o ciclo (a app pede ao Android para manter o ecrã ligado; se
      falhar, aumente o tempo de suspensão do ecrã nas definições).
- [ ] 10 objetos de cada categoria passam e caem no compartimento certo.
- [ ] Passadeira vazia → avança sem encaminhar nada.
- [ ] Objeto "estranho" (ex.: pilha, brinquedo) → pára em HOLD.
- [ ] Desligar o Bluetooth do telemóvel a meio → passadeira pára em ≤ 6 s.
- [ ] Desligar a câmara a meio → próximo objeto fica em HOLD.
- [ ] Botão PARAR pára imediatamente.
- [ ] 15 minutos seguidos sem falhas (aquecimento, bateria, ligação).

Registe na folha de testes: objeto, categoria real, decisão da app, compartimento onde caiu, e
observações. Distinga dois tipos de erro: **erro da IA** (decisão errada) e **erro mecânico**
(decisão certa mas caiu no sítio errado — afinar ângulos/tempos).

---

## Etapa 10 — Corrigir erros e documentar limitações

### Problemas frequentes

| Sintoma | Causa provável | Solução |
|---|---|---|
| "Modelo de IA não encontrado" | Ficheiros fora de `modelo/` ou nomes alterados | Devem chamar-se exatamente `model.json`, `metadata.json`, `weights.bin` |
| Classes "sem categoria" | Nome da classe não reconhecido | Renomear no Teachable Machine e exportar de novo, ou acrescentar a palavra em `ECOSORT_MAPA_CLASSES` |
| Tudo dá "Não tenho certeza" | Poucas fotos ou condições diferentes do treino | Treinar com fotos tiradas no próprio protótipo |
| Funciona na secretária mas não na passadeira | Fundo/luz diferentes | Igual ao anterior |
| Botão Ligar desativado | Navegador sem suporte | Chrome para Android atualizado; no iPhone não é possível |
| HC-05 não aparece na lista | Não emparelhado ou Chrome antigo | Emparelhar nas definições Bluetooth; atualizar o Chrome |
| "Arduino sem resposta" | TX/RX trocados, velocidade diferente, GND em falta | Verificar ligações e `BAUD` (9600) |
| Arduino reinicia quando o motor/servo arranca | Alimentação insuficiente | Fonte separada para motores, GND comum |
| Servo treme | Alimentação fraca ou ângulo encostado ao limite | Fonte adequada; afastar o ângulo do batente |

### O que documentar no relatório
- Arquitetura, custos reais (com faturas) e tempo gasto.
- Número de fotos de treino por classe e número de objetos diferentes.
- Resultados da etapa 6 e 9 com o número de testes, em condições normais e difíceis.
- Pares de materiais confundidos (tabela de confusão).
- Limitações: só 3 categorias; só embalagens; aparência ≠ material; sensibilidade à luz e ao
  fundo; dependência de Android + Chrome; velocidade limitada pelo método pára-e-arranca;
  regras de separação podem variar por município.
- Melhorias futuras: mais dados de treino, sensor indutivo para metais, sensor de peso para vidro,
  combinação de câmara + sensores.

---

## Referência rápida dos ficheiros

| Ficheiro | Para que serve | Precisa de alterar? |
|---|---|---|
| `app/config.js` | Endereço do modelo, regras de decisão, textos dos ecopontos | Sim, se quiser afinar |
| `app/index.html`, `styles.css` | Interface e aspeto | Opcional |
| `app/app.js` | Lógica da interface, testes, passadeira | Não |
| `app/classifier.js` | IA e regras de decisão | Não |
| `app/arduino.js` | Ligações Bluetooth/USB/simulador | Não |
| `app/lib/` | TensorFlow.js 1.3.1 e Teachable Machine 0.8.5 (cópia local, funciona sem CDN) | Não |
| `app/modelo/` | O vosso modelo exportado | Sim (etapa 4) |
| `arduino/ecosort/ecosort.ino` | Controlo da passadeira e comporta | Sim, pinos e tempos (etapas 7–8) |
