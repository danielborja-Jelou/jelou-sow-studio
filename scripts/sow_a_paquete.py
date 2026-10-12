#!/usr/bin/env python3
"""Deriva las fuentes de los extras del paquete a partir de sow.json v2 (una sola fuente de verdad).

Uso: sow_a_paquete.py <sow.json> [salida_base] [--forzar]
Genera (sin sobrescribir lo que ya exista, salvo --forzar):
  <base>_cronograma.json   tareas para cronograma.py, calculadas desde cronograma.hitos (solo si hay cronograma.inicio)
  <base>_propuesta.json    base de la propuesta para propuesta.py (sin inversión: la define Comercial)

El mapa de conversaciones NO se deriva aquí: lo dibuja el motor de diagramas de build_all.js
(agentes[].pasos -> out/diagramas/F1.1.png|svg, F1.2… : visión general, una por etapa y handoff común), el mismo que usan el Word y el simulador. La propuesta
los referencia con `solucion.mapas` y se incrustan con `propuesta.py --diagramas out/diagramas`.

Después: cronograma.py sobre el JSON del cronograma y propuesta.py sobre el de la propuesta.
Si se edita un derivado a mano, el cambio se pierde en la siguiente versión: el cambio va en sow.json
y se vuelve a derivar.
"""
import json
import os
import re
import sys


def arr(x):
    return x if isinstance(x, list) else ([] if x is None else [x])


def recorta(s, n):
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def agentes_de(sow):
    return arr(sow.get("agentes"))


def nombre_int(sow, iid):
    for i in arr(sow.get("integraciones")):
        if i.get("id") == iid:
            return i.get("nombre") or iid
    return iid


def int_de(sow, iid):
    return next((i for i in arr(sow.get("integraciones")) if i.get("id") == iid), {})


def camino_principal(ag):
    """Pasos siguiendo la primera salida de cada paso, desde el primero (el mismo recorrido del Word)."""
    por_id = {p.get("id"): p for p in arr(ag.get("pasos"))}
    out, vistos = [], set()
    cur = arr(ag.get("pasos"))[0] if arr(ag.get("pasos")) else None
    while cur and cur.get("id") not in vistos:
        out.append(cur)
        vistos.add(cur.get("id"))
        sig = arr(cur.get("siguiente"))
        cur = por_id.get(sig[0].get("a")) if sig else None
    return out


def etapas_solucion(sow):
    etapas = []
    for ag in agentes_de(sow):
        pasos = [p for p in arr(ag.get("pasos")) if p.get("etapa")]
        if not pasos:
            pasos = [p for p in arr(ag.get("pasos")) if p.get("tipo") != "fin"]
        etapas.append({
            "nombre": f"{ag.get('id', '')} · {ag.get('nombre', '')}" + (f" — {ag['fase']}" if ag.get("fase") else ""),
            "pasos": [{"titulo": recorta(p.get("etapa") or p.get("diagrama"), 70),
                       "texto": recorta(p.get("descripcion") or p.get("diagrama") or "", 200)} for p in pasos],
        })
    return etapas


def chat_ilustrativo(sow):
    """Conversación del camino principal del primer agente. Los textos vienen del SOW: revisar que no haya datos reales."""
    ags = agentes_de(sow)
    if not ags:
        return None
    ag = ags[0]
    per = ag.get("persona") or {}
    msgs = []
    for p in camino_principal(ag):
        if p.get("tipo") == "mensaje" and p.get("mensaje"):
            m = {"de": "bot", "texto": recorta(p["mensaje"], 220)}
            if arr(p.get("botones")):
                m["opciones"] = arr(p["botones"])[:3]
            msgs.append(m)
        elif p.get("tipo") == "usuario" and p.get("mensaje"):
            msgs.append({"de": "user", "texto": recorta(p["mensaje"], 120)})
        elif p.get("tipo") == "api":
            msgs.append({"de": "api", "texto": recorta(p.get("diagrama") or nombre_int(sow, p.get("integracion")), 60)})
        if len(msgs) >= 8:
            break
    if not msgs:
        return None
    return {"nombre": per.get("nombre") or ag.get("nombre") or "Asistente", "avatar": (per.get("nombre") or "J")[:1].upper(),
            "mensajes": msgs, "nota": "Conversación ilustrativa con datos ficticios. Los textos definitivos se afinan en la implementación."}


