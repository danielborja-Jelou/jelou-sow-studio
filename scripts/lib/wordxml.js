// Shared WordprocessingML helpers for the Word builders (SOW, faltantes): injects generated XML into
// assets/template/sow-template.docx (Poppins fonts, letterhead background, styles and numbering).
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const C = require("./common");
const { arr } = C;

const brand = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "assets", "brand.json"), "utf8"));
const TPL = path.join(__dirname, "..", "..", "assets", "template", "sow-template.docx");
const B = brand.word;

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function rPr(o = {}) {
  let x = "";
  if (o.sb) x += '<w:rFonts w:ascii="Poppins SemiBold" w:hAnsi="Poppins SemiBold" w:cs="Poppins SemiBold" w:eastAsia="Poppins SemiBold"/>';
  if (o.italic) x += "<w:i/><w:iCs/>";
  if (o.color) x += `<w:color w:val="${o.color}"/>`;
  if (o.size) x += `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>`;
  return x ? `<w:rPr>${x}</w:rPr>` : "";
}
// Text run(s); every "POR COMPLETAR" / "POR DEFINIR" is painted red.
function run(text, o = {}) {
  const parts = String(text == null ? "" : text).split(/(POR COMPLETAR|POR DEFINIR)/);
  return parts.filter((p) => p !== "").map((p) => {
    const red = p === "POR COMPLETAR" || p === "POR DEFINIR";
    return `<w:r>${rPr(red ? { ...o, color: B.color_pendiente } : o)}<w:t xml:space="preserve">${esc(p)}</w:t></w:r>`;
  }).join("");
}
function P(content, o = {}) {
  let pPr = "";
  if (o.style) pPr += `<w:pStyle w:val="${o.style}"/>`;
  if (o.keepNext) pPr += "<w:keepNext/>";
  if (o.pageBreakBefore) pPr += "<w:pageBreakBefore/>";
  if (o.numId) pPr += `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${o.numId}"/></w:numPr>`;
  if (o.after != null || o.before != null) pPr += `<w:spacing${o.before != null ? ` w:before="${o.before}"` : ""}${o.after != null ? ` w:after="${o.after}"` : ""}/>`;
  if (o.ind) pPr += o.ind;
  if (o.jc) pPr += `<w:jc w:val="${o.jc}"/>`;
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${content}</w:p>`;
}
const text = (t, o) => P(run(t, o), o);
const H1 = (t) => P(run(t), { style: "Heading1", numId: 2, ind: '<w:ind w:left="0" w:firstLine="0"/>' });
const H2 = (t) => P(run(t), { style: "Heading2" });
const bullet = (t, o = {}) => P(typeof t === "string" ? run(t, o) : t.join(""), { numId: 1, after: 60 });
const labeled = (label, value) => P(run(label + ": ", { sb: true }) + run(value));
const caption = (t) => P(run(t, { italic: true, color: B.color_secundario, size: 18 }), { jc: "center", after: 160 });

function cellXml(content, w, o = {}) {
  const lines = arr(content).flatMap((c) => String(c == null ? "" : c).split("\n"));
  const paras = (lines.length ? lines : [""]).map((l) => `<w:p><w:pPr><w:spacing w:after="0" w:line="264" w:lineRule="auto"/></w:pPr>${run(l, { sb: o.sb, color: o.color, size: B.tamanos_medios_puntos.tabla })}</w:p>`).join("");
  const mar = brand.word.tabla.margen_celda_dxa;
  return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o.fill ? `<w:shd w:fill="${o.fill}" w:val="clear"/>` : ""}<w:tcMar><w:top w:w="${mar.vertical}" w:type="dxa"/><w:left w:w="${mar.horizontal}" w:type="dxa"/><w:bottom w:w="${mar.vertical}" w:type="dxa"/><w:right w:w="${mar.horizontal}" w:type="dxa"/></w:tcMar></w:tcPr>${paras}</w:tc>`;
}
function table(headers, rows, widths, o = {}) {
  const total = B.tabla.ancho_dxa;
  const sum = widths.reduce((a, b) => a + b, 0);
  const w = widths.map((x) => Math.round((x / sum) * total));
  w[w.length - 1] += total - w.reduce((a, b) => a + b, 0);
  const bd = B.tabla.borde;
  const border = (n) => `<w:${n} w:color="${bd}" w:space="0" w:sz="4" w:val="single"/>`;
  let x = `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:jc w:val="left"/><w:tblInd w:w="-110" w:type="dxa"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblLook w:val="0400"/></w:tblPr><w:tblGrid>${w.map((g) => `<w:gridCol w:w="${g}"/>`).join("")}</w:tblGrid>`;
  if (headers) x += `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${headers.map((h, i) => cellXml(h, w[i], { fill: B.tabla.fondo_cabecera, sb: true })).join("")}</w:tr>`;
  for (const r of rows) {
    x += `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c, i) => cellXml(c, w[i], o.firstColFill && i === 0 ? { fill: B.tabla.fondo_cabecera, sb: true } : {})).join("")}</w:tr>`;
  }
  return x + "</w:tbl>" + P("", { after: 80 });
}
const kvTable = (rows, widths = [22, 78]) => table(null, rows, widths, { firstColFill: true });
const val = (v) => (v === undefined || v === null || v === "" ? "—" : v);

