/* Skins de canal para el kit jelou-demo-whatsapp (jelou-sow-studio). No modifica el plugin: cambia las variables CSS del teléfono y el aspecto del chat
   según `G.journeys[i].canal` (whatsapp | instagram | messenger | widget | x | workchat). Se inyecta junto a kit-extension.js.
   Son aproximaciones de la apariencia de cada canal, no copias oficiales. Ver references/simulador-visual.md. */
(function () {
  if (typeof startJourney !== 'function' || typeof G === 'undefined') { console.warn('[kit-skins] el motor del kit cambió: los skins de canal no se aplican.'); return; }
  var P = 'body .phone[data-canal="';
  var css = [
    /* común a los canales distintos de WhatsApp: sin colas de burbuja ni ticks de lectura */
    'body .phone[data-canal]:not([data-canal="whatsapp"]) .bub.in::before,body .phone[data-canal]:not([data-canal="whatsapp"]) .bub.out::before{display:none}',
    'body .phone[data-canal]:not([data-canal="whatsapp"]) .meta svg{display:none}',
    'body .phone[data-canal]:not([data-canal="whatsapp"]) .bub{border-radius:18px;box-shadow:none}',
    /* sin el fondo de dibujos ni el aviso «Esta empresa usa un servicio seguro de Meta…», que son de WhatsApp */
    'body .phone[data-canal]:not([data-canal="whatsapp"]) .msgs{background-image:none !important}',
    'body .phone[data-canal]:not([data-canal="whatsapp"]) .e2e{display:none}',
    'body .phone[data-canal]:not([data-canal="whatsapp"]) .daychip{background:transparent;box-shadow:none;color:var(--wa-muted);font-size:11.5px}',
    /* Instagram */
    P + 'instagram"]{--wa-chat:#fff;--wa-in:#efefef;--wa-out:#7a3df0;--wa-ink:#000;--wa-muted:#8e8e8e;--wa-bar:#fff;--wa-action:#0095f6;--wa-line:#dbdbdb;--wa-green:#0095f6;--wa-ios:#000;--wa-link:#0095f6}',
    P + 'instagram"] .screen{background:#fff}',
    P + 'instagram"] .bub{border-radius:22px;padding:9px 14px}',
    P + 'instagram"] .bub.out{background:linear-gradient(180deg,#5b51d8 0%,#833ab4 55%,#c13584 100%);color:#fff}',
    P + 'instagram"] .bub.out .meta{color:rgba(255,255,255,.8)}',
    P + 'instagram"] .chat-h{background:#fff;border-bottom:.5px solid #dbdbdb;color:#000}',
    P + 'instagram"] .composer{background:#fff;border-top:0}',
    P + 'instagram"] .cfield{background:#fff;border:1px solid #dbdbdb;border-radius:22px}',
    P + 'instagram"] .cfield #ctext:empty::before{content:"Mensaje…";color:#8e8e8e}',
    P + 'instagram"] .abtn{color:#0095f6;font-weight:600}',
    P + 'instagram"] #send{background:#0095f6}',
    /* Messenger */
    P + 'messenger"]{--wa-chat:#fff;--wa-in:#e9e9eb;--wa-out:#0084ff;--wa-ink:#050505;--wa-muted:#65676b;--wa-bar:#fff;--wa-action:#0084ff;--wa-line:#e4e6eb;--wa-green:#0084ff;--wa-ios:#0084ff;--wa-link:#0084ff}',
    P + 'messenger"] .screen{background:#fff}',
    P + 'messenger"] .bub.out{background:linear-gradient(180deg,#00b2ff,#006aff);color:#fff}',
    P + 'messenger"] .bub.out .meta{color:rgba(255,255,255,.8)}',
    P + 'messenger"] .chat-h{background:#fff;border-bottom:.5px solid #e4e6eb}',
    P + 'messenger"] .composer{background:#fff;border-top:0}',
    P + 'messenger"] .cfield{background:#f0f2f5;border:0;border-radius:20px}',
    P + 'messenger"] .cfield #ctext:empty::before{content:"Aa";color:#65676b}',
    P + 'messenger"] .abtn{color:#0084ff;font-weight:600}',
    P + 'messenger"] #send{background:#0084ff}',
    /* Widget web: encabezado con el color de la marca, burbujas redondeadas y pie «Powered by Jelou» */
    P + 'widget"]{--wa-chat:#f4f6f8;--wa-in:#fff;--wa-out:var(--brand,#00b3c7);--wa-ink:#1f2937;--wa-muted:#6b7280;--wa-bar:var(--brand,#00b3c7);--wa-action:var(--brand,#00b3c7);--wa-line:#e5e7eb;--wa-green:var(--brand,#00b3c7);--wa-ios:#fff;--wa-link:var(--brand,#00b3c7)}',
    P + 'widget"] .screen{background:#f4f6f8}',
    P + 'widget"] .chat-h{background:var(--brand,#00b3c7);color:#fff;border-bottom:0}',
    P + 'widget"] .chat-h .nm,body .phone[data-canal="widget"] .chat-h .sub,body .phone[data-canal="widget"] .chat-h .back{color:#fff}',
    P + 'widget"] .chat-h .sub.typing{color:#fff}',
    P + 'widget"] .chat-h .acts{display:none}',
    P + 'widget"] .bub{border-radius:14px;box-shadow:0 1px 2px rgba(0,0,0,.08)}',
    P + 'widget"] .bub.out{color:#fff}',
    P + 'widget"] .bub.out .meta{color:rgba(255,255,255,.85)}',
    P + 'widget"] .composer{background:#fff;border-top:1px solid #e5e7eb;padding-bottom:34px}',
    P + 'widget"] .cfield{background:#fff;border:1px solid #e5e7eb;border-radius:12px}',
    P + 'widget"] .cfield #ctext:empty::before{content:"Escribe un mensaje…";color:#9ca3af}',
    P + 'widget"] .abtn{color:var(--brand,#00b3c7);font-weight:600}',
    P + 'widget"] .chat::after{content:"Powered by Jelou";position:absolute;left:0;right:0;bottom:12px;text-align:center;font-size:10px;color:#9aa5ad;pointer-events:none}',
    /* X (Twitter) */
    P + 'x"]{--wa-chat:#fff;--wa-in:#eff3f4;--wa-out:#1d9bf0;--wa-ink:#0f1419;--wa-muted:#536471;--wa-bar:#fff;--wa-action:#1d9bf0;--wa-line:#eff3f4;--wa-green:#1d9bf0;--wa-ios:#0f1419;--wa-link:#1d9bf0}',
    P + 'x"] .screen{background:#fff}',
    P + 'x"] .bub{border-radius:20px}',
    P + 'x"] .bub.out{color:#fff}',
    P + 'x"] .bub.out .meta{color:rgba(255,255,255,.8)}',
    P + 'x"] .chat-h{background:#fff;border-bottom:.5px solid #eff3f4}',
    P + 'x"] .chat-h .acts{display:none}',
    P + 'x"] .composer{background:#fff;border-top:.5px solid #eff3f4}',
    P + 'x"] .cfield{background:#eff3f4;border:0;border-radius:20px}',
    P + 'x"] .cfield #ctext:empty::before{content:"Escribe un mensaje";color:#536471}',
    /* Chat de trabajo (Teams, Slack): todo alineado a la izquierda, rectangular */
    P + 'workchat"]{--wa-chat:#f5f5f5;--wa-in:#fff;--wa-out:#e8ebfa;--wa-ink:#242424;--wa-muted:#616161;--wa-bar:#fff;--wa-action:#5b5fc7;--wa-line:#e1dfdd;--wa-green:#5b5fc7;--wa-ios:#5b5fc7;--wa-link:#5b5fc7}',
    P + 'workchat"] .screen{background:#f5f5f5}',
    P + 'workchat"] .row.out{justify-content:flex-start}',
    P + 'workchat"] .bub{border-radius:4px;border:1px solid #e1dfdd;box-shadow:0 1px 2px rgba(0,0,0,.06);max-width:90%}',
    P + 'workchat"] .bub.out{background:#e8ebfa;border-color:#d7dbf6;color:#242424}',
    P + 'workchat"] .chat-h{background:#fff;border-bottom:1px solid #e1dfdd}',
    P + 'workchat"] .chat-h .acts{display:none}',
    P + 'workchat"] .composer{background:#fff;border-top:1px solid #e1dfdd}',
    P + 'workchat"] .cfield{background:#fff;border:1px solid #c8c6c4;border-radius:4px}',
    P + 'workchat"] .cfield #ctext:empty::before{content:"Escribe un mensaje nuevo";color:#8a8886}',
    P + 'workchat"] #send{background:#5b5fc7}'
  ].join('\n');
  var st = document.createElement('style'); st.setAttribute('data-skins', 'canal'); st.textContent = css; document.head.appendChild(st);

  var slug = function (s) { return String(s || 'cuenta').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, ''); };
  var SUB = {
    instagram: function () { return 'Instagram · Cuenta de empresa'; },
    messenger: function () { return 'Activo ahora'; },
    widget: function () { return 'En línea · responde al instante'; },
    x: function () { return '@' + slug(G.marca && G.marca.nombre).replace(/\./g, ''); },
    workchat: function () { return 'Aplicación'; }
  };
  var base = G.marca ? G.marca.subtitulo : null;
  function aplicar(canal) {
    canal = canal || 'whatsapp';
    var ph = document.getElementById('phone'); if (!ph) return;
    if (canal === 'whatsapp') ph.removeAttribute('data-canal'); else ph.setAttribute('data-canal', canal);
    ph.style.setProperty('--brand', (G.marca && G.marca.color) || '#00b3c7');
    if (G.marca) G.marca.subtitulo = (canal !== 'whatsapp' && SUB[canal]) ? SUB[canal]() : base;   // el motor lo usa al armar y al terminar de «escribir»
  }
  var orig = startJourney;
  window.startJourney = function (i) { var j = G.journeys && G.journeys[i]; aplicar(j && j.canal); return orig.apply(this, arguments); };
  if (typeof S !== 'undefined' && G.journeys && G.journeys[S.jx]) window.startJourney(S.jx);   // el primer journey ya se armó antes de cargar este archivo
})();
