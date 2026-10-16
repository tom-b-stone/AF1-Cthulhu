// AF1 Ktulu Sync – keeps the campaign sitemap in Figma, the AF1 Tool and the
// staging CMS in the same state.
//
// Layout on the campaign page:
//   AF1_<Campaign>_Flow_Overview   the journey map (cards link to the activations)
//   <Campaign> · <Activation>      one section per activation: its mobile pages
//                                  and the journey states of its Team Card
//
// Every module / card state the plugin builds carries shared plugin data
// (namespace "af1", key "sync"):
//   { type: "block" | "card", fields: [{ key, layer, kind, readonly }],
//     last: { key: value }, imgs: { key: { hash, id } } }
// Text layers keep the design system's names (Headline, Copy …).

var BASE = "https://af1-ktulu.vercel.app/api/figma/";
var NS = "af1";
var STATIC_AUDI = { "Audi Type Variable": "Audi Type" }; // variable font → installed static family
var state = { token: "", campaign: "sin", data: null, live: true, busy: false };

figma.showUI(__html__, { width: 480, height: 680, themeColors: true });

function send(type, payload) { figma.ui.postMessage(Object.assign({ type: type }, payload || {})); }
function log(msg) { send("log", { msg: msg }); }
function readData(n) { var s = n.getSharedPluginData(NS, "sync"); if (!s) return null; try { return JSON.parse(s); } catch (e) { return null; } }
function writeData(n, d) { n.setSharedPluginData(NS, "sync", JSON.stringify(d)); }
function apiUrl() { return BASE + encodeURIComponent(state.token) + "/" + state.campaign; }
function mediaUrl(id) { return apiUrl() + "?media=" + encodeURIComponent(id); }
function autoLayout(dir) { var f = figma.createFrame(); f.layoutMode = dir; f.primaryAxisSizingMode = "AUTO"; f.counterAxisSizingMode = "AUTO"; f.fills = []; return f; }
function solid(r, g, b) { return [{ type: "SOLID", color: { r: r, g: g, b: b } }]; }
var GRAPH = solid(0.169, 0.161, 0.161), CHALK = solid(0.961, 0.949, 0.949), MUTED = solid(0.463, 0.451, 0.451), LAVA = solid(1, 0.176, 0);

