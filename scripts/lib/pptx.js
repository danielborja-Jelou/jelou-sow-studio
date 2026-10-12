'use strict';
// Minimal PresentationML kit for the pre-kickoff deck: builds slide XML (shapes, text, tables, pictures, connectors) in points,
// measures text with the real Poppins metrics (lib/diagram.js) so lists are split before they overflow, and packages slides
// into the decompiled template (assets/kickoff-template.pptx: theme, master, layouts, embedded Poppins fonts, logos, icons).
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { textWidth } = require('./diagram');

const ASSETS = path.join(__dirname, '..', '..', 'assets');
const BRAND = JSON.parse(fs.readFileSync(path.join(ASSETS, 'kickoff-brand.json'), 'utf8'));
const COL = BRAND.colores;
const FONT = BRAND.fuentes;
const LH = FONT.interlineado || 1.5;       // line height / font size (Poppins)
const EMU = 12700;
const emu = (pt) => Math.round(pt * EMU);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PENDING = /(POR COMPLETAR|POR DEFINIR)/;

// ---------- text measuring ----------
// font: 'texto' (Poppins) | 'medio' | 'titulos' (SemiBold). Medium is measured as SemiBold (conservative).
const isBold = (font) => font === 'titulos' || font === 'medio';
function lineCount(text, widthPt, size, font) {
  let n = 0;
  for (const para of String(text == null ? '' : text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { n += 1; continue; }
    let cur = '', lines = 1;
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (textWidth(t, size, isBold(font)) <= widthPt) cur = t;
      else {
        if (cur) lines++;
        cur = w;
        // a single word wider than the box wraps by characters
        while (textWidth(cur, size, isBold(font)) > widthPt && cur.length > 1) { let k = cur.length; while (k > 1 && textWidth(cur.slice(0, k), size, isBold(font)) > widthPt) k--; cur = cur.slice(k); lines++; }
      }
    }
    n += lines;
  }
  return n;
}
const textHeight = (text, widthPt, size, font, spcAft = 0) => lineCount(text, widthPt, size, font) * size * LH + spcAft;
function trunc(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; const c = s.slice(0, n - 1); const sp = c.lastIndexOf(' '); return (sp > n * 0.6 ? c.slice(0, sp) : c) + '…'; }

// ---------- runs and paragraphs ----------
// Rich text: *emphasis* -> turquoise (titles), POR COMPLETAR / POR DEFINIR -> red.
function runs(text, o = {}) {
  const out = [];
  const parts = String(text == null ? '' : text).split(/(\*[^*]+\*)/);
  for (const p of parts) {
    if (!p) continue;
    const emph = /^\*[^*]+\*$/.test(p);
    const body = emph ? p.slice(1, -1) : p;
    for (const q of body.split(PENDING)) {
      if (!q) continue;
      const red = q === 'POR COMPLETAR' || q === 'POR DEFINIR';
      out.push({ t: q, font: o.font || 'texto', size: o.size || 12, color: red ? COL.pendiente : (emph ? (o.emph || COL.turquesa) : (o.color || COL.texto)), spc: o.spc });
    }
  }
  return out;
}
const runXml = (r) => `<a:r><a:rPr lang="es-ES" sz="${Math.round(r.size * 100)}" b="0"${r.spc ? ` spc="${r.spc}"` : ''} dirty="0"><a:solidFill><a:srgbClr val="${r.color}"/></a:solidFill><a:latin typeface="${FONT[r.font] || r.font}"/><a:cs typeface="${FONT[r.font] || r.font}"/></a:rPr><a:t>${esc(r.t)}</a:t></a:r>`;
// para: { runs, align, after, bullet, lines (line spacing pct) }
function paraXml(p) {
  const bullet = p.bullet ? `<a:buClr><a:srgbClr val="${COL.turquesa}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="•"/>` : '<a:buNone/>';
  const ind = p.bullet ? ` marL="${emu(p.bullet === true ? 11 : p.bullet)}" indent="-${emu(p.bullet === true ? 11 : p.bullet)}"` : '';
  const size = (p.runs[0] && p.runs[0].size) || 12;
  return `<a:p><a:pPr algn="${p.align || 'l'}"${ind}><a:lnSpc><a:spcPct val="${p.lnSpc || 100000}"/></a:lnSpc>${p.after ? `<a:spcAft><a:spcPts val="${Math.round(p.after * 100)}"/></a:spcAft>` : ''}${bullet}</a:pPr>${p.runs.map(runXml).join('')}<a:endParaRPr lang="es-ES" sz="${Math.round(size * 100)}" dirty="0"/></a:p>`;
}

