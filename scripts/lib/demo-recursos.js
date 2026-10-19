// Motor de recursos visuales del simulador: catálogo (datos) + emparejamiento por señales + recetas con variables.
// Tres capas, la última gana por `id`:  1) assets/visuales/recursos.json de la skill  2) ~/.claude/jelou-sow-studio/visuales/recursos.json (lo que
// enseñas con aprender_recurso.js; sobrevive a las actualizaciones de la skill)  3) sow.json > demo.recursos (solo ese cliente).
const fs = require("fs");
const os = require("os");
const path = require("path");
const assets = require("./demo-assets");

const SKILL_DIR = path.join(__dirname, "..", "..", "assets", "visuales");
const USER_DIR = process.env.JELOU_SOW_VISUALES || path.join(os.homedir(), ".claude", "jelou-sow-studio", "visuales");
const arr = (x) => (Array.isArray(x) ? x : []);
const sinAcentos = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const re0 = (s) => { try { return new RegExp(s, "i"); } catch (e) { return null; } };
// una regex de la receta acierta si acierta sobre el texto tal cual o sin acentos
const re = (s) => { const x = re0(s); if (!x) return null; return { test: (t) => x.test(String(t == null ? "" : t)) || x.test(sinAcentos(t)) }; };
const slug = (s) => String(s || "x").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "x";

function leer(dir) {
  const f = path.join(dir, "recursos.json");
  if (!fs.existsSync(f)) return [];
  try { return arr(JSON.parse(fs.readFileSync(f, "utf8")).recursos).map((r) => ({ ...r, _dir: dir })); } catch (e) { console.warn(`Catálogo ilegible (${f}): ${e.message}`); return []; }
}
function fusionar(base, extra) {
  const out = { ...base, ...extra, senales: { ...(base.senales || {}), ...(extra.senales || {}) } };
  if (base.proveedores || extra.proveedores) {
    const m = new Map(arr(base.proveedores).map((p) => [p.id, p]));
    for (const p of arr(extra.proveedores)) m.set(p.id, { ...(m.get(p.id) || {}), ...p });
    out.proveedores = [...m.values()];
  }
  out._dirs = [...(base._dirs || [base._dir]), ...(extra._dir ? [extra._dir] : [])].filter(Boolean);
  return out;
}
function cargarCatalogo(sow) {
  const capas = [leer(SKILL_DIR), leer(USER_DIR), arr(((sow || {}).demo || {}).recursos).map((r) => ({ ...r, _dir: null }))];
  const map = new Map(); const orden = [];
  for (const capa of capas) for (const r of capa) { if (map.has(r.id)) map.set(r.id, fusionar(map.get(r.id), r)); else { map.set(r.id, { ...r, _dirs: [r._dir].filter(Boolean) }); orden.push(r.id); } }
  return orden.map((id) => map.get(id));
}

// ---------- emparejamiento ----------
function contexto(nodo, integ) {
  const i = integ || {};
  const partes = { etapa: nodo.etapa || "", componente: nodo.componente || "", diagrama: nodo.diagrama || "", mensaje: nodo.mensaje || "", herramienta: nodo.herramienta || "", integracion: [i.nombre, i.sistema, i.slug, i.proposito].filter(Boolean).join(" ") };
  partes.texto = [partes.etapa, partes.componente, partes.diagrama, partes.herramienta, partes.integracion].join(" ");
  return partes;
}
function puntaje(r, ctx) {
  const s = r.senales || {}; let n = 0;
  for (const [k, v] of Object.entries(s)) { if (k === "excluir") continue; const x = re(v); if (x && ctx[k] != null && x.test(ctx[k])) n++; }
  if (n && s.excluir) { const x = re(s.excluir); if (x && x.test(`${ctx.texto} ${ctx.mensaje}`)) return 0; }
  return n;
}
function proveedorDe(r, ctx, forzado, integ, pais) {
  const lista = arr(r.proveedores);
  const delPais = (xs) => xs.find((x) => arr(x.paises).some((c) => sinAcentos(c).toLowerCase() === sinAcentos(pais || "").toLowerCase())) || xs.find((x) => !arr(x.paises).length) || xs[0];
  let p = forzado ? delPais(lista.filter((x) => x.id === forzado || (re(x.match) && re(x.match).test(forzado)))) : null;
  if (!p) { const c = lista.filter((x) => x.match && re(x.match) && re(x.match).test(`${ctx.texto} ${ctx.mensaje}`)); if (c.length) p = delPais(c); }
  // un proveedor por país (mercadopago-colombia…) hereda del proveedor base con el mismo `match` lo que no defina (mensaje propio, medios…)
  if (p && p.match) { const h = lista.find((x) => x !== p && x.match === p.match && !arr(x.paises).length); if (h) p = { ...h, ...p }; }
  const def = r.proveedor_por_defecto || {};
  const sistema = integ && integ.sistema && !/^jelou/i.test(integ.sistema) ? integ.sistema : null;
  const base = p || { id: slug(sistema || def.nombre || r.nombre), nombre: sistema || def.nombre || (integ && integ.nombre) || r.nombre };
  return { ...def, ...base, nombre: (p && p.nombre) || sistema || def.nombre || base.nombre };
}
// Devuelve { recurso, proveedor, explicito } o null
function resolver(catalogo, nodo, integ, opts = {}) {
  const ex = nodo.recurso || (integ && (integ.recurso || integ.visual));
  const exId = ex && typeof ex === "object" ? ex.recurso || ex.id : ex; const exProv = ex && typeof ex === "object" ? ex.proveedor : null;
  const ctx = contexto(nodo, integ);
  if (exId) { const r = catalogo.find((x) => x.id === exId); if (r) return { recurso: r, proveedor: proveedorDe(r, ctx, exProv || opts.proveedor, integ, opts.pais), explicito: true, params: (ex && ex.params) || {} }; }
  let mejor = null;
  for (const r of catalogo) {
    if (r.respaldo || !arr(r.aplica_a).includes(nodo.tipo)) continue;
    const n = puntaje(r, ctx); if (n > 0 && (!mejor || n > mejor.n)) mejor = { r, n };
  }
  if (mejor) return { recurso: mejor.r, proveedor: proveedorDe(mejor.r, ctx, opts.proveedor, integ, opts.pais), params: {} };
  const resp = catalogo.find((r) => r.respaldo && arr(r.aplica_a).includes(nodo.tipo));
  return resp ? { recurso: resp, proveedor: proveedorDe(resp, ctx, null, integ, opts.pais), respaldo: true, params: {} } : null;
}

