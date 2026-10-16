// AF1 Ktulu Sync – keeps the campaign sitemap in Figma, the AF1 Tool and the
// staging CMS in the same state.
//
// Every page frame and module instance it builds carries shared plugin data
// (namespace "af1", key "sync"):
//   page frame : { type:"page",  url, stagingId }
//   module     : { type:"block", pageId, blockId, blockType, fields:[{path, layer}] }
// Text layers keep the names the design system gives them (Headline, Copy …),
// so designers edit as usual; the plugin reads them by name.

var API = "https://af1-ktulu.vercel.app/api/figma/";
var NS = "af1";
var state = { token: "", campaign: "sin", data: null };

figma.showUI(__html__, { width: 460, height: 640, themeColors: true });

function send(type, payload) { figma.ui.postMessage(Object.assign({ type: type }, payload || {})); }
function log(msg) { send("log", { msg: msg }); }
function readSync(n) { var s = n.getSharedPluginData(NS, "sync"); if (!s) return null; try { return JSON.parse(s); } catch (e) { return null; } }
function autoLayout(dir) { var f = figma.createFrame(); f.layoutMode = dir; f.primaryAxisSizingMode = "AUTO"; f.counterAxisSizingMode = "AUTO"; f.fills = []; return f; }
function fkey(pageId, blockId, path) { return pageId + "|" + blockId + "|" + path; }

