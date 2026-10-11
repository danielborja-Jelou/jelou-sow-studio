"""Brand tokens shared by the Python package scripts (Gantt, schedule workbook, proposal).

Single source: assets/brand.json (the same file the Word template, the diagram engine and the HTML simulator read).
Change colors or fonts there, not in the scripts.
"""
import base64
import json
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(AQUI, "..", "assets")


def cargar():
    with open(os.path.join(ASSETS, "brand.json"), encoding="utf-8") as fh:
        return json.load(fh)


def paleta():
    """Hex colors without '#', named by role."""
    b = cargar()
    t = b["diagramas"]["tipos"]
    w = b["word"]
    return {
        "ink": w["color_texto"], "secundario": w["color_secundario"], "acento_texto": w["color_acento"],
        "teal": t["usuario"]["borde"], "teal_oscuro": t["webview"]["borde"],
        "teal_suave": t["usuario"]["relleno"], "teal_suave2": t["webview"]["relleno"],
        "oscuro": t["api"]["relleno"], "gris": t["asesor"]["borde"], "gris_suave": t["asesor"]["relleno"],
        "borde": w["tabla"]["borde"], "cabecera": w["tabla"]["fondo_cabecera"],
        "pendiente": w["color_pendiente"],
        "wa_cabecera": b["html"]["whatsapp"]["cabecera"].lstrip("#"),
    }


def fuente():
    """Family names used in text (Excel, SVG, CSS)."""
    f = cargar()["fuentes"]
    return f["texto"], f["titulos"]


def ruta_fuente(clave):
    """Absolute path of a font file: 'regular' | 'semibold'."""
    return os.path.normpath(os.path.join(ASSETS, cargar()["fuentes"]["archivos"][clave]))


def font_face_css():
    """@font-face rules with the Poppins files embedded as base64 (the HTML stays self-contained)."""
    familia, _ = fuente()
    out = []
    for clave, peso in (("regular", "300 500"), ("semibold", "600 800")):
        ruta = ruta_fuente(clave)
        if not os.path.exists(ruta):
            continue
        with open(ruta, "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode()
        out.append(f"@font-face{{font-family:'{familia}';font-weight:{peso};font-style:normal;"
                   f"src:url(data:font/ttf;base64,{b64}) format('truetype')}}")
    return "\n".join(out)