// ---------- figures ----------
const figures = []; // {rId, buf, cx, cy, name}
function figureXml(fig, n) {
  const id = 100 + n;
  return `<w:p><w:pPr><w:spacing w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${fig.cx}" cy="${fig.cy}"/><wp:docPr id="${id}" name="${esc(fig.name)}" descr="${esc(fig.alt || fig.name)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${esc(fig.name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${fig.rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${fig.cx}" cy="${fig.cy}"/></a:xfrm><a:prstGeom prst="rect"/></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}
let diagramLib = null, figLib = null;
try { diagramLib = require("./diagram"); figLib = require("./figuras"); } catch (e) { console.warn("Note: diagram.js not available; diagrams are skipped."); }
function addFigure(spec, name, alt) {
  if (!diagramLib || !spec || !arr(spec.pasos).length) return "";
  const out = diagramLib.renderDiagramPng(spec, {});
  const maxW = 5832000, maxH = 7500000; // 16.2 cm wide; keep inside the page
  let cx = maxW, cy = Math.round((out.height / out.width) * maxW);
  if (cy > maxH) { cy = maxH; cx = Math.round((out.width / out.height) * maxH); }
  const fig = { rId: `rIdFig${figures.length + 1}`, buf: out.png, cx, cy, name, alt };
  figures.push(fig);
  return figureXml(fig, figures.length);
}


// PNG already rendered (e.g. the Gantt from cronograma.py): size read from the IHDR chunk, scaled to the page width
function addPng(buf, name, alt) {
  if (!buf || buf.length < 24) return "";
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const maxW = 5832000, maxH = 7500000;
  let cx = maxW, cy = Math.round((h / w) * maxW);
  if (cy > maxH) { cy = maxH; cx = Math.round((w / h) * maxH); }
  const fig = { rId: `rIdFig${figures.length + 1}`, buf, cx, cy, name, alt };
  figures.push(fig);
  return figureXml(fig, figures.length);
}

// ---------- assembly ----------
// body: array of XML strings. Returns the path written. opts: { footerText, title }
async function assemble(body, outFile, opts = {}) {
  const zip = await JSZip.loadAsync(fs.readFileSync(TPL));
  let doc = await zip.file("word/document.xml").async("string");
  doc = doc.replace("{{BODY}}", () => body.join(""));
  zip.file("word/document.xml", doc);

  let foot = await zip.file("word/footer1.xml").async("string");
  foot = foot.replace("{{FOOTER_TEXT}}", () => esc(opts.footerText || ""));
  zip.file("word/footer1.xml", foot);

  if (figures.length) {
    let rels = await zip.file("word/_rels/document.xml.rels").async("string");
    const addRels = figures.map((fg, i) => `<Relationship Id="${fg.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/fig${i + 1}.png"/>`).join("");
    rels = rels.replace("</Relationships>", addRels + "</Relationships>");
    zip.file("word/_rels/document.xml.rels", rels);
    figures.forEach((fg, i) => zip.file(`word/media/fig${i + 1}.png`, fg.buf, { createFolders: false }));
  }
  const core = zip.file("docProps/core.xml");
  if (core && opts.title) {
    let c = await core.async("string");
    c = c.replace(/<dc:title>[^<]*<\/dc:title>/, `<dc:title>${esc(opts.title)}</dc:title>`);
    zip.file("docProps/core.xml", c);
  }
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(outFile, buf);
  return { buf, figures: figures.length };
}

module.exports = { brand, B, esc, rPr, run, P, text, H1, H2, bullet, labeled, caption, cellXml, table, kvTable, val, addFigure, addPng, figures, assemble };
