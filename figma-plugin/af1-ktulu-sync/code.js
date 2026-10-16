// AF1 Ktulu Sync – the campaign sitemap in Figma, the AF1 Tool and the
// staging CMS in the same state.
//
// Page layout (like the São Paulo file):
//   AF1_<Campaign>_Flow_Overview          journey map; titles link to the screens
//   one section per landing page          "MOBILE · NN · Title", the mobile page,
//                                         and (on the activation page) the Team
//                                         Card journey to the right
// Sections are arranged like the sitemap: left activations | hub | right.
//
// Tagged nodes carry shared plugin data (namespace "af1", key "sync"):
//   page frame : { type:"page", url, stagingId }
//   module/card: { type:"block"|"card", fields:[{key,layer,kind}], last:{}, imgs:{} }

var BASE = "https://af1-ktulu.vercel.app/api/figma/";
var NS = "af1";
var STATIC_AUDI = { "Audi Type Variable": "Audi Type" };
var state = { token: "", campaign: "sin", data: null, live: true, busy: false };

figma.showUI(__html__, { width: 440, height: 600, themeColors: true });

function send(type, payload) { figma.ui.postMessage(Object.assign({ type: type }, payload || {})); }
function log(msg) { send("log", { msg: msg }); }
function progress(msg) { send("progress", { msg: msg }); }
function readData(n) { var s = n.getSharedPluginData(NS, "sync"); if (!s) return null; try { return JSON.parse(s); } catch (e) { return null; } }
function writeData(n, d) { n.setSharedPluginData(NS, "sync", JSON.stringify(d)); }
function apiUrl() { return BASE + encodeURIComponent(state.token) + "/" + state.campaign; }
function mediaUrl(id) { return apiUrl() + "?media=" + encodeURIComponent(id); }
function solid(r, g, b) { return [{ type: "SOLID", color: { r: r, g: g, b: b } }]; }
var GRAPH = solid(0.169, 0.161, 0.161), CHALK = solid(0.961, 0.949, 0.949), MUTED = solid(0.463, 0.451, 0.451), LAVA = solid(1, 0.176, 0);
function autoLayout(dir) { var f = figma.createFrame(); f.layoutMode = dir; f.primaryAxisSizingMode = "AUTO"; f.counterAxisSizingMode = "AUTO"; f.fills = []; return f; }