// ---------- slide ----------
class Slide {
  constructor(bg, name) { this.bg = bg || COL.fondo; this.name = name || ''; this.shapes = []; this.images = []; this.id = 1; this.issues = []; }
  nid() { return ++this.id; }
  img(key) { let i = this.images.indexOf(key); if (i < 0) { this.images.push(key); i = this.images.length - 1; } return 'rId' + (i + 2); } // rId1 = layout
  xfrm(x, y, w, h, extra = '') { return `<a:xfrm${extra}><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm>`; }
  fillXml(f) { return f ? `<a:solidFill><a:srgbClr val="${f}"/></a:solidFill>` : '<a:noFill/>'; }
  lnXml(c, w, dash) { return c ? `<a:ln w="${emu(w || 0.75)}"><a:solidFill><a:srgbClr val="${c}"/></a:solidFill>${dash ? '<a:prstDash val="dash"/>' : ''}</a:ln>` : '<a:ln><a:noFill/></a:ln>'; }
  // shape with optional text: { fill, line, lineW, adj (0-50000), geom, dash, paras, anchor, inset }
  shape(x, y, w, h, o = {}) {
    const id = this.nid();
    const geom = o.geom || (o.adj != null ? 'roundRect' : 'rect');
    const av = o.adj != null ? `<a:avLst><a:gd name="adj" fmla="val ${Math.round(o.adj)}"/></a:avLst>` : '<a:avLst/>';
    const ins = o.inset == null ? [0, 0, 0, 0] : [].concat(o.inset);
    const body = o.paras && o.paras.length ? `<p:txBody><a:bodyPr wrap="square" lIns="${emu(ins[0])}" tIns="${emu(ins[1] == null ? ins[0] : ins[1])}" rIns="${emu(ins[2] == null ? ins[0] : ins[2])}" bIns="${emu(ins[3] == null ? ins[1] == null ? ins[0] : ins[1] : ins[3])}" rtlCol="0" anchor="${o.anchor || 'ctr'}"><a:noAutofit/></a:bodyPr><a:lstStyle/>${o.paras.map(paraXml).join('')}</p:txBody>` : '<p:txBody><a:bodyPr rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:endParaRPr lang="es-ES"/></a:p></p:txBody>';
    this.shapes.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(o.name || 'Forma ' + id)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${this.xfrm(x, y, w, h)}<a:prstGeom prst="${geom}">${av}</a:prstGeom>${this.fillXml(o.fill)}${this.lnXml(o.line, o.lineW, o.dash)}<a:effectLst/></p:spPr>${body}</p:sp>`);
  }
  // text box with zero insets. paras: [{runs,...}]. Records an overflow issue when the content does not fit the box height.
  text(x, y, w, h, paras, o = {}) {
    const id = this.nid();
    this.shapes.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(o.name || 'Texto ' + id)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${this.xfrm(x, y, w, h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="${o.anchor || 't'}"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paras.map(paraXml).join('')}</p:txBody></p:sp>`);
  }
  line(x1, y1, x2, y2, o = {}) {
    const id = this.nid();
    const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
    const flip = `${x2 < x1 ? ' flipH="1"' : ''}${y2 < y1 ? ' flipV="1"' : ''}`;
    this.shapes.push(`<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="${esc(o.name || 'Conector ' + id)}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${this.xfrm(x, y, w, h, flip)}<a:prstGeom prst="${o.arrow ? 'straightConnector1' : 'line'}"><a:avLst/></a:prstGeom><a:ln w="${emu(o.w || 1.5)}"><a:solidFill><a:srgbClr val="${o.color || COL.turquesa}"/></a:solidFill>${o.arrow ? '<a:tailEnd type="triangle" w="med" len="med"/>' : ''}</a:ln></p:spPr></p:cxnSp>`);
  }
  pic(key, x, y, w, h, alt) {
    const id = this.nid(), rid = this.img(key);
    this.shapes.push(`<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Imagen ${id}" descr="${esc(alt || key)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${this.xfrm(x, y, w, h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`);
  }
  // table: cols = widths (pt); rows = [{cells:[{runs|text,...}], h, fill, head}]
  table(x, y, cols, rows) {
    const id = this.nid();
    const tw = cols.reduce((a, b) => a + b, 0), th = rows.reduce((a, r) => a + r.h, 0);
    const border = (n) => `<a:${n} w="6350"><a:solidFill><a:srgbClr val="${COL.borde_tarjeta}"/></a:solidFill></a:${n}>`;
    const rowXml = (r) => `<a:tr h="${emu(r.h)}">${r.cells.map((c) => `<a:tc><a:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${(c.paras || [{ runs: c.runs }]).map(paraXml).join('')}</a:txBody><a:tcPr marL="${emu(8)}" marR="${emu(8)}" marT="${emu(3.6)}" marB="${emu(3.6)}" anchor="ctr">${['lnL', 'lnR', 'lnT', 'lnB'].map(border).join('')}${this.fillXml(r.fill)}</a:tcPr></a:tc>`).join('')}</a:tr>`;
    this.shapes.push(`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Tabla ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(tw)}" cy="${emu(th)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid>${cols.map((c) => `<a:gridCol w="${emu(c)}"/>`).join('')}</a:tblGrid>${rows.map(rowXml).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`);
  }
  xml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${this.bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${this.shapes.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  }
}

