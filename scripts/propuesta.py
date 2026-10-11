#!/usr/bin/env python3
"""Presentación de la propuesta (HTML de una página, autocontenido) + PDF para adjuntar.

Uso: propuesta.py <propuesta.json> [salida_base] [--cronograma <cronograma.json>] [--diagramas <carpeta>] [--sin-pdf]
Genera <base>.html (abre en cualquier navegador, modo claro/oscuro) y <base>.pdf (si hay Chrome o Edge).

- Formato del JSON: assets/propuesta_ejemplo.json (lo pre-llena sow_a_paquete.py desde sow.json). Toda sección
  es opcional; la numeración y la barra de navegación se arman solas con las presentes.
- Texto con **negrita** estilo Markdown; el resto se escapa (no se acepta HTML).
- Diseño: assets/propuesta.css con los colores y la tipografía (Poppins, incrustada) de assets/brand.json.
- `solucion.mapas`: lista de {titulo, id}; cada SVG se toma de `--diagramas <carpeta>/<id>.svg`, la carpeta de
  diagramas que genera build_all.js (el mismo motor de diagramas del Word y del simulador). Si falta, se omite con aviso.
- `--cronograma`: si se pasa, la sección Ruta se calcula del mismo JSON del Gantt, así propuesta, SOW y Gantt no
  se contradicen. Sin cronograma, la sección usa `ruta.fases` (días hábiles acumulados, sin fechas).
- Los importes de inversión los define Comercial: sin montos, la sección no se imprime.
"""
import argparse
import base64
import datetime as dt
import glob
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import brand  # noqa: E402

CSS = os.path.join(AQUI, "..", "assets", "propuesta.css")
# Reglas solo para el PDF: que ningún bloque (chat, tarjeta, fila, mapa) se parta entre páginas.
PRINT_CSS = """
@page{size:A4;margin:12mm 10mm}
@media print{
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .nav{display:none}
  .card,.phone,.chatlead,.c,.phase,.invtile,.scopecol,.note,.cta,tr,.step,.stage{break-inside:avoid}
  .sec-head{break-inside:avoid}
  .sec-head,.subh,.stage,h3{break-after:avoid}
  .chatlead{break-before:auto}
}
"""


def t(s):
    """Escapa y convierte **negrita** → <b>."""
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", html.escape(str(s or "")))


def lista(items, cls="li"):
    return f'<ul class="{cls}">' + "".join(f"<li>{t(i)}</li>" for i in items) + "</ul>"


def cabecera(n, titulo, sub):
    return (f'<div class="sec-head"><span class="sec-num">{n}</span><div><h2>{t(titulo)}</h2>'
            + (f'<p class="sub">{t(sub)}</p>' if sub else "") + "</div></div>")


def nota(txt, titulo=None):
    if not txt:
        return ""
    if isinstance(txt, list):
        txt = "; ".join(str(x) for x in txt if x)
    return f'<div class="note">' + (f"<strong>{t(titulo)}:</strong> " if titulo else "") + f"{t(txt)}</div>"


def cards(cs):
    return '<div class="grid g3">' + "".join(
        f'<div class="card"><span class="ico">{t(c.get("ico", ""))}</span><h3>{t(c["titulo"])}</h3><p>{t(c.get("texto", ""))}</p></div>'
        for c in cs) + "</div>"


def tiles(ts):
    out = '<div class="inv">'
    for i, x in enumerate(ts):
        borde = ' style="border-top:3px solid var(--accent)"' if i == 0 else ""
        out += f'<div class="invtile"{borde}><div class="big" style="font-size:32px">{t(x["valor"])}</div><div class="lbl">{t(x["label"])}</div></div>'
    return out + "</div>"


def tabla(columnas, filas, num=()):
    th = "".join(f'<th{" class=hh" if i in num else ""}>{t(c)}</th>' for i, c in enumerate(columnas))
    tr = "".join("<tr>" + "".join(f'<td{" class=hh" if i in num else ""}>{t(v)}</td>' for i, v in enumerate(f)) + "</tr>" for f in filas)
    return f'<div class="tblwrap"><table><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table></div>'