async function api(method, body) {
  var res = await fetch(apiUrl(), { method: method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  var j = await res.json();
  if (!res.ok) throw new Error(j && j.error ? j.error : "HTTP " + res.status);
  return j;
}

// ---- UI round trips: images are decoded / encoded in the UI iframe -------
var waits = {}, seq = 0;
function askUI(type, payload) {
  return new Promise(function (resolve, reject) {
    var id = "r" + (++seq);
    waits[id] = { resolve: resolve, reject: reject };
    send(type, Object.assign({ reqId: id }, payload));
    setTimeout(function () { if (waits[id]) { delete waits[id]; reject(new Error(type + " timed out")); } }, 60000);
  });
}

// ---- fonts ----------------------------------------------------------------
var fontState = {};
async function loadFont(f) {
  var k = f.family + "|" + f.style;
  if (fontState[k] === undefined) { try { await figma.loadFontAsync(f); fontState[k] = true; } catch (e) { fontState[k] = false; } }
  return fontState[k];
}
function textNodes(node) { var t = node.findAllWithCriteria ? node.findAllWithCriteria({ types: ["TEXT"] }) : []; if (node.type === "TEXT") t.push(node); return t; }
function fontsOf(t) { return t.fontName === figma.mixed ? t.getStyledTextSegments(["fontName"]).map(function (x) { return x.fontName; }) : [t.fontName]; }
async function preloadFonts(node) {
  var missing = [], texts = textNodes(node);
  for (var i = 0; i < texts.length; i++) {
    var fs = fontsOf(texts[i]);
    for (var j = 0; j < fs.length; j++) if (!(await loadFont(fs[j]))) { var n = fs[j].family + " " + fs[j].style; if (missing.indexOf(n) < 0) missing.push(n); }
  }
  return missing;
}
async function loadFonts(t) { var fs = fontsOf(t); for (var i = 0; i < fs.length; i++) await loadFont(fs[i]); }
// "Audi Type Variable" renders wrong in Figma → the installed static "Audi Type"
async function swapFonts(node) {
  var texts = textNodes(node);
  for (var i = 0; i < texts.length; i++) {
    var segs = texts[i].getStyledTextSegments(["fontName"]);
    for (var j = 0; j < segs.length; j++) {
      var to = STATIC_AUDI[segs[j].fontName.family];
      if (!to) continue;
      var nf = { family: to, style: segs[j].fontName.style };
      if (await loadFont(nf)) texts[i].setRangeFontName(segs[j].start, segs[j].end, nf);
    }
  }
}

// ---- layers ---------------------------------------------------------------
var ALIASES = { "Learn more": ["Learn more", "Button Label"], Kicker: ["Kicker", "Category"] };
function shown(n, root) { var p = n; while (p && p !== root) { if (!p.visible) return false; p = p.parent; } return true; }
function hasAncestor(n, root, part) { var p = n.parent; while (p && p !== root) { if (p.name.indexOf(part) >= 0) return true; p = p.parent; } return false; }
// spec: "Name", "Scope>Name", or "A|B" (first visible match)
function findLayer(inst, spec, kind) {
  var options = spec.split("|");
  var fallback = null;
  for (var o = 0; o < options.length; o++) {
    var parts = options[o].split(">"), leaf = parts[parts.length - 1], scope = parts.length > 1 ? parts[0] : null;
    var names = ALIASES[leaf] || [leaf];
    for (var i = 0; i < names.length; i++) {
      var hits = inst.findAll(function (x) { return x.name === names[i] && (kind === "TEXT" ? x.type === "TEXT" : "fills" in x && x.type !== "TEXT") && (!scope || hasAncestor(x, inst, scope)); });
      for (var h = 0; h < hits.length; h++) { if (shown(hits[h], inst)) return hits[h]; if (!fallback) fallback = hits[h]; }
    }
  }
  return kind === "TEXT" ? fallback : null;
}
function propKey(inst, layer) { var props = inst.componentProperties || {}; for (var k in props) if (props[k].type === "TEXT" && k.split("#")[0] === layer) return k; return null; }

async function setText(inst, layer, value) {
  var t = findLayer(inst, layer, "TEXT");
  var v = value === "" ? " " : value;
  if (!t) { var pk = propKey(inst, layer); if (pk) { var o = {}; o[pk] = v; inst.setProperties(o); return true; } return false; }
  var ref = t.componentPropertyReferences && t.componentPropertyReferences.characters;
  if (ref) {
    var owner = t.parent;
    while (owner && !(owner.type === "INSTANCE" && owner.componentProperties && owner.componentProperties[ref])) owner = owner.parent;
    if (owner) { var p = {}; p[ref] = v; owner.setProperties(p); }
  } else { await loadFonts(t); t.characters = v; }
  t.visible = value !== "";
  return true;
}
function getText(inst, layer) {
  var t = findLayer(inst, layer, "TEXT");
  if (t) return t.visible ? t.characters : "";
  var pk = propKey(inst, layer); return pk ? String(inst.componentProperties[pk].value) : undefined;
}
function imageHashOf(node) { var f = node && node.fills; if (!f || f === figma.mixed) return null; for (var i = 0; i < f.length; i++) if (f[i].type === "IMAGE") return f[i].imageHash; return null; }

var imageCache = {};
async function coverPaint(node, hash, mediaId) {
  var f = (state.data && state.data.media && state.data.media[mediaId]) || { fx: 50, fy: 50 };
  try {
    var size = await figma.getImageByHash(hash).getSizeAsync();
    var w = node.width, h = node.height, sc = Math.max(w / size.width, h / size.height);
    var sw = Math.min(1, w / (size.width * sc)), sh = Math.min(1, h / (size.height * sc));
    var ox = Math.max(0, Math.min(1 - sw, f.fx / 100 - sw / 2)), oy = Math.max(0, Math.min(1 - sh, f.fy / 100 - sh / 2));
    return { type: "IMAGE", imageHash: hash, scaleMode: "CROP", imageTransform: [[sw, 0, ox], [0, sh, oy]] };
  } catch (e) { return { type: "IMAGE", imageHash: hash, scaleMode: "FILL" }; }
}
async function setImage(inst, layer, mediaId) {
  var node = findLayer(inst, layer, "IMAGE");
  if (!node || !mediaId) return null;
  var hash = imageCache[mediaId];
  if (!hash) {
    var bytes = await askUI("fetch-image", { url: mediaUrl(mediaId) });
    hash = figma.createImage(new Uint8Array(bytes)).hash;
    imageCache[mediaId] = hash;
  }
  node.fills = [await coverPaint(node, hash, mediaId)]; // replaces the sample image, never adds one
  return hash;
}

async function applyFields(node, values) {
  var d = readData(node); if (!d || !d.fields) return [];
  d.last = d.last || {}; d.imgs = d.imgs || {};
  await preloadFonts(node);
  var done = [];
  for (var i = 0; i < d.fields.length; i++) {
    var f = d.fields[i];
    if (!(f.key in values)) continue;
    try {
      if (f.kind === "image") { var h = await setImage(node, f.layer, values[f.key]); if (h) d.imgs[f.key] = { hash: h, id: values[f.key] }; }
      else await setText(node, f.layer, values[f.key]);
      d.last[f.key] = values[f.key]; done.push(f.key);
    } catch (e) { log("⚠ " + node.name + " · " + f.layer + ": " + (e && e.message ? e.message : e)); }
  }
  await swapFonts(node);
  writeData(node, d);
  return done;
}

// ---- Figma state ----------------------------------------------------------
function tagged(page) { return page.findAll(function (n) { return (n.type === "INSTANCE" || n.type === "FRAME") && !!n.getSharedPluginData(NS, "sync"); }); }
function collect(page) {
  var values = {}, changed = {}, nodes = {}, byKey = {}, uploads = [];
  var all = tagged(page);
  for (var i = 0; i < all.length; i++) {
    var n = all[i], d = readData(n); if (!d) continue;
    if (d.type === "page") { if (n.name.indexOf("Mobile /") === 0) nodes[d.stagingId] = n.id; continue; }
    if (!d.fields) continue;
    for (var j = 0; j < d.fields.length; j++) {
      var f = d.fields[j]; (byKey[f.key] = byKey[f.key] || []).push(n);
      var v;
      if (f.kind === "image") {
        var layer = findLayer(n, f.layer, "IMAGE"), h = imageHashOf(layer), rec = (d.imgs || {})[f.key];
        if (!h) continue;
        if (rec && rec.hash === h) v = rec.id; else { uploads.push({ node: n, field: f, layer: layer, hash: h }); v = "upload:" + h; }
      } else { v = getText(n, f.layer); if (v === undefined) continue; }
      var isChange = !d.last || d.last[f.key] !== v;
      if (!(f.key in values) || (isChange && !changed[f.key])) { values[f.key] = v; if (isChange) changed[f.key] = true; }
    }
  }
  return { values: values, nodes: nodes, byKey: byKey, uploads: uploads };
}
async function runUploads(c) {
  var done = {};
  for (var i = 0; i < c.uploads.length; i++) {
    var u = c.uploads[i];
    if (c.values[u.field.key] !== "upload:" + u.hash) continue;
    if (!done[u.hash]) {
      progress("Uploading image " + (i + 1) + " / " + c.uploads.length + " to staging …");
      var raw = await figma.getImageByHash(u.hash).getBytesAsync();
      var enc = await askUI("encode-image", { bytes: Array.from(raw) });
      done[u.hash] = (await api("POST", { action: "upload", name: u.node.name.split(" · ")[0] + " " + u.field.layer, mime: "image/jpeg", data: enc.base64, alt: u.node.name })).id;
    }
    c.values[u.field.key] = done[u.hash];
    var d = readData(u.node); d.imgs = d.imgs || {}; d.imgs[u.field.key] = { hash: u.hash, id: done[u.hash] }; writeData(u.node, d);
  }
}
async function writeKeys(map, byKey) {
  var nodes = [], done = [];
  for (var k in map) (byKey[k] || []).forEach(function (n) { if (nodes.indexOf(n) < 0) nodes.push(n); });
  for (var i = 0; i < nodes.length; i++) (await applyFields(nodes[i], map)).forEach(function (k) { if (done.indexOf(k) < 0) done.push(k); });
  return done;
}
async function goToCampaignPage() {
  var id = state.data && state.data.campaign && state.data.campaign.figmaPage;
  var page = id ? await figma.getNodeByIdAsync(id) : null;
  if (page && page.type === "PAGE" && figma.currentPage !== page) await figma.setCurrentPageAsync(page);
  return figma.currentPage;
}

// ---- local modules (not in the 07 library) --------------------------------
var localCache = {};
async function styleText(t, kind, size, color) {
  var fam = (await loadFont({ family: "Audi Type", style: kind })) ? "Audi Type" : "Inter";
  var st = fam === "Inter" ? (kind === "Extended Normal" ? "Bold" : "Regular") : kind;
  await loadFont({ family: fam, style: st });
  t.fontName = { family: fam, style: st }; t.fontSize = size; t.fills = color || GRAPH;
  t.lineHeight = { unit: "PERCENT", value: kind === "Extended Normal" ? 120 : 150 };
}
async function newText(parent, name, chars, kind, size, color) {
  var t = figma.createText(); parent.appendChild(t); await styleText(t, kind, size, color);
  t.name = name; t.characters = chars; t.layoutSizingHorizontal = "FILL"; t.textAutoResize = "HEIGHT"; return t;
}
async function localComponent(name) {
  if (localCache[name]) return localCache[name];
  var p = figma.root.children.filter(function (x) { return x.name === "AF1 Local Modules"; })[0];
  if (!p) { p = figma.createPage(); p.name = "AF1 Local Modules"; }
  await p.loadAsync();
  var c = p.findOne(function (n) { return n.type === "COMPONENT" && n.name === name; });
  if (c) return (localCache[name] = c);
  c = figma.createComponent(); c.name = name; p.appendChild(c);
  c.layoutMode = "VERTICAL"; c.primaryAxisSizingMode = "AUTO"; c.counterAxisSizingMode = "FIXED"; c.resize(375, 100);
  c.paddingLeft = c.paddingRight = 24; c.itemSpacing = 16; c.x = p.children.length * 475;
  if (name === "Free Text Mobile") { c.paddingTop = c.paddingBottom = 32; c.fills = GRAPH; await newText(c, "Copy", "Rich text", "Wide Normal", 14, CHALK); }
  else if (name === "List Section Mobile") {
    c.paddingTop = c.paddingBottom = 48; c.fills = CHALK; c.itemSpacing = 12;
    await newText(c, "Headline", "Headline", "Extended Normal", 28); await newText(c, "Subline", "Subline", "Wide Normal", 16); await newText(c, "Copy", "Copy", "Wide Normal", 14, MUTED);
    for (var i = 1; i <= 6; i++) {
      var it = autoLayout("VERTICAL"); it.name = "Item " + i; c.appendChild(it); it.layoutSizingHorizontal = "FILL"; it.paddingTop = 16; it.itemSpacing = 6;
      it.strokes = solid(0.878, 0.867, 0.867); it.strokeTopWeight = 1; it.strokeBottomWeight = 0; it.strokeLeftWeight = 0; it.strokeRightWeight = 0;
      await newText(it, "Item " + i + " · Label", "Label", "Extended Normal", 18); await newText(it, "Item " + i + " · Caption", "Caption", "Wide Normal", 14, MUTED);
    }
  } else if (name === "iFrame Mobile") {
    c.paddingTop = c.paddingBottom = 240; c.fills = GRAPH; c.counterAxisAlignItems = "CENTER";
    await newText(c, "Label", "iFrame embed", "Extended Normal", 20, CHALK); await newText(c, "URL", "https://", "Wide Normal", 12, solid(0.7, 0.7, 0.7));
  }
  c.description = "AF1 " + name + " · built by AF1 Ktulu Sync (not in the 07 library yet).";
  return (localCache[name] = c);
}

// ---- build ----------------------------------------------------------------
var setCache = {};
async function variantOf(key, variant) {
  if (!setCache[key]) setCache[key] = await figma.importComponentSetByKeyAsync(key);
  var set = setCache[key];
  return (variant && set.children.filter(function (c) { return c.name === variant; })[0]) || set.defaultVariant;
}
function valuesOf(fields) { var o = {}; fields.forEach(function (f) { o[f.key] = f.value; }); return o; }
function tagFields(fields) { return fields.map(function (f) { return { key: f.key, layer: f.layer, kind: f.kind }; }); }
async function label(parent, chars, size, style, fills, x, y, w) {
  await loadFont({ family: "Inter", style: style });
  var t = figma.createText(); parent.appendChild(t); t.fontName = { family: "Inter", style: style }; t.fontSize = size; t.characters = chars; t.fills = fills || GRAPH; t.x = x; t.y = y;
  if (w) { t.resize(w, t.height); t.textAutoResize = "HEIGHT"; }
  return t;
}
async function arrow(parent, pts, color, dash, text) {
  var v = figma.createVector(); parent.appendChild(v); v.name = "Arrow";
  var mx = Math.min.apply(null, pts.map(function (p) { return p[0]; })), my = Math.min.apply(null, pts.map(function (p) { return p[1]; }));
  await v.setVectorNetworkAsync({ vertices: pts.map(function (p, i) { return { x: p[0] - mx, y: p[1] - my, strokeCap: i === pts.length - 1 ? "ARROW_LINES" : "NONE" }; }), segments: pts.slice(1).map(function (_, i) { return { start: i, end: i + 1 }; }), regions: [] });
  v.x = mx; v.y = my; v.strokes = color; v.strokeWeight = 3; v.dashPattern = dash || [];
  if (text) { var t = await label(parent, text, 22, "Semi Bold", color, pts[0][0] + 24, pts[0][1] - 36); t.name = "Arrow label"; }
}

async function moduleInstance(b) {
  var def = state.data.modules[b.blockType];
  if (!def) return null;
  var comp = def.local ? await localComponent(def.local) : await variantOf(def.key, def.variant);
  await preloadFonts(comp);
  return comp.createInstance();
}

async function buildPageFrame(sec, p, x, y) {
  var fr = autoLayout("VERTICAL"); fr.name = "Mobile / page:" + p.url; sec.appendChild(fr);
  fr.x = x; fr.y = y; fr.resize(375, 100); fr.counterAxisSizingMode = "FIXED"; fr.primaryAxisSizingMode = "AUTO"; fr.clipsContent = true; fr.fills = CHALK;
  writeData(fr, { type: "page", url: p.url, stagingId: p.id });
  for (var i = 0; i < p.blocks.length; i++) {
    var b = p.blocks[i], node = await moduleInstance(b);
    if (!node) { log("⚠ /" + p.url + ": no module for " + b.blockType); continue; }
    fr.appendChild(node); node.layoutSizingHorizontal = "FILL";
    node.name = (i < 9 ? "0" : "") + (i + 1) + " " + b.blockType + (b.hidden ? " (hidden in CMS)" : "") + " · " + b.id;
    if (b.hidden) node.opacity = 0.35;
    if (b.blockType === "free-text" && b.bg && b.bg !== "graphite") { node.fills = CHALK; var ct = node.findOne(function (x) { return x.type === "TEXT"; }); if (ct) { await loadFonts(ct); ct.fills = GRAPH; } }
    writeData(node, { type: "block", pageId: p.id, blockId: b.id, blockType: b.blockType, fields: tagFields(b.fields), last: {}, imgs: {} });
    await applyFields(node, valuesOf(b.fields));
    if (b.blockType === "list-section") for (var k = 1; k <= 6; k++) { var lf = b.fields.filter(function (x) { return x.layer === "Item " + k + " · Label"; })[0]; var it = node.findOne(function (x) { return x.name === "Item " + k && x.type === "FRAME"; }); if (it) it.visible = !!(lf && lf.value); }
  }
  return fr;
}

function cleanTitle(t) { return String(t || "").replace(/^\s*SIN\s*\|\s*/i, ""); }

// one section per landing page; the activation page also gets the card journey
async function buildSection(p, num, card, group, isMain, mainUrl, ov) {
  var sec = figma.createSection(); sec.name = "SIN · " + String(num).padStart(2, "0") + " · " + cleanTitle(p.title);
  sec.fills = CHALK; sec.x = -50000; sec.y = 0;
  writeData(sec, { type: "section", url: p.url, group: group.key });
  try {
    if (ov) { var back = await label(sec, "← Back to the overview", 26, "Semi Bold", LAVA, 200, 70); back.hyperlink = { type: "NODE", value: ov.id }; }
    await label(sec, "MOBILE", 24, "Bold", MUTED, 200, 140);
    await label(sec, String(num).padStart(2, "0") + " · " + cleanTitle(p.title), 48, "Bold", GRAPH, 200, 180);
    await label(sec, "/" + p.url + (group.note ? "   ·   " + group.note : ""), 22, "Regular", MUTED, 200, 250);
    progress("Building /" + p.url + " …");
    var Y = 460;
    var fr = await buildPageFrame(sec, p, 200, Y);
    var right = 575, maxH = fr.height;
    var hasCard = card && p.blocks.some(function (b) { return b.badge === card.badgeId; });
    if (!isMain && hasCard) {
      var note = await label(sec, "Same Team Card as /" + mainUrl + " → its journey is shown there", 24, "Semi Bold", LAVA, 675, Y, 900);
      note.name = "Same card note";
      right = 1575;
    }
    if (isMain && card) {
      var x = 975;
      await arrow(sec, [[575, Y + 120], [x - 20, Y + 120]], LAVA, [], "Card tapped");
      for (var i = 0; i < card.states.length; i++) {
        var s = card.states[i];
        var comp = await variantOf(state.data.overlayKey, "State=" + s.state); await preloadFonts(comp);
        var inst = comp.createInstance(); sec.appendChild(inst); inst.x = x; inst.y = Y;
        inst.name = "Mobile / " + String(i + 2).padStart(2, "0") + " " + s.label;
        writeData(inst, { type: "card", badgeId: card.badgeId, state: s.state, fields: tagFields(s.fields), last: {}, imgs: {} });
        await applyFields(inst, valuesOf(s.fields));
        await label(sec, String(i + 2).padStart(2, "0") + " · " + s.label, 32, "Bold", GRAPH, x, Y - 120);
        await label(sec, s.note, 20, "Regular", MUTED, x, Y - 70, 600);
        if (i < card.states.length - 1) await arrow(sec, [[x + 375 + 10, Y + 396], [x + 775 - 20, Y + 396]], GRAPH, [], null);
        maxH = Math.max(maxH, inst.height); x += 775; right = x;
      }
    }
    sec.resizeWithoutConstraints(right + 200, Y + maxH + 240);
    return sec;
  } catch (e) { sec.remove(); throw e; }
}

function overviewSection(page) { return page.findOne(function (n) { return n.type === "SECTION" && /Flow_Overview$/.test(n.name); }); }

// left activations | hub column | right activations, the overview on top
function arrange(page, rows) {
  var ov = overviewSection(page), GAP = 400;
  var colW = { left: 0, center: 0, right: 0 };
  rows.forEach(function (r) { var w = r.secs.reduce(function (a, s) { return a + s.width; }, 0) + GAP * (r.secs.length - 1); colW[r.col] = Math.max(colW[r.col], w); });
  var x0 = 0, x1 = colW.left + 1200, x2 = x1 + colW.center + 1200;
  var top = (ov ? ov.height : 0) + 1600, y = { left: top, center: top, right: top };
  if (ov) { ov.x = x1 + colW.center / 2 - ov.width / 2; ov.y = 0; }
  rows.forEach(function (r) {
    var h = Math.max.apply(null, r.secs.map(function (s) { return s.height; }));
    var w = r.secs.reduce(function (a, s) { return a + s.width; }, 0) + GAP * (r.secs.length - 1);
    var x = r.col === "left" ? x0 + colW.left - w : r.col === "center" ? x1 + (colW.center - w) / 2 : x2;
    r.secs.forEach(function (s) { s.x = x; s.y = y[r.col] + (h - s.height) * 0; x += s.width + GAP; });
    y[r.col] += h + GAP;
  });
}

// overview titles → the screens, tiles → the activation page
var TILE = { tile_adidas: "adidas-singapore-special-drop", tile_rs5: "audi-rs5-singapores-most-wanted", tile_helmets: "mini-helmets", tile_run: "adidas-5km-run", tile_mascot: "spot-the-driver", tile_paulaner: "paulaner-pro", tile_livery: "reveal-the-livery", tile_revolut: "revolut-titanium", hub_vegas_tile: "vegas-grand-prize-2026", hub_hero: "" };
async function linkOverview(page, secByUrl) {
  var ov = overviewSection(page); if (!ov) return 0;
  var n = 0;
  var boxes = ov.children.filter(function (c) { return c.type === "FRAME"; });
  for (var i = 0; i < boxes.length; i++) {
    var c = boxes[i], url = null;
    if (c.name.indexOf("page:") === 0) url = c.name.slice(5);
    else if (c.name in TILE) url = TILE[c.name] ? "unlock-singapore/" + TILE[c.name] : "unlock-singapore";
    if (!url || !secByUrl[url]) continue;
    var texts = c.findAll(function (x) { return x.type === "TEXT"; });
    var title = texts.filter(function (x) { return x.name === "Title"; })[0] || texts.filter(function (x) { return x.fontName !== figma.mixed && /Bold/.test(x.fontName.style); })[0] || texts[0];
    if (!title) continue;
    await loadFonts(title);
    title.hyperlink = { type: "NODE", value: secByUrl[url].id }; title.textDecoration = "UNDERLINE"; n++;
  }
  return n;
}

async function buildAll() {
  state.data = await api("GET");
  var page = await goToCampaignPage();
  // a full rebuild: remove every screen section (the overview stays)
  page.children.filter(function (n) { return n.type === "SECTION" && !/Flow_Overview$/.test(n.name); }).forEach(function (n) { n.remove(); });
  var ov = overviewSection(page);
  var d = state.data, num = 0, rows = [], secByUrl = {}, built = 0;
  // sitemap order: left groups (QR page outside, activation inside), hub column, right groups
  var order = d.groups.filter(function (g) { return g.col === "center"; }).concat(d.groups.filter(function (g) { return g.col !== "center"; }));
  for (var gi = 0; gi < order.length; gi++) {
    var g = order[gi], card = d.cards.filter(function (c) { return c.group === g.key; })[0];
    var row = { col: g.col, secs: [] };
    for (var ui = 0; ui < g.urls.length; ui++) {
      var p = d.pages.filter(function (x) { return x.url === g.urls[ui]; })[0]; if (!p) continue;
      num++;
      try {
        var s = await buildSection(p, num, card, g, ui === 0, g.urls[0], ov);
        secByUrl[p.url] = s; built++;
        if (g.col === "left") row.secs.unshift(s); else row.secs.push(s); // QR pages on the outside
      } catch (e) { log("⚠ /" + p.url + " not built: " + (e && e.message ? e.message : e)); }
    }
    if (row.secs.length) rows.push(row);
  }
  arrange(page, rows);
  // QR pages: their note links to the activation page
  page.findAll(function (n) { return n.type === "TEXT" && n.name === "Same card note"; }).forEach(function (t) {
    var m = t.characters.match(/\/(unlock-singapore[^ ]*)/); if (m && secByUrl[m[1]]) t.hyperlink = { type: "NODE", value: secByUrl[m[1]].id };
  });
  var links = await linkOverview(page, secByUrl);
  if (ov) figma.viewport.scrollAndZoomIntoView([ov]);
  log("Built " + built + " pages, linked " + links + " overview titles.");
  await api("POST", { action: "ack-command" });
  progress("Recording the state …");
  await sync({}, null, true);
}

// ---- sync ----------------------------------------------------------------
async function check() {
  state.data = await api("GET");
  var page = await goToCampaignPage(), c = collect(page);
  var forCheck = {}; for (var k in c.values) if (String(c.values[k]).indexOf("upload:") !== 0) forCheck[k] = c.values[k];
  var pre = await api("POST", { action: "check", figma: forCheck });
  var builtPages = Object.keys(c.nodes).length;
  send("checked", {
    pages: state.data.pages.length, built: builtPages, command: state.data.command,
    diffs: pre.diffs.filter(function (d) { return d.state !== "missing-in-figma"; }), uploads: c.uploads.length,
    inSync: pre.inSync, total: pre.total, pending: Object.keys(state.data.pending || {}).length, user: state.data.user, syncedAt: pre.syncedAt, live: state.live,
  });
  return pre;
}

// only: list of field keys to apply (null = everything that has a newer side)
async function sync(decisions, only, quiet) {
  if (!state.data) state.data = await api("GET");
  var page = await goToCampaignPage(), c = collect(page);
  var pend = state.data.pending || {};
  if (Object.keys(pend).length) {
    var w = await writeKeys(pend, c.byKey);
    await api("POST", { action: "ack", keys: Object.keys(pend) });
    if (w.length) log("Took " + w.length + " change(s) from the AF1 Tool into Figma.");
    c = collect(page);
  }
  if (c.uploads.length) await runUploads(c);
  var body = { action: "sync", figma: c.values, nodes: c.nodes, decisions: decisions || {} };
  if (only) body.only = only;
  var r = await api("POST", body);
  var map = {}; r.toFigma.forEach(function (d) { map[d.key] = d.cms || ""; });
  var w2 = await writeKeys(map, c.byKey);
  if (r.toFigma.length) await api("POST", { action: "ack", keys: r.toFigma.map(function (d) { return d.key; }) });
  state.data = null;
  if (!quiet || r.toCms.length || w2.length) send("synced", { toCms: r.toCms.length, toFigma: w2.length, open: r.open.length, written: r.written });
  return r;
}

setInterval(async function () {
  if (!state.live || state.busy || !state.token) return;
  state.busy = true;
  try { var r = await sync({}, null, true); if (r.toCms.length || r.toFigma.length) await check(); }
  catch (e) { /* stay quiet in the background */ }
  finally { state.busy = false; }
}, 20000);

figma.ui.onmessage = async function (msg) {
  if (msg.reqId && waits[msg.reqId]) { var w = waits[msg.reqId]; delete waits[msg.reqId]; if (msg.error) w.reject(new Error(msg.error)); else w.resolve(msg.result); return; }
  if (msg.type === "live") { state.live = !!msg.on; await figma.clientStorage.setAsync("live", state.live); return; }
  if (state.busy) { log("Still working, one moment."); return; }
  state.busy = true;
  try {
    if (msg.type === "init") {
      state.token = (await figma.clientStorage.getAsync("token")) || "";
      var lv = await figma.clientStorage.getAsync("live"); state.live = lv === undefined ? true : !!lv;
      send("token", { token: state.token });
      if (state.token) {
        var pre = await api("GET"); state.data = pre;
        if (pre.command && pre.command.command === "build") { log("A full rebuild was requested in the AF1 Tool, building now …"); await buildAll(); }
        await check();
      }
    }
    if (msg.type === "save-token") { state.token = msg.token.trim(); await figma.clientStorage.setAsync("token", state.token); await check(); }
    if (msg.type === "check") await check();
    if (msg.type === "build") { await buildAll(); await check(); }
    if (msg.type === "apply") { await sync(msg.decisions, msg.only); await check(); }
  } catch (e) {
    send("error", { msg: e && e.message ? e.message : String(e) });
  } finally { state.busy = false; progress(""); }
};