// ---------- recetas ----------
function tpl(v, vars) {
  if (typeof v === "string") {
    const whole = v.match(/^\{\{(\w+)\}\}$/); if (whole && vars[whole[1]] !== undefined && typeof vars[whole[1]] !== "string") return vars[whole[1]];
    return v.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? "" : String(vars[k])));
  }
  if (Array.isArray(v)) return v.flatMap((x) => { const r = tpl(x, vars); return typeof x === "string" && /^\{\{\w+\}\}$/.test(x) && Array.isArray(r) ? r : [r]; });
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, tpl(x, vars)]));
  return v;
}
function buscarArchivo(nombre, dirs) {
  for (const d of dirs) { const f = path.join(d, nombre); if (fs.existsSync(f) && fs.statSync(f).isFile()) return f; }
  return null;
}
// Convierte { generar } y { src: archivo } en data URI
function imagenes(v, dirs, vars, aviso) {
  if (Array.isArray(v)) return v.map((x) => imagenes(x, dirs, vars, aviso));
  if (!v || typeof v !== "object") return v;
  if (typeof v.generar === "string" && v.generar) { const { generar, ...rest } = v; return { ...rest, src: assets.imagenSintetica(generar, { seed: `${vars.marca}${generar}`, sitio: vars.marca, color: vars.color, titulo: vars.titulo_imagen }) }; }
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    if (k === "src" && typeof x === "string" && !/^(data:|https?:)/.test(x)) {
      const f = buscarArchivo(x, dirs); const d = f ? assets.imagenDeArchivo(f) : null;
      if (!d) { aviso(`No encontré la imagen «${x}» (se busca en: ${dirs.join(", ")}).`); out[k] = ""; } else out[k] = d;
    } else out[k] = imagenes(x, dirs, vars, aviso);
  }
  return out;
}
function dirsDe(res, extra) {
  const base = arr(res.recurso._dirs).flatMap((d) => [path.join(d, "imagenes", res.recurso.id, res.proveedor.id || ""), path.join(d, "imagenes", res.recurso.id)]);
  return [...base, ...arr(extra)].filter(Boolean);
}
function varsEspecificas(res, nodo, vars, demo) {
  const r = res.recurso; const v = { ...vars };
  if (r.id === "foto-usuario") {
    const txt = `${nodo.mensaje || ""} ${nodo.etapa || ""} ${nodo.componente || ""}`; const adj = nodo.adjunto || {};
    const g = arr(r.generadores).find((x) => re(x.texto) && re(x.texto).test(txt)) || r.generador_por_defecto || { generar: "pantalla" };
    v.generar = adj.generar || (adj.qr ? "ticket-qr" : g.generar); v.alt = adj.alt || g.alt || "Foto"; v.nota_generador = g.nota || "";
    v.caption = adj.caption || "📷";
  }
  if (r.id === "documento-pdf") {
    const txt = `${nodo.etapa || ""} ${nodo.diagrama || ""} ${nodo.mensaje || ""}`; const n = arr(r.nombres).find((x) => re(x.texto) && re(x.texto).test(txt));
    v.documento = (n && n.nombre) || r.nombre_por_defecto || "Comprobante";
  }
  if (r.id === "firma-electronica") {
    const txt = `${nodo.etapa || ""} ${nodo.diagrama || ""} ${nodo.mensaje || ""}`;
    const d = [[/contrato/i, "Contrato"], [/pagar[eé]/i, "Pagaré"], [/acuerdo/i, "Acuerdo"], [/p[oó]liza/i, "Póliza"], [/solicitud/i, "Solicitud"], [/autorizaci[oó]n/i, "Autorización"]].find(([x]) => x.test(txt));
    v.documento = ((demo || {}).documento) || (d ? d[1] : "Documento");
  }
  if (r.id === "ecommerce") {
    const ps = arr((demo || {}).productos).length ? demo.productos : arr(r.productos_por_defecto); const p0 = ps[0] || {};
    const num = (s) => { const n = parseFloat(String(s).replace(/[^0-9.,]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")); return isFinite(n) ? n : null; };
    const usd = (n) => "$" + n.toFixed(2);
    const total = num(v.monto); const sub = total ? total / 1.15 : null;
    v.productos = ps; v.mensaje_o = nodo.mensaje || "Encontré estos productos para ti 👇";
    v.busqueda = (demo && demo.busqueda) || String(p0.titulo || "productos").split(" ")[0].toLowerCase();
    v.productos_filas = ps.slice(0, 2).map((p) => ({ tipo: "producto_fila", titulo: p.titulo, descripcion: p.descripcion, emoji: p.emoji, sku: p.sku }));
    v.carrito_filas = ps.slice(0, 2).map((p, i) => ({ tipo: "producto_fila", titulo: p.titulo, descripcion: p.precio, emoji: p.emoji, cantidad: String(i === 0 ? 2 : 1) }));
    v.producto_nombre = p0.titulo || "Producto"; v.producto_precio = p0.precio || "$25.00"; v.producto_descripcion = p0.descripcion || "";
    v.subtotal = sub ? usd(sub) : "$21.74"; v.iva = total && sub ? usd(total - sub) : "$3.26";
  }
  return v;
}
// Aplica la receta: devuelve { abre, nota, mensaje, webview, flow, pasos, despues, avisos }
function aplicar(res, nodo, vars0, o = {}) {
  const r = res.recurso; const prov = res.proveedor; const avisos = [];
  const exp = prov.experiencia || (r.proveedor_por_defecto || {}).experiencia;
  let receta = r.variantes ? (r.variantes[exp] || r.variantes[Object.keys(r.variantes)[0]]) : r.receta;
  if (!receta) return null;
  const medios = arr(prov.medios).length ? prov.medios : arr((r.proveedor_por_defecto || {}).medios);
  let vars = { ...vars0, proveedor: prov.nombre, proveedor_slug: slug(prov.nombre), medios: medios.slice(0, 3).join(" · "), medio_marca: String(medios[0] || "VISA").slice(0, 8).toUpperCase(), ...(res.params || {}) };
  vars = varsEspecificas(res, nodo, vars, o.demo);
  const dirs = dirsDe(res, o.dirs);
  let rec = JSON.parse(JSON.stringify(receta));
  // capturas reales del proveedor: cada una es una pantalla del webview
  if (arr(prov.capturas).length && rec.webview) {
    const n = prov.capturas.length; const bt = arr(prov.botones);
    rec.webview.pantallas = prov.capturas.map((f, i) => ({ bloques: [{ tipo: "captura", src: f, completa: prov.pantalla_completa !== false, recorte: prov.recorte_superior || 0 }], boton: bt[i] || (i < n - 1 ? "Continuar" : "Confirmar") }));
    if (prov.exito) rec.webview.exito = prov.exito;
  }
  rec = imagenes(tpl(rec, vars), dirs, vars, (m) => avisos.push(m));
  if (prov.mensaje) rec.mensaje = { ...(rec.mensaje || {}), ...tpl(prov.mensaje, vars) };   // texto propio del proveedor (p. ej. el de Mercado Pago)
  const nota = [rec.nota, vars.nota_generador, prov.por_confirmar ? `Por confirmar: ${prov.por_confirmar}` : ""].filter(Boolean).join(" ");
  if (rec.webview) { rec.webview.color = rec.webview.color || prov.color || vars.color; if (!rec.webview.pantallas || !rec.webview.pantallas.length) avisos.push(`${r.id}: el webview no tiene pantallas.`); }
  return { abre: rec.abre, nota, mensaje: rec.mensaje || {}, webview: rec.webview, flow: rec.flow, pasos: arr(rec.pasos), despues: arr(rec.despues), avisos, proveedor: prov, recurso: r, vars };
}

module.exports = { cargarCatalogo, resolver, aplicar, USER_DIR, SKILL_DIR };
