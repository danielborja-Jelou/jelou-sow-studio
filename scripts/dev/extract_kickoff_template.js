#!/usr/bin/env node
// DEV TOOL (not needed at runtime): decompiles an example kickoff deck into the clean base package that
// build_kickoff_pptx.js injects slides into (assets/kickoff-template.pptx).
//
//   node scripts/dev/extract_kickoff_template.js <example-deck.pptx> <out-base.pptx>
//   node scripts/build_kickoff_pptx.js --patrones <out-base.pptx>     (adds the placeholder pattern slides)
//
// What it keeps from the example: theme (Jelou colour scheme + Poppins fonts), slide master and layouts (rescaled from the
// 4:3 default geometry to 16:9), the embedded Poppins fonts (EOT .fntdata), the Jelou logos (white / cyan) and the line icons.
// What it drops: every slide (and so every client-specific text), the thumbnail, printer settings and document properties
// that name a person or a company. Media files are renamed to what they are.
const fs = require("fs");
const JSZip = require("jszip");

// The example's media, by what each file contains (checked visually): two logos and 23 cyan line icons.
const MEDIA = {
  "image1.png": "logo-blanco.png", "image2.png": "logo-turquesa.png",
  "image3.png": "icon-users.png", "image4.png": "icon-target.png", "image5.png": "icon-workflow.png", "image6.png": "icon-comments.png",
  "image7.png": "icon-plug.png", "image8.png": "icon-calendar.png", "image9.png": "icon-alert.png", "image10.png": "icon-check-circle.png",
  "image11.png": "icon-checklist.png", "image12.png": "icon-link.png", "image13.png": "icon-send.png", "image14.png": "icon-phone.png",
  "image15.png": "icon-database.png", "image16.png": "icon-chart.png", "image17.png": "icon-user.png", "image18.png": "icon-bot.png",
  "image19.png": "icon-gauge.png", "image20.png": "icon-face.png", "image21.png": "icon-building.png", "image22.png": "icon-chat.png",
  "image23.png": "icon-shield.png", "image24.png": "icon-id-card.png", "image25.png": "icon-file.png",
};

(async () => {
  const [src, out] = process.argv.slice(2);
  if (!src || !out) { console.error("Usage: node extract_kickoff_template.js <example-deck.pptx> <out-base.pptx>"); process.exit(2); }
  const zin = await JSZip.loadAsync(fs.readFileSync(src));
  const zout = new JSZip();
  const put = (n, d) => zout.file(n, d, { createFolders: false });
  const text = async (n) => zin.file(n).async("string");
  const SX = 12192000 / 9144000;
  const scaleX = (xml) => xml.replace(/<a:off x="(\d+)"/g, (_, x) => `<a:off x="${Math.round(x * SX)}"`).replace(/<a:ext cx="(\d+)"/g, (_, x) => `<a:ext cx="${Math.round(x * SX)}"`);

  for (const name of Object.keys(zin.files)) {
    const f = zin.files[name];
    if (f.dir) continue;
    if (/^ppt\/slides\//.test(name) || /thumbnail|printerSettings|^docProps\//.test(name)) continue; // slides, thumbnail, printer settings, doc properties
    if (/^ppt\/media\//.test(name)) { const base = name.split("/").pop(); if (MEDIA[base]) put("ppt/media/" + MEDIA[base], await f.async("nodebuffer")); continue; }
    let data = await f.async("nodebuffer");
    if (/^ppt\/(slideMasters|slideLayouts)\/[^/]+\.xml$/.test(name)) data = Buffer.from(scaleX(data.toString("utf8")));
    if (name === "ppt/theme/theme1.xml") data = Buffer.from(data.toString("utf8").replace('<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"', '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Jelou"').replace('<a:fontScheme name="Office"', '<a:fontScheme name="Jelou"'));
    if (name === "ppt/presentation.xml") {
      let p = data.toString("utf8");
      p = p.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, "").replace(/<p:sldSz [^>]*\/>/, '<p:sldSz cx="12192000" cy="6858000"/>');
      data = Buffer.from(p);
    }
    if (name === "ppt/_rels/presentation.xml.rels") data = Buffer.from(data.toString("utf8").replace(/<Relationship [^>]*(?:relationships\/slide"|printerSettings)[^>]*\/>/g, ""));
    if (name === "_rels/.rels") data = Buffer.from(data.toString("utf8").replace(/<Relationship [^>]*(?:thumbnail|core-properties|extended-properties)[^>]*\/>/g, ""));
    if (name === "[Content_Types].xml") data = Buffer.from(data.toString("utf8").replace(/<Override PartName="\/(?:ppt\/slides\/|docProps\/)[^>]*\/>/g, "").replace(/<Default Extension="(?:bin|jpeg)"[^>]*\/>/g, ""));
    put(name, data);
  }
  // minimal document properties (rewritten by the builder on every run)
  put("docProps/core.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Plantilla de kickoff Jelou</dc:title><dc:creator>Jelou</dc:creator></cp:coreProperties>');
  put("docProps/app.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Office PowerPoint</Application><PresentationFormat>Widescreen</PresentationFormat><Slides>0</Slides></Properties>');
  let rels = await zout.file("_rels/.rels").async("string");
  rels = rels.replace("</Relationships>", '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>');
  put("_rels/.rels", rels);
  let ct = await zout.file("[Content_Types].xml").async("string");
  ct = ct.replace("</Types>", '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>');
  put("[Content_Types].xml", ct);
  fs.writeFileSync(out, await zout.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log(`Base template written: ${out} (${Object.keys(zout.files).length} parts)`);
})();