def fases_sin_fechas(sow):
    """Ruta en días hábiles acumulados (cuando el SOW aún no tiene cronograma.inicio)."""
    out, acum = [], 0
    for h in arr((sow.get("cronograma") or {}).get("hitos")):
        d = int(h.get("dias_habiles", 1))
        cuando = f"Día hábil {acum + 1}" if d == 1 else f"Días hábiles {acum + 1}–{acum + d}"
        acum += d
        out.append({"cuando": cuando, "titulo": h.get("nombre", ""),
                    "texto": (h.get("descripcion") or "") + (f" · ◆ {h['entregable']}" if h.get("entregable") else "")})
    return out


def responsable_hito(h):
    """Las pruebas del cliente (UAT) las ejecuta el cliente; el resto lo hace Jelou."""
    t = (str(h.get("tipo", "")) + " " + str(h.get("nombre", ""))).lower()
    return "Cliente" if ("uat" in t or "pruebas del cliente" in t or "pruebas con el cliente" in t) else "Jelou"


def cronograma(sow):
    m, cr = sow.get("meta") or {}, sow.get("cronograma") or {}
    tareas, previo = [], None
    for k, h in enumerate(arr(cr.get("hitos")), 1):
        fase = f"{k}. {h.get('nombre', h.get('id', ''))}"
        detalle = arr(h.get("tareas"))
        if detalle:  # opcional: hito con tareas propias {tarea, responsable, dias}
            ult = []
            for j, t in enumerate(detalle, 1):
                tid = f"{h.get('id', k)}_{j}"
                tareas.append({"id": tid, "fase": fase, "tarea": t["tarea"], "responsable": t.get("responsable", "Jelou"),
                               "dias": int(t["dias"]), **({"depende_de": [previo]} if previo else {})})
                ult.append(tid)
            fin = ult
        else:
            tid = str(h.get("id", k))
            tareas.append({"id": tid, "fase": fase, "tarea": h.get("descripcion") or h.get("nombre"),
                           "responsable": h.get("responsable", responsable_hito(h)), "dias": int(h.get("dias_habiles", 1)),
                           **({"depende_de": [previo]} if previo else {})})
            fin = [tid]
        hito_id = f"{h.get('id', k)}_entrega"
        tareas.append({"id": hito_id, "fase": fase, "tarea": h.get("entregable") or h.get("nombre"), "hito": True,
                       "entregable": h.get("entregable") or h.get("nombre"), "descripcion": h.get("descripcion", ""),
                       "depende_de": fin})
        previo = fin[-1]
    return {"cliente": m.get("cliente", ""), "proyecto": m.get("proyecto", ""), "version": m.get("version", "1.0"),
            "inicio": cr.get("inicio"), "feriados": arr(cr.get("festivos")), "tareas": tareas}