# ---------- secciones ----------

def sec_reto(d, n):
    return cabecera(n, d.get("titulo", "El reto"), d.get("sub")) + cards(d.get("cards", []))


def chat(c):
    out = (f'<div class="chatlead"><div class="phone"><div class="wa-head"><div class="av">{t(c.get("avatar", "J"))}</div>'
           f'<div><div class="nm">{t(c.get("nombre", "Asistente"))}</div><div class="st">en línea</div></div></div><div class="wa-body">')
    for m in c.get("mensajes", []):
        if m.get("de") == "api":
            out += f'<div class="api">{t(m["texto"])}</div>'
            continue
        cls = "out" if m.get("de") == "user" else "in"
        cuerpo = "<br>".join(t(x) for x in str(m["texto"]).split("\n"))
        ops = "".join(f'<div class="o">{t(o)}</div>' for o in m.get("opciones", []))
        hora = f' <span class="t">{t(m["hora"])}</span>' if m.get("hora") else ""
        out += f'<div class="b {cls}">{cuerpo}{hora}' + (f'<div class="wa-opts">{ops}</div>' if ops else "") + "</div>"
    out += "</div></div>"
    if c.get("nota"):
        out += f'<p style="font-size:12px;color:var(--muted);text-align:center;max-width:52ch;margin:12px auto 0">{t(c["nota"])}</p>'
    return out + "</div>"


def mapas_html(d, diagramas):
    """Mapas de conversación: SVG del motor de diagramas, incrustados como <img> (data URI) para aislarlos del CSS de la página."""
    out = ""
    for m in d.get("mapas", []):
        ruta = os.path.join(diagramas or "", f"{m['id']}.svg")
        if not diagramas or not os.path.exists(ruta):
            print(f"Aviso: no encuentro el diagrama {m['id']}.svg en {diagramas or '(sin --diagramas)'}; el mapa se omite.")
            continue
        b64 = base64.b64encode(open(ruta, "rb").read()).decode()
        out += (f'<h3 class="mapatit">{t(m.get("titulo", m["id"]))}</h3><div class="card mapa">'
                f'<img alt="{html.escape(str(m.get("titulo", m["id"])))}" src="data:image/svg+xml;base64,{b64}"></div>')
    if out:
        out = '<h3 class="subh">Mapas de conversaciones</h3>' + out
    return out


def sec_solucion(d, n, diagramas):
    flujo = '<div class="flow">'
    for e in d.get("etapas", []):
        flujo += f'<div class="stage">{t(e["nombre"])}</div>'
        for p in e.get("pasos", []):
            flujo += f'<div class="step"><div class="dot"></div><div><h3>{t(p["titulo"])}</h3>'
            if p.get("texto"):
                flujo += f"<p>{t(p['texto'])}</p>"
            if p.get("items"):
                flujo += "<ul>" + "".join(f"<li>{t(i)}</li>" for i in p["items"]) + "</ul>"
            flujo += "</div></div>"
    flujo += "</div>"
    cuerpo = f'<div class="solgrid">{flujo}{chat(d["chat"])}</div>' if d.get("chat") else flujo
    cuerpo += mapas_html(d, diagramas)
    return cabecera(n, d.get("titulo", "La solución"), d.get("sub")) + cuerpo


def sec_arquitectura(d, n):
    comp = '<div class="comp">' + "".join(
        f'<div class="c"><div class="n">{t(c["nombre"])}</div><div class="d">{t(c.get("texto", ""))}</div></div>'
        for c in d.get("componentes", [])) + "</div>"
    return cabecera(n, d.get("titulo", "Arquitectura sobre el Brain de Jelou"), d.get("sub")) + comp


def sec_alcance(d, n):
    return (cabecera(n, d.get("titulo", "Alcance"), d.get("sub"))
            + '<div class="scope">'
            + f'<div class="scopecol in"><h3>{t(d.get("titulo_incluye", "Incluye"))}</h3>{lista(d.get("incluye", []))}</div>'
            + f'<div class="scopecol out"><h3>{t(d.get("titulo_no_incluye", "No incluye (evolución futura)"))}</h3>{lista(d.get("no_incluye", []))}</div>'
            + "</div>" + nota(d.get("responsabilidad_cliente"), "Responsabilidad del cliente"))


