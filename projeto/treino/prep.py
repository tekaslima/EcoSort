# Prepara o TrashNet: divisão treino/teste estratificada e aumento de dados.
import json, random, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

SRC = Path(sys.argv[1]); OUT = Path(sys.argv[2]); OUT.mkdir(exist_ok=True)
CLASSES = [("Papel", "paper"), ("Cartão", "cardboard"), ("Plástico", "plastic"),
           ("Metal", "metal"), ("Vidro", "glass"), ("Outro", "trash")]
N_AUG = 5
rng = random.Random(42)

def centro(im):
    w, h = im.size; s = min(w, h)
    return im.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2)).resize((224, 224), Image.BILINEAR)

def aumentar(im, r):
    w, h = im.size
    # rotação com preenchimento da cor média dos cantos (fundo)
    cantos = [im.getpixel(p) for p in [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3)]]
    fundo = tuple(int(np.mean([c[i] for c in cantos])) for i in range(3))
    im = im.rotate(r.uniform(-30, 30), resample=Image.BILINEAR, fillcolor=fundo)
    # recorte aleatório (zoom / objeto descentrado)
    s = int(min(w, h) * r.uniform(0.6, 1.0))
    x = r.randint(0, w - s); y = r.randint(0, h - s)
    im = im.crop((x, y, x + s, y + s)).resize((224, 224), Image.BILINEAR)
    if r.random() < 0.5: im = ImageOps.mirror(im)
    if r.random() < 0.2: im = ImageOps.flip(im)
    im = ImageEnhance.Brightness(im).enhance(r.uniform(0.55, 1.35))
    im = ImageEnhance.Contrast(im).enhance(r.uniform(0.7, 1.3))
    im = ImageEnhance.Color(im).enhance(r.uniform(0.6, 1.3))
    # luz quente/fria
    a = np.asarray(im).astype(np.float32) * np.array([r.uniform(0.88, 1.12), 1.0, r.uniform(0.88, 1.12)])
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    if r.random() < 0.25: im = im.filter(ImageFilter.GaussianBlur(r.uniform(0.5, 1.6)))
    if r.random() < 0.3:
        a = np.asarray(im).astype(np.float32) + np.random.default_rng(r.randint(0, 1 << 30)).normal(0, r.uniform(3, 10), (224, 224, 3))
        im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    return im

conjuntos = {"treino": [], "teste": [], "teste_dificil": []}
for ci, (nome, pasta) in enumerate(CLASSES):
    fich = sorted((SRC / pasta).glob("*.jpg")); rng.shuffle(fich)
    nt = round(len(fich) * 0.2)
    for i, f in enumerate(fich):
        im = Image.open(f).convert("RGB")
        if i < nt:
            conjuntos["teste"].append((centro(im), ci, f.name))
            conjuntos["teste_dificil"].append((aumentar(im, rng), ci, f.name))
        else:
            conjuntos["treino"].append((centro(im), ci, f.name))
            for _ in range(N_AUG): conjuntos["treino"].append((aumentar(im, rng), ci, f.name))

for k, itens in conjuntos.items():
    X = np.stack([np.asarray(im, dtype=np.uint8) for im, _, _ in itens])
    X.tofile(OUT / f"{k}_X.u8")
    json.dump({"y": [c for _, c, _ in itens], "src": [s for _, _, s in itens]}, open(OUT / f"{k}_y.json", "w"))
    print(k, X.shape, np.bincount([c for _, c, _ in itens]))
json.dump([n for n, _ in CLASSES], open(OUT / "classes.json", "w"), ensure_ascii=False)
# algumas imagens de exemplo para inspeção visual
for i in range(6): conjuntos["treino"][i * 37][0].save(OUT / f"exemplo_aug_{i}.jpg")
