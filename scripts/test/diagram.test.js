'use strict';
// node scripts/test/diagram.test.js  -> renderiza los fixtures a scripts/test/out/ y comprueba invariantes del layout.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { layoutDiagram, renderDiagramSvg, renderDiagramPng, validateGraph } = require('../lib/diagram');

const FIX = path.join(__dirname, 'diagram-fixtures');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

function checkLayout(name, lay) {
  const ns = lay.nodes;
  for (let i = 0; i < ns.length; i++) {
    const a = ns[i];
    assert(a.x >= 0 && a.x + a.w <= lay.width && a.y + a.h <= lay.height, `${name}: ${a.id} fuera del lienzo`);
    for (let j = i + 1; j < ns.length; j++) {
      const b = ns[j];
      assert(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), `${name}: ${a.id} se superpone con ${b.id}`);
    }
  }
  // ninguna arista atraviesa el interior de una caja (se excluye la propia caja origen/destino)
  for (const e of lay.edges) {
    for (let k = 0; k + 1 < e.points.length; k++) {
      const [x1, y1] = e.points[k], [x2, y2] = e.points[k + 1];
      for (const n of ns) {
        const lo = [Math.min(x1, x2), Math.min(y1, y2)], hi = [Math.max(x1, x2), Math.max(y1, y2)];
        const inside = lo[0] < n.x + n.w - 1 && hi[0] > n.x + 1 && lo[1] < n.y + n.h - 1 && hi[1] > n.y + 1;
        assert(!inside, `${name}: la arista ${e.from}->${e.to} atraviesa la caja ${n.id}`);
      }
    }
  }
}

let failed = 0;
for (const f of fs.readdirSync(FIX).filter((x) => x.endsWith('.json')).sort()) {
  const name = f.replace(/\.json$/, '');
  const spec = JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
  try {
    const lay = layoutDiagram(spec);
    checkLayout(name, lay);
    const svg = renderDiagramSvg(spec);
    assert(svg.startsWith('<svg') && svg.endsWith('</svg>'));
    const r1 = renderDiagramPng(spec), r2 = renderDiagramPng(spec);
    assert(r1.png.equals(r2.png), `${name}: render no determinista`);
    assert(r1.width === 1600, `${name}: ancho PNG ${r1.width} != 1600`);
    fs.writeFileSync(path.join(OUT, name + '.png'), r1.png);
    fs.writeFileSync(path.join(OUT, name + '.svg'), svg);
    const probs = validateGraph(spec);
    console.log(`ok  ${name}: ${r1.width}x${r1.height}, ${spec.pasos.length} pasos, ${probs.length} problema(s) de grafo`);
    for (const p of probs) console.log(`      [${p.nivel}] ${p.codigo}: ${p.mensaje}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}: ${e.message}`);
  }
}

// pruebas de validateGraph
const codes = (spec) => validateGraph(spec).map((p) => p.codigo);
const bad = {
  pasos: [
    { id: 'A', tipo: 'usuario', diagrama: 'x'.repeat(120), siguiente: [{ a: 'B' }, { a: 'Z' }] },
    { id: 'B', tipo: 'decision', diagrama: 'd', siguiente: [{ a: 'A' }] },
    { id: 'B', tipo: 'mensaje', diagrama: 'dup', siguiente: [] },
    { id: 'C', tipo: 'mensaje', diagrama: 'isla', siguiente: [] },
    { id: 'D', tipo: 'usuario', diagrama: 'otro inicio', siguiente: [{ a: 'B' }] },
  ],
};
const c = codes(bad);
for (const k of ['ID_DUPLICADO', 'DESTINO_INEXISTENTE', 'TEXTO_LARGO', 'DECISION_POCAS_ARISTAS', 'DECISION_SIN_ETIQUETA', 'SIN_SALIDA', 'VARIOS_INICIOS']) {
  if (!c.includes(k)) { failed++; console.log('FAIL validateGraph no detecta ' + k); }
}
console.log(failed ? `\n${failed} fallo(s)` : '\nTodo ok. Salida en ' + OUT);
process.exit(failed ? 1 : 0);