// ---------- packaging into the template ----------
// slides: [{xml, images:[mediaKey|{name,buf}], ...}]. Replaces any slide the template already has.
async function packageDeck(templatePath, slides, outFile, props = {}) {
  const zip = await JSZip.loadAsync(fs.readFileSync(templatePath));
  const put = (n, d) => zip.file(n, d, { createFolders: false });
  for (const n of Object.keys(zip.files)) if (/^ppt\/slides\//.test(n)) zip.remove(n);
  const layout = 7; // "Blank" layout of the template
  const imgBufs = new Map(); // generated pictures (e.g. the end-to-end PNG): key -> buffer
  slides.forEach((s) => s.images.forEach((k) => { if (typeof k === 'object') imgBufs.set(k.name, k.buf); }));
  let ct = await zip.file('[Content_Types].xml').async('string');
  ct = ct.replace(/<Override PartName="\/ppt\/slides\/[^>]*\/>/g, '');
  let pres = await zip.file('ppt/presentation.xml').async('string');
  let prels = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
  prels = prels.replace(/<Relationship [^>]*relationships\/slide"[^>]*\/>/g, '');
  const ids = [];
  let ctAdd = '', relAdd = '';
  slides.forEach((s, i) => {
    const n = i + 1;
    put(`ppt/slides/slide${n}.xml`, s.xml);
    const rels = s.images.map((k, j) => {
      const name = typeof k === 'object' ? k.name : k;
      if (typeof k === 'object') put(`ppt/media/${name}`, k.buf);
      else if (!zip.file(`ppt/media/${name}`)) throw new Error('Template has no media file ' + name);
      return `<Relationship Id="rId${j + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${name}"/>`;
    }).join('');
    put(`ppt/slides/_rels/slide${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout${layout}.xml"/>${rels}</Relationships>`);
    ctAdd += `<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
    relAdd += `<Relationship Id="rIdS${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${n}.xml"/>`;
    ids.push(`<p:sldId id="${255 + n}" r:id="rIdS${n}"/>`);
  });
  ct = ct.replace('</Types>', ctAdd + '</Types>');
  prels = prels.replace('</Relationships>', relAdd + '</Relationships>');
  pres = pres.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, '').replace('</p:sldMasterIdLst>', `</p:sldMasterIdLst><p:sldIdLst>${ids.join('')}</p:sldIdLst>`);
  put('[Content_Types].xml', ct); put('ppt/presentation.xml', pres); put('ppt/_rels/presentation.xml.rels', prels);
  const title = props.title || 'Pre-kickoff';
  put('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>Jelou</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`);
  put('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Office PowerPoint</Application><PresentationFormat>Widescreen</PresentationFormat><Slides>${slides.length}</Slides></Properties>`);
  if (props.prune !== false) { // generated decks only carry the media they use; the template keeps the whole icon set (shown on its icon-gallery pattern slide)
    const used = new Set(slides.flatMap((s) => s.images.map((k) => (typeof k === 'object' ? k.name : k))));
    Object.keys(zip.files).filter((n) => n.startsWith('ppt/media/') && !used.has(n.split('/').pop())).forEach((n) => zip.remove(n));
  }
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(outFile, buf);
  return buf.length;
}

module.exports = { BRAND, COL, FONT, LH, emu, esc, runs, paraXml, Slide, lineCount, textHeight, trunc, packageDeck, PENDING };
