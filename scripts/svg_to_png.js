#!/usr/bin/env node
// Renders an SVG to PNG with resvg and the Poppins fonts of assets/fonts (same engine as the diagrams).
// Usage: node svg_to_png.js in.svg out.png [width_px]
const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const [, , inFile, outFile, width] = process.argv;
if (!inFile || !outFile) { console.error("Usage: node svg_to_png.js in.svg out.png [width_px]"); process.exit(2); }
const fonts = path.join(__dirname, "..", "assets", "fonts");
const r = new Resvg(fs.readFileSync(inFile, "utf8"), {
  fitTo: width ? { mode: "width", value: Number(width) } : { mode: "original" },
  background: "#ffffff",
  font: { fontFiles: [path.join(fonts, "Poppins-Regular.ttf"), path.join(fonts, "Poppins-SemiBold.ttf")], loadSystemFonts: false, defaultFontFamily: "Poppins" },
});
const png = r.render();
fs.writeFileSync(outFile, png.asPng());
console.log(`${outFile} (${png.width}x${png.height})`);
