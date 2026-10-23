/* Extensión visual de jelou-sow-studio para los webviews del kit jelou-demo-whatsapp (no modifica el plugin).
   Se inyecta al final del HTML generado y envuelve la función global wvBlock del motor.
   Bloques nuevos: imagen, captura, camara, firma, codigo, productos, lista, progreso, documento, checklist, boton.
   Ver references/simulador-visual.md. */
(function () {
  if (typeof wvBlock !== 'function') { console.warn('[kit-extension] wvBlock no existe: el motor del kit cambió; los bloques extendidos no se dibujarán.'); return; }
  var orig = wvBlock;
  var css = [
    '.x-card{background:#fff;border-radius:14px;padding:14px;margin:10px 12px;box-shadow:0 1px 2px rgba(17,27,33,.08)}',
    '.x-card h3{margin:0 0 4px;font-size:15px}.x-card p{margin:0;color:#576a78;font-size:12.5px}',
    '.x-shot{margin:0;line-height:0;overflow:hidden}.x-shot img{width:100%;display:block}',
    '.ov.webview:has(.x-shot.full) .wv-h{display:none}.ov.webview:has(.x-shot.full) .wv-b{padding:0}.ov.webview:has(.x-shot.full) .wv-go{margin-top:0}',
    '.x-img{margin:10px 12px;border-radius:14px;overflow:hidden;line-height:0}.x-img img,.x-img svg{width:100%;display:block}',
    '.x-cam{position:relative;margin:10px 12px;border-radius:16px;overflow:hidden;background:radial-gradient(circle at 50% 40%,#3a4a52,#0b1418);height:300px;display:flex;align-items:center;justify-content:center}',
    '.x-cam .guide{border:3px dashed rgba(255,255,255,.85);box-sizing:border-box}',
    '.x-cam.rostro .guide{width:170px;height:225px;border-radius:50%}',
    '.x-cam.documento .guide{width:250px;height:158px;border-radius:12px}',
    '.x-cam.qr .guide{width:170px;height:170px;border-radius:14px}',
    '.x-cam .silh{position:absolute;opacity:.32;color:#fff}',
    '.x-cam .tip{position:absolute;left:0;right:0;bottom:46px;text-align:center;color:#fff;font:600 12.5px Manrope,system-ui;text-shadow:0 1px 3px #000a;padding:0 14px}',
    '.x-cam .shutter{position:absolute;bottom:10px;left:50%;margin-left:-15px;width:30px;height:30px;border-radius:50%;border:3px solid #fff;box-sizing:border-box;background:rgba(255,255,255,.25)}',
    '.x-cam .rec{position:absolute;top:10px;left:12px;color:#fff;font:600 11px Manrope,system-ui;display:flex;gap:5px;align-items:center}.x-cam .rec i{width:8px;height:8px;border-radius:50%;background:#ff3b30;display:inline-block}',
    '.x-sign{margin:10px 12px;background:#fff;border-radius:14px;padding:10px 12px 8px;box-shadow:0 1px 2px rgba(17,27,33,.08)}',
    '.x-sign .pad{height:130px;border:1.5px dashed #b7c3cb;border-radius:10px;display:flex;align-items:center;justify-content:center;background:#fbfcfd}',
    '.x-sign .row{display:flex;justify-content:space-between;color:#576a78;font-size:12px;padding-top:6px}',
    '.x-code{display:flex;gap:8px;justify-content:center;margin:12px}.x-code span{width:40px;height:50px;border-radius:10px;border:1.5px solid #cdd8de;background:#fff;display:grid;place-items:center;font:700 20px IBM Plex Mono,monospace}',
    '.x-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 12px}',
    '.x-prod{background:#fff;border-radius:12px;padding:10px;box-shadow:0 1px 2px rgba(17,27,33,.08);text-align:center}.x-prod .th{height:70px;border-radius:8px;background:#eef2f4;display:grid;place-items:center;font-size:30px;overflow:hidden;margin-bottom:6px}.x-prod .th img{width:100%;height:100%;object-fit:cover}',
    '.x-prod b{font-size:12.5px;display:block}.x-prod span{font-size:12.5px;color:#0b7a75;font-weight:700}.x-prod button{margin-top:6px;width:100%;border:0;border-radius:8px;padding:6px;background:var(--x,#00b3c7);color:#fff;font:600 11.5px Manrope,system-ui}',
    '.x-list{margin:10px 12px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 2px rgba(17,27,33,.08)}.x-list div{display:flex;justify-content:space-between;gap:10px;padding:11px 14px;border-bottom:.5px solid #e6ecef;font-size:13px}.x-list div:last-child{border-bottom:0}.x-list small{display:block;color:#576a78;font-size:11.5px}.x-list b{white-space:nowrap}',
    '.x-steps{display:flex;margin:12px 16px;gap:6px}.x-steps div{flex:1;text-align:center;font-size:11px;color:#8696a0}.x-steps i{display:block;height:4px;border-radius:3px;background:#dfe6ea;margin-bottom:5px}.x-steps .on{color:#111b21;font-weight:700}.x-steps .on i{background:var(--x,#00b3c7)}',
    '.x-doc{margin:10px 12px;background:#fff;border-radius:6px;padding:16px 16px 12px;box-shadow:0 2px 8px rgba(17,27,33,.15);position:relative}.x-doc h4{margin:0 0 10px;font-size:13px;letter-spacing:.3px}.x-doc i{display:block;height:6px;border-radius:3px;background:#e3e9ec;margin:7px 0}.x-doc .stamp{position:absolute;right:12px;bottom:10px;border:2px solid #d9822b;color:#d9822b;border-radius:6px;padding:2px 8px;font:700 10.5px Manrope,system-ui;transform:rotate(-6deg)}',
    '.x-check{margin:10px 12px;background:#fff;border-radius:14px;padding:6px 14px;box-shadow:0 1px 2px rgba(17,27,33,.08)}.x-check div{display:flex;gap:10px;align-items:center;padding:8px 0;font-size:13px}.x-check em{width:18px;height:18px;border-radius:50%;background:var(--x,#00b3c7);color:#fff;font-style:normal;display:grid;place-items:center;font-size:11px;flex:none}',
    '.x-hd{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#fff;font-size:14px}.x-hd b{font-size:15px}.x-hd .cart{position:relative;font-size:19px}.x-hd .cart i{position:absolute;top:-6px;right:-9px;background:#111827;color:#fff;border-radius:9px;min-width:17px;height:17px;font:700 10px Manrope,system-ui;display:grid;place-items:center;font-style:normal}',
    '.x-search{margin:6px 14px 4px;background:#f1f3f5;border-radius:12px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;font-size:13.5px;color:#111827}.x-search span:first-child{color:#6b7280}',
    '.x-row{display:flex;gap:12px;padding:12px 14px;align-items:flex-start;border-bottom:.5px solid #e6ecef;background:#fff}.x-row .th{width:58px;height:58px;border-radius:10px;background:#f1f3f5;display:grid;place-items:center;font-size:28px;overflow:hidden;flex:none}.x-row .th img{width:100%;height:100%;object-fit:cover}.x-row .tx{flex:1}.x-row b{font-size:14px;display:block}.x-row p{margin:2px 0 0;color:#4b5563;font-size:12px}.x-row .pl{width:28px;height:28px;border-radius:50%;background:#eceff1;display:grid;place-items:center;font-size:18px;color:#111827;flex:none}.x-row .sku{display:inline-block;margin-top:6px;background:#f1f3f5;border-radius:6px;padding:2px 8px;font:500 11px IBM Plex Mono,monospace}',
    '.x-chips{padding:8px 14px;background:#fff}.x-chips h5{margin:0 0 7px;font:700 11px Manrope,system-ui;letter-spacing:.8px;color:#1f2937}.x-chips div{display:flex;gap:8px;flex-wrap:wrap}.x-chips span{border:1px solid #dfe3e8;border-radius:18px;padding:6px 13px;font-size:12.5px;display:inline-flex;gap:6px;align-items:center}.x-chips span.on{background:#111827;color:#fff;border-color:#111827}.x-chips span u{width:11px;height:11px;border-radius:50%;border:1px solid #9ca3af;display:inline-block}',
    '.x-dark{display:block;margin:12px 14px;padding:13px;text-align:center;border-radius:14px;background:#111827;color:#fff;font:600 14px Manrope,system-ui}',
    '.x-price{display:flex;justify-content:space-between;align-items:baseline;padding:10px 14px 2px;background:#fff}.x-price b{font-size:18px}.x-price span{font-size:17px;font-weight:700}',
    '.x-btn{display:block;margin:10px 12px;padding:11px;text-align:center;border-radius:10px;border:1.5px solid var(--x,#00b3c7);color:var(--x,#00b3c7);font:600 13px Manrope,system-ui;background:#fff}'
  ].join('\n');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var E = function (v) { return esc(tx(v == null ? '' : v)); };
  var silh = { rostro: '<svg class="silh" width="120" height="150" viewBox="0 0 120 150"><circle cx="60" cy="48" r="30" fill="currentColor"/><path d="M8 150c4-46 26-64 52-64s48 18 52 64z" fill="currentColor"/></svg>',
    documento: '<svg class="silh" width="210" height="120" viewBox="0 0 210 120"><rect x="14" y="16" width="52" height="64" rx="6" fill="currentColor"/><rect x="82" y="22" width="108" height="10" rx="5" fill="currentColor"/><rect x="82" y="44" width="84" height="10" rx="5" fill="currentColor"/><rect x="82" y="66" width="96" height="10" rx="5" fill="currentColor"/></svg>',
    qr: '<svg class="silh" width="110" height="110" viewBox="0 0 110 110"><g fill="currentColor"><rect x="6" y="6" width="30" height="30"/><rect x="74" y="6" width="30" height="30"/><rect x="6" y="74" width="30" height="30"/><rect x="48" y="48" width="14" height="14"/><rect x="74" y="74" width="14" height="14"/></g></svg>' };
  window.wvBlock = function (b, bi, sel, color) {
    var c = 'style="--x:' + esc(color || '#00b3c7') + '"';
    switch (b.tipo) {
      case 'imagen': return '<div class="x-img">' + imgHTML(b.src ? { src: b.src, alt: b.alt } : { placeholder: b.placeholder || { emoji: '🖼️', texto: b.alt || '' } }) + '</div>';
      case 'captura': return '<div class="x-shot' + (b.completa ? ' full' : '') + '"><img src="' + esc(b.src || '') + '" alt="' + E(b.alt || 'Captura') + '"' + (b.recorte ? ' style="margin-top:-' + Number(b.recorte) + '%"' : '') + '></div>';
      case 'camara': { var m = b.modo || 'rostro'; return '<div class="x-cam ' + esc(m) + '"><div class="rec"><i></i>' + E(b.etiqueta || 'Cámara') + '</div>' + (silh[m] || '') + '<div class="guide"></div><div class="tip">' + E(b.texto || '') + '</div><div class="shutter"></div></div>'; }
      case 'firma': return '<div class="x-sign"><div class="pad"><svg width="220" height="90" viewBox="0 0 220 90"><path d="M10 62c14-40 24-52 30-40s-14 44-6 44 22-34 34-34 2 30 12 28 18-26 28-26 4 20 14 18 16-14 28-14 6 10 20 6" fill="none" stroke="#1d3557" stroke-width="3" stroke-linecap="round"/></svg></div><div class="row"><span>' + E(b.texto || 'Firma aquí') + '</span><span>Borrar</span></div></div>';
      case 'codigo': { var n = b.digitos || 6, v = String(b.valor || '482913'); var s = ''; for (var i = 0; i < n; i++) s += '<span>' + E(v[i] || '') + '</span>'; return (b.texto ? '<p style="text-align:center;margin:12px 16px 0;color:#576a78;font-size:12.5px">' + E(b.texto) + '</p>' : '') + '<div class="x-code">' + s + '</div>'; }
      case 'productos': return '<div class="x-grid" ' + c + '>' + (b.items || []).map(function (p) { return '<div class="x-prod"><div class="th">' + (p.imagen && p.imagen.src ? '<img src="' + esc(p.imagen.src) + '">' : esc(p.emoji || '🛍️')) + '</div><b>' + E(p.titulo) + '</b><span>' + E(p.precio) + '</span><button>' + E(b.boton || 'Agregar') + '</button></div>'; }).join('') + '</div>';
      case 'lista': return '<div class="x-list">' + (b.items || []).map(function (r) { return '<div><span>' + E(r.titulo) + (r.descripcion ? '<small>' + E(r.descripcion) + '</small>' : '') + '</span>' + (r.valor ? '<b>' + E(r.valor) + '</b>' : '') + '</div>'; }).join('') + '</div>';
      case 'progreso': return '<div class="x-steps" ' + c + '>' + (b.pasos || []).map(function (p, k) { return '<div class="' + (k < (b.actual || 1) ? 'on' : '') + '"><i></i>' + E(p) + '</div>'; }).join('') + '</div>';
      case 'documento': { var l = ''; for (var k = 0; k < (b.lineas || 8); k++) l += '<i style="width:' + (k % 4 === 3 ? 60 : 100 - (k % 3) * 8) + '%"></i>'; return '<div class="x-doc"><h4>' + E(b.titulo || 'DOCUMENTO') + '</h4>' + l + (b.sello ? '<span class="stamp">' + E(b.sello) + '</span>' : '') + '</div>'; }
      case 'checklist': return '<div class="x-check" ' + c + '>' + (b.items || []).map(function (t) { return '<div><em>✓</em><span>' + E(t) + '</span></div>'; }).join('') + '</div>';
      case 'cabecera': return '<div class="x-hd"><span>' + E(b.izquierda || '‹') + '</span><b>' + E(b.titulo || '') + '</b><span class="cart">' + (b.carrito === false ? '' : '🛒' + (b.carrito ? '<i>' + E(b.carrito) + '</i>' : '')) + '</span></div>';
      case 'buscador': return '<div class="x-search"><span>🔍&nbsp; <span style="color:#111827">' + E(b.texto || '') + '</span></span><span>✕</span></div>';
      case 'producto_fila': return '<div class="x-row"><div class="th">' + (b.imagen && b.imagen.src ? '<img src="' + esc(b.imagen.src) + '">' : esc(b.emoji || '🛍️')) + '</div><div class="tx"><b>' + E(b.titulo) + '</b>' + (b.descripcion ? '<p>' + E(b.descripcion) + '</p>' : '') + (b.precio ? '<p><b>' + E(b.precio) + '</b></p>' : '') + (b.sku ? '<span class="sku">SKU: ' + E(b.sku) + '</span>' : '') + '</div><div class="pl">' + E(b.cantidad || '+') + '</div></div>';
      case 'chips': return '<div class="x-chips"><h5>' + E(b.titulo || '') + '</h5><div>' + (b.opciones || []).map(function (o, i) { var t = typeof o === 'string' ? { t: o } : o; return '<span class="' + (i === (b.seleccion || 0) ? 'on' : '') + '">' + (t.color ? '<u style="background:' + esc(t.color) + '"></u>' : '') + E(t.t) + '</span>'; }).join('') + '</div></div>';
      case 'boton_oscuro': return '<div class="x-dark">' + E(b.texto || 'Continuar') + '</div>';
      case 'titulo_precio': return '<div class="x-price"><b>' + E(b.titulo) + '</b><span>' + E(b.precio) + '</span></div>' + (b.texto ? '<p style="margin:0;padding:2px 14px 8px;background:#fff;color:#4b5563;font-size:12.5px">' + E(b.texto) + '</p>' : '');
      case 'boton': return '<div class="x-btn" ' + c + '>' + E(b.texto || 'Continuar') + '</div>';
      default: return orig(b, bi, sel, color);
    }
  };
})();