async function api(method, body) {
  var res = await fetch(apiUrl(), { method: method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  var j = await res.json();
  if (!res.ok) throw new Error(j && j.error ? j.error : "HTTP " + res.status);
  return j;
}

// ---- UI round trips (image decode / encode run in the UI iframe) ----------
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
// The library uses "Audi Type Variable", which renders wrong in Figma.
// Swap it for the installed static "Audi Type" with the same style.
async function swapFonts(node) {
  var texts = textNodes(node), n = 0;
  for (var i = 0; i < texts.length; i++) {
    var t = texts[i];
    var segs = t.getStyledTextSegments(["fontName"]);
    for (var j = 0; j < segs.length; j++) {
      var f = segs[j].fontName, to = STATIC_AUDI[f.family];
      if (!to) continue;
      var nf = { family: to, style: f.style };
      if (!(await loadFont(nf))) continue;
      t.setRangeFontName(segs[j].start, segs[j].end, nf); n++;
    }
  }
  return n;
}

// ---- layers ---------------------------------------------------------------
var ALIASES = { "Learn more": ["Learn more", "Button Label"], Kicker: ["Kicker", "Category"] };
function hasAncestor(n, root, part) { var p = n.parent; while (p && p !== root) { if (p.name.indexOf(part) >= 0) return true; p = p.parent; } return false; }
function findLayer(inst, spec, type) {
  var parts = spec.split(">"), leaf = parts[parts.length - 1], scope = parts.length > 1 ? parts[0] : null;
  var names = ALIASES[leaf] || [leaf];
  for (var i = 0; i < names.length; i++) {
    var found = inst.findOne(function (x) { return (!type || x.type === type || (type === "IMAGE" && "fills" in x)) && x.name === names[i] && (!scope || hasAncestor(x, inst, scope)); });
    if (found) return found;
  }
  return null;
}
function propKey(inst, layer) {
  var o = inst; var props = o.componentProperties || {};
  for (var k in props) if (props[k].type === "TEXT" && k.split("#")[0] === layer) return k;
  return null;
}

async function setText(inst, layer, value) {
  await preloadFonts(inst);
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
async function loadFonts(t) { var fs = fontsOf(t); for (var i = 0; i < fs.length; i++) await loadFont(fs[i]); }
function getText(inst, layer) {
  var t = findLayer(inst, layer, "TEXT");
  if (t) return t.visible ? t.characters : "";
  var pk = propKey(inst, layer); return pk ? String(inst.componentProperties[pk].value) : undefined;
}
function imageHashOf(node) { var f = node && node.fills; if (!f || f === figma.mixed) return null; for (var i = 0; i < f.length; i++) if (f[i].type === "IMAGE") return f[i].imageHash; return null; }

var imageCache = {}; // media id → hash
// "cover" crop around the CMS focal point (what the site does)
async function coverPaint(node, hash, mediaId) {
  var f = (state.data && state.data.media && state.data.media[mediaId]) || { fx: 50, fy: 50 };
  try {
    var size = await figma.getImageByHash(hash).getSizeAsync();
    var w = node.width, h = node.height, iw = size.width, ih = size.height;
    if (!w || !h || !iw || !ih) throw new Error("no size");
    var sc = Math.max(w / iw, h / ih), sw = Math.min(1, w / (iw * sc)), sh = Math.min(1, h / (ih * sc));
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
  node.fills = [await coverPaint(node, hash, mediaId)];
  return hash;
}

// write CMS values into one tagged node
async function applyFields(node, values) {
  var d = readData(node); if (!d) return [];
  d.last = d.last || {}; d.imgs = d.imgs || {};
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

// ---- read Figma state -----------------------------------------------------
function tagged(page) {
  return page.findAll(function (n) { return (n.type === "INSTANCE" || n.type === "FRAME" || n.type === "SECTION") && !!n.getSharedPluginData(NS, "sync"); });
}
function collect(page) {
  var values = {}, changed = {}, nodes = {}, byKey = {}, uploads = [];
  var all = tagged(page);
  for (var i = 0; i < all.length; i++) {
    var n = all[i], d = readData(n); if (!d) continue;
    if (d.type === "page") { if (n.name.indexOf("Mobile /") === 0) nodes[d.stagingId] = n.id; continue; }
    if (d.type === "group") { nodes["group:" + d.key] = n.id; continue; }
    if (!d.fields) continue;
    for (var j = 0; j < d.fields.length; j++) {
      var f = d.fields[j]; (byKey[f.key] = byKey[f.key] || []).push(n);
      var v;
      if (f.kind === "image") {
        var layer = findLayer(n, f.layer, "IMAGE"); var h = imageHashOf(layer); var rec = (d.imgs || {})[f.key];
        if (!h) continue;
        if (rec && rec.hash === h) v = rec.id;
        else { uploads.push({ node: n, field: f, layer: layer, hash: h }); v = "upload:" + h; }
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
    if (c.values[u.field.key] !== "upload:" + u.hash) continue; // another layer won
    if (done[u.hash]) { c.values[u.field.key] = done[u.hash]; continue; }
    log("Uploading image " + u.layer.name + " to staging …");
    var raw = await figma.getImageByHash(u.hash).getBytesAsync();
    var enc = await askUI("encode-image", { bytes: Array.from(raw) });
    var r = await api("POST", { action: "upload", name: u.node.name.split(" · ")[0] + " " + u.field.layer, mime: "image/jpeg", data: enc.base64, alt: u.node.name });
    done[u.hash] = r.id; c.values[u.field.key] = r.id;
    var d = readData(u.node); d.imgs = d.imgs || {}; d.imgs[u.field.key] = { hash: u.hash, id: r.id }; writeData(u.node, d);
  }
}

async function writeKeys(map, byKey) {
  var done = [];
  var nodes = [];
  for (var k in map) (byKey[k] || []).forEach(function (n) { if (nodes.indexOf(n) < 0) nodes.push(n); });
  for (var i = 0; i < nodes.length; i++) {
    var w = await applyFields(nodes[i], map);
    w.forEach(function (k) { if (done.indexOf(k) < 0) done.push(k); });
  }
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
async function textStyle(t, kind, size, color) {
  var fam = (await loadFont({ family: "Audi Type", style: kind })) ? "Audi Type" : "Inter";
  var style = fam === "Inter" ? (kind === "Extended Normal" ? "Bold" : "Regular") : kind;
  await loadFont({ family: fam, style: style });
  t.fontName = { family: fam, style: style }; t.fontSize = size; t.fills = color || GRAPH;
  t.lineHeight = { unit: "PERCENT", value: kind === "Extended Normal" ? 120 : 150 };
}
async function newText(parent, name, chars, kind, size, color) {
  var t = figma.createText(); parent.appendChild(t);
  await textStyle(t, kind, size, color); t.name = name; t.characters = chars;
  t.layoutSizingHorizontal = "FILL"; t.textAutoResize = "HEIGHT";
  return t;
}
async function localPage() {
  var p = figma.root.children.filter(function (x) { return x.name === "AF1 Local Modules"; })[0];
  if (!p) { p = figma.createPage(); p.name = "AF1 Local Modules"; }
  await p.loadAsync();
  return p;
}
async function localComponent(name) {
  if (localCache[name]) return localCache[name];
  var p = await localPage();
  var c = p.findOne(function (n) { return n.type === "COMPONENT" && n.name === name; });
  if (c) return (localCache[name] = c);
  c = figma.createComponent(); c.name = name; p.appendChild(c);
  c.layoutMode = "VERTICAL"; c.primaryAxisSizingMode = "AUTO"; c.counterAxisSizingMode = "FIXED"; c.resize(375, 100);
  c.paddingLeft = c.paddingRight = 24; c.itemSpacing = 16;
  c.x = p.children.length * 475; c.y = 0;
  if (name === "Free Text Mobile") {
    c.paddingTop = c.paddingBottom = 32; c.fills = GRAPH;
    await newText(c, "Copy", "Rich text from the CMS", "Wide Normal", 14, CHALK);
    c.description = "AF1 free-text block (rich text, CMS only). Built by AF1 Ktulu Sync.";
  } else if (name === "List Section Mobile") {
    c.paddingTop = c.paddingBottom = 48; c.fills = CHALK; c.itemSpacing = 12;
    await newText(c, "Headline", "Headline", "Extended Normal", 28);
    await newText(c, "Subline", "Subline", "Wide Normal", 16);
    await newText(c, "Copy", "Copy", "Wide Normal", 14, MUTED);
    for (var i = 1; i <= 6; i++) {
      var it = autoLayout("VERTICAL"); it.name = "Item " + i; c.appendChild(it); it.layoutSizingHorizontal = "FILL";
      it.paddingTop = 16; it.itemSpacing = 6; it.strokes = solid(0.878, 0.867, 0.867); it.strokeTopWeight = 1; it.strokeBottomWeight = 0; it.strokeLeftWeight = 0; it.strokeRightWeight = 0;
      await newText(it, "Item " + i + " · Label", "Label", "Extended Normal", 18);
      await newText(it, "Item " + i + " · Caption", "Caption", "Wide Normal", 14, MUTED);
    }
    c.description = "AF1 list-section block. Built by AF1 Ktulu Sync.";
  } else if (name === "iFrame Mobile") {
    c.paddingTop = c.paddingBottom = 240; c.fills = GRAPH; c.counterAxisAlignItems = "CENTER";
    await newText(c, "Label", "iFrame embed", "Extended Normal", 20, CHALK);
    await newText(c, "URL", "https://", "Wide Normal", 12, solid(0.7, 0.7, 0.7));
    c.description = "AF1 iframe-embed block (e.g. JIG AR). Built by AF1 Ktulu Sync.";
  }
  return (localCache[name] = c);
}

// ---- build ----------------------------------------------------------------
var setCache = {};
async function moduleSet(key) { if (!setCache[key]) setCache[key] = await figma.importComponentSetByKeyAsync(key); return setCache[key]; }
async function variantOf(key, variant) {
  var set = await moduleSet(key);
  return (variant && set.children.filter(function (c) { return c.name === variant; })[0]) || set.defaultVariant;
}
function valuesOf(fields) { var o = {}; fields.forEach(function (f) { o[f.key] = f.value; }); return o; }
function tagFields(fields) { return fields.map(function (f) { return { key: f.key, layer: f.layer, kind: f.kind, readonly: !!f.readonly }; }); }

async function instanceFor(def) {
  var comp;
  if (def.local) comp = await localComponent(def.local);
  else comp = await variantOf(def.key, def.variant);
  var miss = await preloadFonts(comp);
  if (miss.filter(function (m) { return m.indexOf("Audi Type Variable") < 0; }).length) throw new Error("Font not installed on this computer: " + miss.join(", "));
  return comp.createInstance();
}

async function label(parent, chars, size, style, fills, x, y, w) {
  await loadFont({ family: "Inter", style: style });
  var t = figma.createText(); parent.appendChild(t); t.fontName = { family: "Inter", style: style }; t.fontSize = size; t.characters = chars; t.fills = fills || GRAPH;
  t.x = x; t.y = y; if (w) { t.resize(w, t.height); t.textAutoResize = "HEIGHT"; }
  return t;
}

async function buildPageFrame(sec, p, x, y) {
  var modules = state.data.modules;
  var fr = autoLayout("VERTICAL"); fr.name = "Mobile / page:" + p.url; sec.appendChild(fr);
  fr.x = x; fr.y = y; fr.resize(375, 100); fr.counterAxisSizingMode = "FIXED"; fr.primaryAxisSizingMode = "AUTO"; fr.clipsContent = true;
  writeData(fr, { type: "page", url: p.url, stagingId: p.id });
  for (var i = 0; i < p.blocks.length; i++) {
    var b = p.blocks[i], def = modules[b.blockType], node;
    if (!def) { log("⚠ /" + p.url + ": no module for " + b.blockType); continue; }
    node = await instanceFor(def);
    fr.appendChild(node); node.layoutSizingHorizontal = "FILL";
    node.name = (i < 9 ? "0" : "") + (i + 1) + " " + b.blockType + (b.hidden ? " (hidden in CMS)" : "") + " · " + b.id;
    if (b.hidden) node.opacity = 0.35;
    if (b.blockType === "free-text" && b.bg && b.bg !== "graphite") { node.fills = CHALK; var ct = node.findOne(function (x) { return x.type === "TEXT"; }); if (ct) { await loadFonts(ct); ct.fills = GRAPH; } }
    writeData(node, { type: "block", pageId: p.id, blockId: b.id, blockType: b.blockType, fields: tagFields(b.fields), last: {}, imgs: {} });
    await applyFields(node, valuesOf(b.fields));
    if (b.blockType === "list-section") hideEmptyItems(node, b.fields);
  }
  await label(sec, (p.url.split("/").length > 2 ? "QR / sub page" : "Page") + " · /" + p.url, 18, "Semi Bold", MUTED, x, y - 70, 375);
  await label(sec, p.title, 24, "Bold", GRAPH, x, y - 40, 375);
  return fr;
}
function hideEmptyItems(node, fields) {
  for (var i = 1; i <= 6; i++) {
    var f = fields.filter(function (x) { return x.layer === "Item " + i + " · Label"; })[0];
    var it = node.findOne(function (x) { return x.name === "Item " + i && x.type === "FRAME"; });
    if (it) it.visible = !!(f && f.value);
  }
}

async function buildCardStates(sec, card, x, y) {
  var frames = [];
  for (var i = 0; i < card.states.length; i++) {
    var s = card.states[i];
    var comp = await variantOf(state.data.overlayKey, "State=" + s.state);
    await preloadFonts(comp);
    var inst = comp.createInstance(); sec.appendChild(inst);
    inst.x = x + i * 495; inst.y = y; inst.name = "Card · " + card.title + " · " + s.state;
    writeData(inst, { type: "card", badgeId: card.badgeId, state: s.state, fields: tagFields(s.fields), last: {}, imgs: {} });
    await applyFields(inst, valuesOf(s.fields));
    await label(sec, (i < 9 ? "0" : "") + (i + 1) + " · " + s.label, 22, "Bold", GRAPH, inst.x, y - 70, 375);
    await label(sec, s.note, 14, "Regular", MUTED, inst.x, y - 38, 375);
    frames.push(inst);
  }
  return frames;
}

function overviewSection(page) { return page.findOne(function (n) { return n.type === "SECTION" && /Flow_Overview$/.test(n.name); }); }

async function buildGroup(g, x, y) {
  var d = state.data;
  var pages = d.pages.filter(function (p) { return g.urls.indexOf(p.url) >= 0; });
  var card = d.cards.filter(function (c) { return c.group === g.key; })[0];
  var sec = figma.createSection(); sec.name = (d.campaign.name.indexOf("Singapore") >= 0 ? "SIN" : d.campaign.key.toUpperCase()) + " · " + g.title;
  sec.x = x; sec.y = y; sec.fills = CHALK;
  writeData(sec, { type: "group", key: g.key });
  try {
    var page = figma.currentPage, ov = overviewSection(page);
    var t = await label(sec, g.title, 64, "Bold", GRAPH, 200, 140);
    await label(sec, g.note || "", 24, "Regular", MUTED, 200, 240, 1600);
    if (card) await label(sec, "Team Card: " + card.title + " · Reward: " + card.rewardType, 24, "Semi Bold", LAVA, 200, 285, 1600);
    if (ov) { var back = await label(sec, "← Back to the overview", 22, "Semi Bold", LAVA, 200, 80); back.hyperlink = { type: "NODE", value: ov.id }; }
    void t;
    var px = 200, top = 480, maxH = 0;
    for (var i = 0; i < pages.length; i++) {
      log("Building /" + pages[i].url + " …");
      var fr = await buildPageFrame(sec, pages[i], px, top);
      maxH = Math.max(maxH, fr.height); px += 375 + 200;
    }
    if (card) {
      px += 200;
      await label(sec, "Team Card journey", 32, "Bold", GRAPH, px, top - 160);
      var st = await buildCardStates(sec, card, px, top);
      px += st.length * 495;
      st.forEach(function (n) { maxH = Math.max(maxH, n.height); });
    }
    sec.resizeWithoutConstraints(Math.max(px + 200, 2000), top + maxH + 300);
    return sec;
  } catch (e) { sec.remove(); throw e; }
}

// overview card titles → their activation section
async function linkOverview(page) {
  var ov = overviewSection(page); if (!ov) return 0;
  var groups = state.data.groups, n = 0, secs = {};
  page.children.forEach(function (s) { var d = s.type === "SECTION" ? readData(s) : null; if (d && d.type === "group") secs[d.key] = s; });
  var cards = ov.children.filter(function (c) { return c.type === "FRAME" && (c.name.indexOf("page:") === 0 || c.name.indexOf("hub_") === 0 || c.name.indexOf("tile_") === 0); });
  for (var i = 0; i < cards.length; i++) {
    var c = cards[i], url = c.name.indexOf("page:") === 0 ? c.name.slice(5) : null;
    var g = null;
    if (url) g = groups.filter(function (x) { return x.urls.indexOf(url) >= 0; })[0];
    else if (c.name === "hub_hero") g = groups.filter(function (x) { return x.key === "hub"; })[0];
    else if (c.name.indexOf("tile_") === 0) g = groups.filter(function (x) { return x.key === TILE[c.name]; })[0];
    if (!g || !secs[g.key]) continue;
    var texts = c.findAll(function (x) { return x.type === "TEXT"; });
    var title = texts.filter(function (x) { return x.fontName !== figma.mixed && x.fontName.style === "Bold"; })[0] || texts[0];
    if (!title) continue;
    await loadFonts(title);
    title.hyperlink = { type: "NODE", value: secs[g.key].id };
    title.textDecoration = "UNDERLINE"; n++;
  }
  return n;
}
var TILE = { tile_adidas: "adidas-drop", tile_rs5: "rs5", tile_helmets: "helmets", tile_run: "run", tile_mascot: "mascot", tile_paulaner: "paulaner", tile_livery: "livery", tile_revolut: "revolut", hub_vegas_tile: "vegas" };

async function build(keys, rebuild) {
  if (!state.data) state.data = await api("GET");
  var page = await goToCampaignPage();
  // old per-page sections from the first version
  page.children.filter(function (n) { return n.type === "SECTION" && / · \//.test(n.name); }).forEach(function (n) { n.remove(); });
  var existing = {};
  page.children.forEach(function (s) { var d = s.type === "SECTION" ? readData(s) : null; if (d && d.type === "group") existing[d.key] = s; });
  if (rebuild) keys.forEach(function (k) { if (existing[k]) { existing[k].remove(); delete existing[k]; } });
  var built = [];
  for (var i = 0; i < state.data.groups.length; i++) {
    var g = state.data.groups[i];
    if (existing[g.key] || keys.indexOf(g.key) < 0) continue;
    try { var s = await buildGroup(g, -20000, 0); built.push(s); existing[g.key] = s; }
    catch (e) { log("⚠ " + g.title + " not built: " + (e && e.message ? e.message : e)); if (/Font not installed/.test(String(e && e.message))) break; }
  }
  arrange(page, existing);
  var links = await linkOverview(page);
  if (built.length) figma.viewport.scrollAndZoomIntoView(built);
  log("Built " + built.length + " activation(s), linked " + links + " overview card(s). Recording the state …");
  await sync({});
}

// Same layout as the sitemap: left activations, hub column, right activations,
// the overview on top of the hub column.
function arrange(page, by) {
  var ov = overviewSection(page), GAP = 600;
  var cols = { left: [], center: [], right: [] };
  state.data.groups.forEach(function (g) { if (by[g.key]) cols[g.col || "center"].push(by[g.key]); });
  var w = ["left", "center", "right"].map(function (c) { return cols[c].reduce(function (m, s) { return Math.max(m, s.width); }, 0); });
  var xs = [0, w[0] + GAP, w[0] + GAP + w[1] + GAP];
  if (ov) { ov.x = xs[1] + w[1] / 2 - ov.width / 2; ov.y = 0; }
  var top = (ov ? ov.y + ov.height : 0) + 1000;
  ["left", "center", "right"].forEach(function (c, i) {
    var y = top;
    cols[c].forEach(function (s) { s.x = i === 0 ? xs[0] + w[0] - s.width : i === 1 ? xs[1] + (w[1] - s.width) / 2 : xs[2]; s.y = y; y += s.height + GAP; });
  });
}

// all image layers again from the CMS (new files, focal points / crops)
async function refreshImages() {
  state.data = await api("GET");
  var page = await goToCampaignPage(), vals = {};
  state.data.pages.forEach(function (p) { p.blocks.forEach(function (b) { b.fields.forEach(function (f) { if (f.kind === "image") vals[f.key] = f.value; }); }); });
  state.data.cards.forEach(function (c) { c.states.forEach(function (st) { st.fields.forEach(function (f) { if (f.kind === "image") vals[f.key] = f.value; }); }); });
  var all = tagged(page), n = 0;
  for (var i = 0; i < all.length; i++) {
    var d = readData(all[i]); if (!d || !d.fields) continue;
    var mine = {}; d.fields.forEach(function (f) { if (f.kind === "image" && vals[f.key]) mine[f.key] = vals[f.key]; });
    if (Object.keys(mine).length) { var w = await applyFields(all[i], mine); n += w.length; }
  }
  log("Refreshed " + n + " image(s) from the CMS.");
}

async function fixFonts() {
  var page = await goToCampaignPage(), n = 0, all = tagged(page);
  for (var i = 0; i < all.length; i++) if (all[i].type === "INSTANCE") { await preloadFonts(all[i]); n += await swapFonts(all[i]); }
  log("Swapped " + n + " text runs to the static Audi Type.");
}

// ---- actions --------------------------------------------------------------
async function check() {
  state.data = await api("GET");
  var page = await goToCampaignPage();
  var c = collect(page);
  var have = {}; page.children.forEach(function (s) { var d = s.type === "SECTION" ? readData(s) : null; if (d && d.type === "group") have[d.key] = true; });
  var missing = state.data.groups.filter(function (g) { return !have[g.key]; }).map(function (g) { return { key: g.key, title: g.title, pages: g.urls.length }; });
  var forCheck = {}; for (var k in c.values) if (String(c.values[k]).indexOf("upload:") !== 0) forCheck[k] = c.values[k];
  var pre = await api("POST", { action: "check", figma: forCheck });
  send("checked", {
    groups: state.data.groups.map(function (g) { return { key: g.key, title: g.title }; }),
    missing: missing, uploads: c.uploads.length,
    diffs: pre.diffs.filter(function (d) { return d.state !== "missing-in-figma"; }),
    inSync: pre.inSync, total: pre.total, pending: Object.keys(state.data.pending || {}).length, user: state.data.user, syncedAt: pre.syncedAt, live: state.live,
  });
  return pre;
}

async function sync(decisions, quiet) {
  if (!state.data) state.data = await api("GET");
  var page = await goToCampaignPage();
  var c = collect(page);
  var pend = state.data.pending || {};
  if (Object.keys(pend).length) {
    var w = await writeKeys(pend, c.byKey);
    await api("POST", { action: "ack", keys: Object.keys(pend) });
    if (w.length) log("Wrote " + w.length + " change(s) from the AF1 Tool into Figma.");
    c = collect(page);
  }
  if (c.uploads.length) await runUploads(c);
  var r = await api("POST", { action: "sync", figma: c.values, nodes: c.nodes, decisions: decisions || {} });
  var map = {}; r.toFigma.forEach(function (d) { map[d.key] = d.cms || ""; });
  var w2 = await writeKeys(map, c.byKey);
  if (r.toFigma.length) await api("POST", { action: "ack", keys: r.toFigma.map(function (d) { return d.key; }) });
  state.data = null;
  if (!quiet || r.toCms.length || w2.length || r.open.length) send("synced", { toCms: r.toCms.length, toFigma: w2.length, open: r.open, written: r.written, quiet: !!quiet });
  return r;
}

// live mode: while the plugin is open, sync every 20 s (conflicts stay open)
setInterval(async function () {
  if (!state.live || state.busy || !state.token) return;
  state.busy = true;
  try { var r = await sync({}, true); if (r.toCms.length || r.toFigma.length) await check(); }
  catch (e) { send("error", { msg: "Live sync: " + (e && e.message ? e.message : e) }); }
  finally { state.busy = false; }
}, 20000);

figma.ui.onmessage = async function (msg) {
  if (msg.reqId && waits[msg.reqId]) {
    var w = waits[msg.reqId]; delete waits[msg.reqId];
    if (msg.error) w.reject(new Error(msg.error)); else w.resolve(msg.result);
    return;
  }
  if (state.busy && msg.type !== "live") { send("log", { msg: "Busy, try again in a moment." }); return; }
  state.busy = true;
  try {
    if (msg.type === "init") {
      state.token = (await figma.clientStorage.getAsync("token")) || "";
      var lv = await figma.clientStorage.getAsync("live"); state.live = lv === undefined ? true : !!lv;
      send("token", { token: state.token, live: state.live });
      if (state.token) await check();
    }
    if (msg.type === "save-token") { state.token = msg.token.trim(); await figma.clientStorage.setAsync("token", state.token); await check(); }
    if (msg.type === "live") { state.live = !!msg.on; await figma.clientStorage.setAsync("live", state.live); }
    if (msg.type === "check") await check();
    if (msg.type === "sync") { await sync(msg.decisions); await check(); }
    if (msg.type === "build") { await build(msg.keys, !!msg.rebuild); await check(); }
    if (msg.type === "fix-fonts") await fixFonts();
    if (msg.type === "refresh-images") { await refreshImages(); await check(); }
  } catch (e) {
    send("error", { msg: e && e.message ? e.message : String(e) });
  } finally { state.busy = false; }
};