def sec_integraciones(d, n):
    filas = ""
    for e in d.get("etapas", []):
        filas += f'<tr class="catrow"><td colspan="3">{t(e["nombre"])}</td></tr>'
        fs = e.get("filas", [])
        i = 0
        while i < len(fs):
            j = i
            while j + 1 < len(fs) and fs[j + 1].get("paso") == fs[i].get("paso"):
                j += 1
            for k in range(i, j + 1):
                f = fs[k]
                servicio = f"<b>{t(f['servicio'])}</b>" + (f'<br><span class="mini">{t(f["operaciones"])}</span>' if f.get("operaciones") else "")
                paso = (f'<td rowspan="{j - i + 1}"><strong>{t(f["paso"])}</strong></td>' if k == i else "")
                filas += f"<tr>{paso}<td>{servicio}</td><td>{t(f.get('que_hace', ''))}</td></tr>"
            i = j + 1
    tbl = ('<div class="tblwrap"><table><thead><tr><th>Paso del flujo</th><th>Servicio · operaciones</th><th>Qué hace</th></tr></thead>'
           f"<tbody>{filas}</tbody></table></div>")
    return cabecera(n, d.get("titulo", "Integraciones"), d.get("sub")) + tbl + nota(d.get("nota"), "Por confirmar")


def sec_inversion(d, n):
    mon = d.get("moneda", "USD")
    filas = "".join(f'<tr><td><strong>{t(b["nombre"])}</strong></td><td>{t(b.get("incluye", ""))}</td><td class="hh">{t(b["valor"])}</td></tr>'
                    for b in d.get("bloques", []))
    pie = (f'<tfoot><tr><td colspan="2">Valor total</td><td class="hh">{t(mon)} {t(d["total"])}</td></tr></tfoot>' if d.get("total") else "")
    tbl = ('<div class="tblwrap" style="margin-top:18px"><table><thead><tr><th>Bloque de implementación</th><th>Qué incluye</th>'
           f'<th class="hh">Valor ({t(mon)})</th></tr></thead><tbody>{filas}</tbody>{pie}</table></div>')
    return (cabecera(n, d.get("titulo", "Inversión"), d.get("sub")) + tiles(d.get("tiles", []))
            + (tbl if filas else "") + nota(d.get("nota"), "Nota comercial"))


def sec_soporte(d, n):
    out = cabecera(n, d.get("titulo", "Valor hora y esquemas de soporte"), d.get("sub")) + tiles(d.get("tiles", []))
    out += nota(d.get("nota"))
    for tb in d.get("tablas", []):
        out += f'<h3 class="subh">{t(tb["titulo"])}</h3>'
        if tb.get("sub"):
            out += f'<p class="sub" style="margin-bottom:16px">{t(tb["sub"])}</p>'
        out += tabla(tb["columnas"], tb["filas"], set(tb.get("columnas_numericas", [])))
    c = d.get("cobertura")
    if c:
        out += (f'<h3 class="subh">{t(c.get("titulo", "Qué cubre cada frente"))}</h3><div class="scope" style="margin-top:16px">'
                f'<div class="scopecol in"><h3>{t(c["in_titulo"])}</h3>{lista(c["in"], "")}</div>'
                f'<div class="scopecol out"><h3>{t(c["out_titulo"])}</h3>{lista(c["out"], "")}</div></div>')
    return out + nota(d.get("nota_final"), "Reglas de consumo y facturación")