def mapas_figuras(sow, base):
    """Mapas de la propuesta = el MISMO conjunto de figuras que el Word (visión general, una por etapa, handoff común).
    Se pide el manifiesto al motor de diagramas (node scripts/lib/figuras.js); cada figura es <id>.svg en --diagramas."""
    import subprocess
    tmp = base + "_sow_tmp.json"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(sow, f, ensure_ascii=False)
        r = subprocess.run(["node", os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib", "figuras.js"), tmp],
                           capture_output=True, text=True, encoding="utf-8", timeout=60)
        if r.returncode == 0:
            return [{"titulo": f["titulo"], "id": f["id"]} for f in json.loads(r.stdout)]
        print("Aviso: no se pudo obtener el conjunto de figuras:", r.stderr.strip()[:200])
    except Exception as e:  # sin node: se cae al mapa por agente
        print("Aviso: sin node para calcular las figuras:", e)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    return [{"titulo": f"{a.get('id', '')} · {a.get('nombre', '')}", "id": str(a.get("id"))} for a in agentes_de(sow)]


def propuesta(sow, base):
    m, al = sow.get("meta") or {}, sow.get("alcance") or {}
    ags = agentes_de(sow)
    comp = arr((sow.get("solucion") or {}).get("componentes"))
    canal = next((a.get("canal") for a in ags if a.get("canal")), "WhatsApp")
    estado = "aprobada" if str(m.get("estado", "en_revision")).lower() == "aprobado" else "en revisión"
    mapas = mapas_figuras(sow, base)
    integ_etapas = []
    for a in ags:
        filas = []
        for p in arr(a.get("pasos")):
            if p.get("integracion"):
                it = int_de(sow, p["integracion"])
                ops = " · ".join(o.get("descripcion", "") for o in arr(it.get("operaciones"))[:3])
                filas.append({"paso": recorta(p.get("etapa") or p.get("diagrama"), 60), "servicio": nombre_int(sow, p["integracion"]),
                              "operaciones": ops, "que_hace": recorta(it.get("proposito", ""), 160)})
        if filas:
            integ_etapas.append({"nombre": f"{a.get('id', '')} · {a.get('nombre', '')}", "filas": filas})
    tiene_inicio = bool((sow.get("cronograma") or {}).get("inicio"))
    p = {
        "titulo_pagina": f"Propuesta · {m.get('cliente', '')}",
        "hero": {"chips": ["Jelou", canal], "eyebrow": "Propuesta de solución",
                 "titulo": m.get("proyecto", ""), "lead": recorta(" ".join(arr(sow.get("brief"))), 400),
                 "meta": [{"k": "Cliente", "v": m.get("cliente", "")}, {"k": "Producto", "v": m.get("bot", m.get("proyecto", ""))},
                          {"k": "Canal", "v": canal}, {"k": "Versión", "v": f"{m.get('version', '')} · {estado}"}]},
        "solucion": {"titulo": "Cómo funciona", "sub": (sow.get("solucion") or {}).get("descripcion", ""),
                     "etapas": etapas_solucion(sow), "mapas": mapas},
        "arquitectura": {"sub": (sow.get("solucion") or {}).get("descripcion", ""),
                         "componentes": [{"nombre": c.get("componente", ""), "texto": c.get("capacidad", "")} for c in comp]},
        "alcance": {"titulo": "Alcance", "sub": "",
                    "incluye": [x.get("texto") for x in arr(al.get("incluido_usuario")) + arr(al.get("incluido_admin"))],
                    "no_incluye": [x.get("texto") for x in arr(al.get("fuera_de_alcance"))],
                    "responsabilidad_cliente": "; ".join(d.get("item", "") for d in arr(sow.get("dependencias_cliente")))},
        "integraciones": {"sub": "", "etapas": integ_etapas},
        "ruta": {"sub": "Fechas en días hábiles, calculadas del mismo cronograma del SOW." if tiene_inicio
                 else "Duración en días hábiles, calculada del mismo cronograma del SOW (las fechas se fijan con la firma).",
                 **({} if tiene_inicio else {"fases": fases_sin_fechas(sow)})},
        "footer": [f"{m.get('cliente', '')} · {m.get('proyecto', '')} · v{m.get('version', '')} ({estado})"],
        "_pendiente": ["reto (tarjetas del problema del cliente)",
                       "revisar el chat ilustrativo: debe usar datos ficticios, nunca datos reales del cliente",
                       "inversion (la define el responsable comercial; sin montos la sección no se imprime)",
                       "cta (siguientes pasos)", "fase2 (opcional)"],
    }
    chat = chat_ilustrativo(sow)
    if chat:
        p["solucion"]["chat"] = chat
    if not tiene_inicio:
        p["ruta"]["titulo"] = "Ruta de implementación"
    # una sección vacía no se imprime
    for k in ("integraciones", "arquitectura"):
        if not (p[k].get("etapas") or p[k].get("componentes")):
            del p[k]
    return p


def escribir(path, contenido, forzar):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    if os.path.exists(path) and not forzar:
        print(f"Existe, no lo toco: {path} (usa --forzar para regenerarlo)")
        return
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(contenido if isinstance(contenido, str) else json.dumps(contenido, ensure_ascii=False, indent=2) + "\n")
    print(f"Generado: {path}")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    forzar = "--forzar" in sys.argv
    if not args:
        sys.exit(__doc__)
    sow = json.load(open(args[0], encoding="utf-8"))
    if not agentes_de(sow):
        sys.exit("sow.json no tiene agentes[].pasos (formato v2): no hay de dónde sacar los flujos.")
    m = sow.get("meta") or {}
    cliente = re.sub(r"\W+", "_", m.get("cliente", "Cliente")).strip("_")
    base = args[1] if len(args) > 1 else f"SOW_{cliente}_v{m.get('version', '1.0')}"
    if (sow.get("cronograma") or {}).get("inicio"):
        escribir(f"{base}_cronograma.json", cronograma(sow), forzar)
    else:
        print("Sin cronograma.inicio en sow.json: no genero el cronograma (la propuesta usará días hábiles sin fechas).")
    escribir(f"{base}_propuesta.json", propuesta(sow, base), forzar)


if __name__ == "__main__":
    main()