async function api(method, body) {
  var url = API + encodeURIComponent(state.token) + "/" + state.campaign;
  var res = await fetch(url, { method: method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  var j = await res.json();
  if (!res.ok) throw new Error(j && j.error ? j.error : "HTTP " + res.status);
  return j;
}

async function goToCampaignPage() {
  var id = state.data && state.data.campaign && state.data.campaign.figmaPage;
  var page = id ? await figma.getNodeByIdAsync(id) : null;
  if (page && page.type === "PAGE" && figma.currentPage !== page) await figma.setCurrentPageAsync(page);
  return figma.currentPage;
}

// ---- read Figma state
function collect(page) {
  var values = {}, nodes = {}, blocks = {};
  var all = page.findAll(function (n) { return n.type === "FRAME" || n.type === "INSTANCE"; });
  for (var i = 0; i < all.length; i++) {
    var n = all[i]; var d = readSync(n); if (!d) continue;
    if (d.type === "page" && n.type === "FRAME" && n.name.indexOf("Desktop") === 0) nodes[d.stagingId] = n.id;
    if (d.type === "block") {
      blocks[d.pageId + "|" + d.blockId] = n;
      for (var f = 0; f < (d.fields || []).length; f++) {
        var fd = d.fields[f]; var t = findText(n, fd.layer);
        if (t) values[fkey(d.pageId, d.blockId, fd.path)] = t.visible ? t.characters : "";
      }
    }
  }
  return { values: values, nodes: nodes, blocks: blocks };
}

function findText(inst, layer) {
  return inst.findOne(function (x) { return x.type === "TEXT" && x.name === layer; });
}

async function loadFonts(t) {
  var segs = t.getStyledTextSegments(["fontName"]);
  for (var i = 0; i < segs.length; i++) await figma.loadFontAsync(segs[i].fontName);
}

// Text bound to a component property is set through the owning instance.
async function setText(inst, layer, value) {
  var t = findText(inst, layer);
  if (!t) return false;
  var ref = t.componentPropertyReferences && t.componentPropertyReferences.characters;
  if (ref) {
    var owner = t.parent;
    while (owner && !(owner.type === "INSTANCE" && owner.componentProperties && owner.componentProperties[ref])) owner = owner.parent;
    if (owner) { var o = {}; o[ref] = value === "" ? " " : value; owner.setProperties(o); }
  } else {
    await loadFonts(t);
    t.characters = value === "" ? " " : value;
  }
  t.visible = value !== "";
  return true;
}

async function writeFields(map, blocks) {
  var done = [], missed = [];
  for (var k in map) {
    var parts = k.split("|"); var inst = blocks[parts[0] + "|" + parts[1]];
    if (!inst) { missed.push(k); continue; }
    var d = readSync(inst); var fd = (d.fields || []).filter(function (f) { return f.path === parts[2]; })[0];
    if (fd && await setText(inst, fd.layer, map[k])) done.push(k); else missed.push(k);
  }
  return { done: done, missed: missed };
}

// ---- build a page frame from the CMS
var setCache = {};
async function moduleSet(key) {
  if (!setCache[key]) setCache[key] = await figma.importComponentSetByKeyAsync(key);
  return setCache[key];
}

async function placeholder(block) {
  await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
  var f = autoLayout("VERTICAL");
  f.paddingTop = f.paddingBottom = 40; f.paddingLeft = f.paddingRight = 80; f.itemSpacing = 8;
  f.fills = [{ type: "SOLID", color: { r: 0.88, g: 0.867, b: 0.867 } }];
  var t = figma.createText(); t.fontName = { family: "Inter", style: "Semi Bold" }; t.fontSize = 20;
  t.characters = block.blockType + " · not in the module library yet"; f.appendChild(t);
  return f;
}

async function buildPage(p, modules, x, y) {
  var sec = figma.createSection(); sec.name = "SIN · /" + p.url; sec.x = x; sec.y = y;
  sec.fills = [{ type: "SOLID", color: { r: 0.96, g: 0.949, b: 0.949 } }];
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  var h = figma.createText(); h.fontName = { family: "Inter", style: "Bold" }; h.fontSize = 40; h.characters = p.title + "  ·  /" + p.url; sec.appendChild(h); h.x = 200; h.y = 160;
  var fr = autoLayout("VERTICAL"); fr.name = "Desktop / page:" + p.url; sec.appendChild(fr);
  fr.x = 200; fr.y = 280; fr.resize(1440, 100); fr.counterAxisSizingMode = "FIXED"; fr.primaryAxisSizingMode = "AUTO";
  fr.setSharedPluginData(NS, "sync", JSON.stringify({ type: "page", url: p.url, stagingId: p.id }));
  for (var i = 0; i < p.blocks.length; i++) {
    var b = p.blocks[i]; var m = modules[b.blockType]; var node;
    if (m) {
      var set = await moduleSet(m.key);
      var v = (m.variant && set.children.filter(function (c) { return c.name === m.variant; })[0]) || set.defaultVariant;
      node = v.createInstance();
    } else node = await placeholder(b);
    fr.appendChild(node); node.layoutSizingHorizontal = "FILL";
    node.name = (i < 9 ? "0" : "") + (i + 1) + " " + b.blockType + (b.hidden ? " (hidden in CMS)" : "") + " · " + b.id;
    if (b.hidden) node.opacity = 0.35;
    if (node.type === "INSTANCE") {
      node.setSharedPluginData(NS, "sync", JSON.stringify({ type: "block", pageId: p.id, blockId: b.id, blockType: b.blockType, fields: b.fields.map(function (f) { return { path: f.path, layer: f.layer }; }) }));
      for (var j = 0; j < b.fields.length; j++) { try { await setText(node, b.fields[j].layer, b.fields[j].value); } catch (e) { log("⚠ " + p.url + " " + b.fields[j].layer + ": " + e.message); } }
    }
  }
  sec.resizeWithoutConstraints(1840, fr.height + 480);
  return { section: sec, frame: fr };
}

// ---- actions
async function check() {
  state.data = await api("GET");
  var page = await goToCampaignPage();
  var c = collect(page);
  var missing = state.data.pages.filter(function (p) { return !c.nodes[p.id]; }).map(function (p) { return { id: p.id, url: p.url, title: p.title }; });
  var pre = await api("POST", { action: "check", figma: c.values });
  send("checked", { pages: state.data.pages.length, missing: missing, diffs: pre.diffs.filter(function (d) { return d.state !== "missing-in-figma"; }), inSync: pre.inSync, total: pre.total, pending: Object.keys(state.data.pending || {}).length, user: state.data.user, syncedAt: pre.syncedAt });
}

async function sync(decisions) {
  if (!state.data) state.data = await api("GET");
  var page = await goToCampaignPage();
  var c = collect(page);
  // 1. changes decided in the AF1 Tool (CMS → Figma) first
  var pend = state.data.pending || {};
  if (Object.keys(pend).length) {
    var w = await writeFields(pend, c.blocks);
    await api("POST", { action: "ack", keys: w.done });
    log("Wrote " + w.done.length + " change(s) from the AF1 Tool into Figma.");
    c = collect(page);
  }
  // 2. compare, push Figma-newer to staging
  var r = await api("POST", { action: "sync", figma: c.values, nodes: c.nodes, decisions: decisions || {} });
  // 3. CMS-newer into Figma
  var map = {}; r.toFigma.forEach(function (d) { map[d.key] = d.cms || ""; });
  var w2 = await writeFields(map, c.blocks);
  if (w2.done.length) await api("POST", { action: "ack", keys: w2.done });
  state.data = null;
  send("synced", { toCms: r.toCms.length, toFigma: w2.done.length, open: r.open, written: r.written });
}

async function build(ids) {
  if (!state.data) state.data = await api("GET");
  var page = await goToCampaignPage();
  var maxX = 0, baseY = 3000;
  page.children.forEach(function (n) { if (n.y >= baseY - 10) maxX = Math.max(maxX, n.x + n.width); });
  var x = maxX ? maxX + 200 : 0, built = [], frames = [];
  var list = state.data.pages.filter(function (p) { return ids.indexOf(p.id) >= 0; });
  for (var i = 0; i < list.length; i++) {
    log("Building /" + list[i].url + " …");
    var r = await buildPage(list[i], state.data.modules, x, baseY);
    x += r.section.width + 200; built.push(r.frame.id); frames.push(r.section);
  }
  if (frames.length) figma.viewport.scrollAndZoomIntoView(frames);
  log("Built " + built.length + " page(s). Running a sync to record them …");
  await sync({});
}

figma.ui.onmessage = async function (msg) {
  try {
    if (msg.type === "init") {
      state.token = (await figma.clientStorage.getAsync("token")) || "";
      send("token", { token: state.token });
      if (state.token) await check();
    }
    if (msg.type === "save-token") { state.token = msg.token.trim(); await figma.clientStorage.setAsync("token", state.token); await check(); }
    if (msg.type === "check") await check();
    if (msg.type === "sync") { await sync(msg.decisions); await check(); }
    if (msg.type === "build") { await build(msg.ids); await check(); }
  } catch (e) {
    send("error", { msg: e && e.message ? e.message : String(e) });
  }
};