def fases_desde_cronograma(path):
    from cronograma import calcular  # noqa: E402
    cfg = json.load(open(path, encoding="utf-8"))
    tareas, _ = calcular(cfg)
    f0 = min(x["inicio"] for x in tareas)
    lunes0 = f0 - dt.timedelta(days=f0.weekday())
    orden, por_fase = [], {}
    for x in tareas:
        if x["fase"] not in por_fase:
            orden.append(x["fase"])
            por_fase[x["fase"]] = []
        por_fase[x["fase"]].append(x)
    fases = []
    for f in orden:
        xs = por_fase[f]
        s1 = (min(x["inicio"] for x in xs) - lunes0).days // 7 + 1
        s2 = (max(x["fin"] for x in xs) - lunes0).days // 7 + 1
        cuando = f"Semana {s1}" if s1 == s2 else f"Semanas {s1}–{s2}"
        texto = " · ".join(("◆ " if x.get("hito") else "") + x["tarea"] + ("" if x["responsable"] == "Jelou" or x.get("hito") else f" ({x['responsable']})") for x in xs)
        fases.append({"cuando": cuando, "titulo": re.sub(r"^\d+\.\s*", "", f), "texto": texto})
    return fases


def sec_ruta(d, n, cronograma=None):
    fases = fases_desde_cronograma(cronograma) if cronograma else d.get("fases", [])
    tl = '<div class="tl">' + "".join(
        f'<div class="phase"><div class="wk">{t(f["cuando"])}</div><div class="desc"><h3>{t(f["titulo"])}</h3><p>{t(f.get("texto", ""))}</p></div></div>'
        for f in fases) + "</div>"
    return cabecera(n, d.get("titulo", "Ruta de implementación"), d.get("sub")) + tl + nota(d.get("nota"))


def sec_fase2(d, n):
    return cabecera(n, d.get("titulo", "Fase 2"), d.get("sub")) + cards(d.get("cards", [])) + nota(d.get("nota"), "Base reutilizable")


SECCIONES = [  # (clave, id, etiqueta nav)
    ("reto", "reto", "Reto"), ("solucion", "solucion", "Solución"), ("arquitectura", "arquitectura", "Arquitectura"),
    ("alcance", "alcance", "Alcance"), ("integraciones", "integraciones", "Integraciones"),
    ("inversion", "inversion", "Inversión"), ("soporte", "soporte", "Soporte"), ("ruta", "ruta", "Ruta"),
    ("fase2", "fase2", "Fase 2"),
]


def css_marca():
    """propuesta.css con los tokens {{nombre}} sustituidos por assets/brand.json, más la tipografía incrustada."""
    css = open(CSS, encoding="utf-8").read()
    pal = brand.paleta()
    pal["fuente"] = brand.fuente()[0]
    for k, v in pal.items():
        css = css.replace("{{" + k + "}}", v)
    return brand.font_face_css() + "\n" + css


def construir(cfg, diagramas=None, cronograma=None):
    css = css_marca()
    h = cfg.get("hero", {})
    chips = "".join(f'<span class="chip{" wa" if i == 1 else ""}">{t(c)}</span>' for i, c in enumerate(h.get("chips", [])))
    meta = "".join(f'<div><div class="k">{t(m["k"])}</div><div class="v">{t(m["v"])}</div></div>' for m in h.get("meta", []))
    hero = (f'<header class="hero"><div class="paw"></div><div class="wrap"><div class="brandrow">{chips}</div>'
            f'<span class="eyebrow">{t(h.get("eyebrow", "Propuesta de solución"))}</span><h1>{t(h["titulo"])}</h1>'
            f'<p class="lead">{t(h.get("lead", ""))}</p><div class="herometa">{meta}</div></div></header>')
    presentes = [s for s in SECCIONES if s[0] in cfg or (s[0] == "ruta" and cronograma)]
    nav = '<nav class="nav" aria-label="Secciones de la propuesta"><div class="wrap">' + "".join(
        f'<a href="#{sid}"><span class="n">{i}</span>{lbl}</a>' for i, (_, sid, lbl) in enumerate(presentes, 1)) + "</div></nav>"
    cuerpo = ""
    for i, (clave, sid, _) in enumerate(presentes, 1):
        d = cfg.get(clave, {})
        if clave == "solucion":
            html_sec = sec_solucion(d, i, diagramas)
        elif clave == "ruta":
            html_sec = sec_ruta(d, i, cronograma)
        else:
            html_sec = globals()[f"sec_{clave}"](d, i)
        cuerpo += f'<section id="{sid}">{html_sec}</section>'
    c = cfg.get("cta")
    if c:
        pasos = "".join(f"<span>{t(p)}</span>" for p in c.get("pasos", []))
        cuerpo += (f'<section><div class="cta"><span class="eyebrow" style="color:#7fdbe8">{t(c.get("eyebrow", "Siguiente paso"))}</span>'
                   f'<h2 style="margin-top:10px">{t(c["titulo"])}</h2><p>{t(c.get("texto", ""))}</p>'
                   f'<div class="steps-next">{pasos}</div></div></section>')
    pie = "".join(f'<p{" style=margin-top:6px" if i else ""}>{t(x)}</p>' for i, x in enumerate(cfg.get("footer", [])))
    return ('<!doctype html><html lang="es"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{t(cfg.get("titulo_pagina", h.get("titulo", "Propuesta")))}</title><style>{css}{PRINT_CSS}</style></head><body>'
            f'{hero}{nav}<main class="wrap">{cuerpo}</main><footer class="wrap">{pie}</footer></body></html>')


