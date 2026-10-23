import json, sys
import numpy as np
d = json.load(open(sys.argv[1])); classes = d["classes"]
CAT = {"Papel": "papel", "Cartão": "papel", "Plástico": "amarelo", "Metal": "amarelo", "Vidro": "vidro", "Outro": "outro"}
cats = ["papel", "amarelo", "vidro", "outro"]
M = np.array([[1 if CAT[c] == k else 0 for k in cats] for c in classes])  # classes -> categorias
for conf, marg in [(0.8, 0.25), (0.7, 0.2), (0.9, 0.4)]:
  print(f"\n== limiar confiança {conf}, margem {marg}")
  for k, r in d["resultados"].items():
    P = np.array(r["P"]); y = np.array(r["y"])
    yc = (M[y].argmax(1)); Pc = P @ M
    acc6 = (P.argmax(1) == y).mean(); acc_c = (Pc.argmax(1) == yc).mean()
    s = np.sort(Pc, 1); top = Pc.argmax(1); confs = s[:, -1]; margem = s[:, -1] - s[:, -2]
    decide = (confs >= conf) & (margem >= marg) & (top != 3)    # "outro" nunca encaminha
    reais = yc != 3
    ok = decide & (top == yc)
    print(f"{k:14s} acc 6 classes {acc6:.1%} | acc destino {acc_c:.1%} | "
          f"resíduos recicláveis: decide {decide[reais].mean():.1%}, certo quando decide {ok[reais].sum()/max(1,decide[reais].sum()):.1%}, "
          f"encaminhamentos errados {(decide & (top != yc))[reais].sum()}/{reais.sum()} | 'outro' encaminhado por engano {decide[~reais].sum()}/{(~reais).sum()}")
    if conf == 0.8:
      cm = np.zeros((4, 5), int)
      for t, p, dd in zip(yc, top, decide): cm[t, p if dd else 4] += 1
      print("   real\\prev  " + " ".join(f"{c[:7]:>8s}" for c in cats[:3] + ["outro", "s/decisão"]))
      for i, c in enumerate(cats): print(f"   {c:9s}" + " ".join(f"{v:8d}" for v in cm[i]))
