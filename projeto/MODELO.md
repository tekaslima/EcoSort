# Modelo inicial de IA do EcoSort

A aplicação já inclui um modelo treinado (`app/modelo/`), para funcionar sem esperar pelo
treino com os vossos resíduos.

## Como foi feito
- **Dados:** conjunto público [TrashNet](https://github.com/garythung/trashnet) (G. Thung e
  M. Yang, Stanford, licença MIT): 2527 fotografias de resíduos sobre fundo branco, em 6 classes.
- **Classes do modelo → destino na app:**

  | Classe | Fotos | Destino |
  |---|---|---|
  | Papel | 594 | Ecoponto azul |
  | Cartão | 403 | Ecoponto azul |
  | Plástico | 482 | Ecoponto amarelo |
  | Metal | 410 | Ecoponto amarelo |
  | Vidro | 501 | Ecoponto verde |
  | Outro (lixo diverso) | 137 | Não encaminha |

- **Divisão:** 80 % das fotografias para treino, 20 % (505) guardadas só para teste.
- **Aumento de dados:** cada foto de treino foi usada mais 5 vezes com rotação, zoom,
  objeto descentrado, espelho, variações de brilho, contraste, cor da luz, desfoque e ruído.
- **Rede:** a mesma do Teachable Machine (MobileNet v2, α 0,35) + camada final treinada.
  O modelo final foi montado com a biblioteca oficial do Teachable Machine e tem o mesmo formato
  de um modelo exportado de lá (2,2 MB). Uma versão maior da rede (α 1,0) foi testada e
  não melhorou os resultados nas imagens difíceis, por isso não foi usada.
- Scripts usados: pasta `treino/` (para referência; não são necessários para usar a app).

## Resultados medidos (505 fotografias nunca vistas no treino)
Regras de decisão por defeito (confiança ≥ 80 %, margem ≥ 25 pontos), uma foto por análise.

| Conjunto de teste | Decide (recicláveis) | Certo quando decide | Encaminhamentos errados | "Outro" encaminhado por engano |
|---|---|---|---|---|
| Fotos de teste originais | 75 % | 97 % | 11 de 478 | 3 de 27 |
| As mesmas fotos com luz, ângulo e zoom alterados | 70 % | 94 % | 21 de 478 | 6 de 27 |

Medido também na própria aplicação no navegador (fotos originais): decide 76 %, certo quando
decide 97 %, 12 encaminhamentos errados em 478.

- O vidro é a categoria mais difícil: fica muitas vezes por decidir e, quando erra, é quase
  sempre confundido com plástico (garrafas transparentes).
- Quando o sistema não tem certeza, responde "Não tenho certeza" em vez de arriscar. É esse o
  comportamento pretendido.

## Limitações importantes
- **Estes números são para fotografias do TrashNet, não para o vosso protótipo.** As fotos do
  TrashNet são de objetos sobre fundo branco, bem iluminados. Com outro fundo, outra luz ou
  objetos portugueses diferentes, a precisão pode ser bastante menor. Só os testes da etapa 6
  do guia, feitos com resíduos reais, dizem quanto o sistema acerta no vosso caso.
- O modelo **não tem a classe "Vazio"** (passadeira sem objeto). Para a passadeira é preciso
  treinar o vosso próprio modelo.
- Pacotes de leite/sumo (vão para o amarelo) não têm classe própria no TrashNet. É provável que
  o modelo os confunda com cartão: testem com pacotes reais.
- A "confiança" mostrada é a do modelo, não uma probabilidade real de acerto.

## Recomendação
Usem este modelo para demonstrar e testar a aplicação já. Para o protótipo final, treinem um
modelo no Teachable Machine com fotografias tiradas no próprio protótipo (GUIA.md, etapa 4).
Podem também juntar as vossas fotos às do TrashNet.