def navegador():
    """Chrome, Edge o Chromium headless para imprimir a PDF (Windows, macOS y Linux)."""
    cands = []
    for var in ("CHROME_PATH", "BROWSER_PATH"):
        if os.environ.get(var):
            cands.append(os.environ[var])
    for base in (os.environ.get("PROGRAMFILES", ""), os.environ.get("PROGRAMFILES(X86)", ""), os.environ.get("LOCALAPPDATA", "")):
        if base:
            cands += [os.path.join(base, "Google", "Chrome", "Application", "chrome.exe"),
                      os.path.join(base, "Microsoft", "Edge", "Application", "msedge.exe")]
    cands += ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
              "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]
    cands += sorted(glob.glob(os.path.expanduser("~/.cache/puppeteer/chrome-headless-shell/*/*/chrome-headless-shell")))
    for b in ("google-chrome", "chromium", "chromium-browser", "chrome", "msedge"):
        p = shutil.which(b)
        if p:
            cands.append(p)
    for c in cands:
        if c and os.path.exists(c):
            return c
    return None


def pdf(html_path, pdf_path):
    exe = navegador()
    if not exe:
        print("Sin Chrome ni Edge: no genero el PDF (imprime el HTML a PDF desde el navegador, o define CHROME_PATH).")
        return False
    # Se imprime en una carpeta temporal (ruta corta) y se mueve: en Windows las rutas largas hacen fallar a Chrome.
    tmp = tempfile.mkdtemp(prefix="propuesta_")
    try:
        h = os.path.join(tmp, "p.html")
        shutil.copyfile(html_path, h)
        r = subprocess.run([exe, "--headless", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
                            f"--print-to-pdf={os.path.join(tmp, 'p.pdf')}", "file:///" + h.replace("\\", "/")],
                           capture_output=True, text=True, timeout=180)
        if r.returncode == 0 and os.path.exists(os.path.join(tmp, "p.pdf")):
            shutil.move(os.path.join(tmp, "p.pdf"), pdf_path)
            return True
        print("PDF no generado: " + r.stderr.strip()[-200:])
        return False
    except (OSError, subprocess.TimeoutExpired) as ex:
        print(f"PDF no generado: {ex}")
        return False
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("json")
    ap.add_argument("base", nargs="?")
    ap.add_argument("--cronograma")
    ap.add_argument("--diagramas", help="carpeta con <id>.svg de los diagramas (la que genera build_all.js)")
    ap.add_argument("--sin-pdf", action="store_true")
    a = ap.parse_args()
    cfg = json.load(open(a.json, encoding="utf-8"))
    base = a.base or os.path.splitext(a.json)[0]
    out = base + ".html"
    with open(out, "w", encoding="utf-8") as f:
        f.write(construir(cfg, a.diagramas, a.cronograma))
    print(out)
    if not a.sin_pdf and pdf(out, base + ".pdf"):
        print(base + ".pdf")


if __name__ == "__main__":
    main()