/* Selector de modo de la experiencia (jelou-sow-studio): cuando el SOW ni la reunión definen cómo se capturan los datos, el guion trae un recorrido
   por modo (G.modos + journeys[].modo/par) y este bloque muestra un selector en el panel del presentador y oculta los recorridos de los otros modos.
   Con un solo modo definido el guion no trae G.modos y este bloque no hace nada. */
(function () {
  if (typeof G === 'undefined' || !G.modos || !G.modos.lista || G.modos.lista.length < 2 || typeof startJourney !== 'function') return;
  var nav = document.getElementById('jnav'); if (!nav) return;
  var modos = G.modos.lista, cur = G.modos.inicial || modos[0].id;
  var AYUDA = { conversacional: 'Todo en el chat: los formularios se resuelven pregunta a pregunta, sin Flow ni webview.', mixto: 'Chat, con Flow o webview solo donde es imprescindible (formularios largos, archivos, pagos, firma, biometría).', webview: 'Formularios en WhatsApp Flow o webview.' };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var st = document.createElement('style');
  st.textContent = '#modos{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 10px}#modos .ml{font:600 11px var(--f-mono,monospace);color:var(--muted,#626c82);text-transform:uppercase;letter-spacing:.04em;margin-right:2px}' +
    '#modos button{border:1px solid var(--line,#e3e7ee);background:var(--surface,#fff);color:var(--muted,#626c82);border-radius:999px;padding:5px 12px;font:600 12.5px var(--f-body,inherit);cursor:pointer}' +
    '#modos button[aria-pressed="true"]{border-color:var(--brand,#00b3c7);color:var(--ink,#091e32);background:var(--brand-soft,#e3f7f9)}';
  document.head.appendChild(st);
  var bar = document.createElement('div'); bar.id = 'modos'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Modo de la experiencia');
  bar.innerHTML = '<span class="ml">Modo</span>' + modos.map(function (m) { return '<button type="button" data-m="' + m.id + '" title="' + (AYUDA[m.id] || '') + '">' + m.nombre + '</button>'; }).join('');
  nav.parentNode.insertBefore(bar, nav);
  var visible = function (j) { return !j || !j.modo || j.modo === cur; };
  var near = function (i, d) { for (var k = i; k >= 0 && k < G.journeys.length; k += d) if (visible(G.journeys[k])) return k; return -1; };
  function paint() {
    [].forEach.call(bar.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.m === cur)); });
    var n = 0;
    [].forEach.call(nav.children, function (b, i) {
      var j = G.journeys[i]; if (!j) return;
      var on = visible(j); b.style.display = on ? '' : 'none';
      var sp = b.querySelector('.n'); if (on && sp) sp.textContent = pad(++n);
    });
  }
  function conteo() {
    var el = document.getElementById('count'); var b = el && el.querySelector('b'); if (!b) return;
    var idx = 0, tot = 0; G.journeys.forEach(function (j, i) { if (visible(j)) { tot++; if (i <= S.jx) idx++; } });
    b.textContent = pad(idx); if (b.nextSibling && b.nextSibling.nodeType === 3) b.nextSibling.nodeValue = ' / ' + pad(tot) + ' ';
  }
  var iniciar = startJourney;
  window.startJourney = function (i) {
    var j = G.journeys[i];
    if (j && !visible(j)) { var k = near(i, i >= S.jx ? 1 : -1); if (k < 0) k = near(i, i >= S.jx ? -1 : 1); if (k < 0) return; i = k; }
    return iniciar.call(this, i);
  };
  if (typeof nextJourney === 'function') window.nextJourney = function () {
    var k = near(S.jx + 1, 1);
    if (k >= 0) window.startJourney(k); else if (typeof setSummary === 'function') { S.run++; S.pending = null; setSummary(true); }
  };
  if (typeof renderJourney === 'function') { var pintar = renderJourney; window.renderJourney = function () { var r = pintar.apply(this, arguments); conteo(); return r; }; }
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-m]'); if (!b || b.dataset.m === cur) return;
    var actual = G.journeys[S.jx]; cur = b.dataset.m; paint();
    var k = -1; if (actual && actual.par) G.journeys.forEach(function (j, i) { if (k < 0 && j.modo === cur && j.par === actual.par) k = i; });
    if (k < 0) k = near(0, 1);
    if (k >= 0) window.startJourney(k);
  });
  paint();
  if (!visible(G.journeys[S.jx])) { var k0 = near(0, 1); if (k0 >= 0) window.startJourney(k0); } else conteo();
})();
