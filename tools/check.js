/* Redbot — controlli automatici del sito
 *
 *   node tools/check.js
 *
 * Un sito di presentazione non ha una fisica da verificare, quindi qui si
 * controlla quello che rotola davvero: che le chiavi esistano in entrambe le
 * lingue, che nessun file referenziato manchi, che non ci sia una richiesta di
 * rete, e che l'HTML sia coerente con quello che lo stile promette.
 *
 * Costa poco e trova subito le cose che non si vedono: una chiaveenglish
 * dimenticata in una delle due lingue stampa letteralmente "hero.lead" in
 * mezzo all'eroe, e su una pagina di studio quello è il difetto che fa
 * scappare gente.
 */
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let checks = 0;
let fails = 0;

function ok(cond, msg) {
  checks++;
  if (!cond) {
    fails++;
    console.log("  ! " + msg);
  }
}

function head(name) {
  console.log("=== " + name + " ===");
}

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "assets/style.css"), "utf8");
const site = fs.readFileSync(path.join(ROOT, "assets/site.js"), "utf8");

/* ---------------- 1. chiavi di traduzione ---------------- */

function checkI18n() {
  head("chiavi di traduzione");
  const sandbox = { console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "assets/i18n.js"), "utf8"), sandbox,
                  { filename: "i18n.js" });
  const D = sandbox.REDBOT_I18N;

  // Il `\b` serve: senza, `closest(".stage")` sembra una chiamata a t().
  const used = new Set([
    ...[...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/data-i18n-placeholder="([^"]+)"/g)].map((m) => m[1]),
    ...[...site.matchAll(/\bt\("([^"]+)"\)/g)].map((m) => m[1]),
  ]);

  for (const lang of ["it", "en"]) {
    for (const k of used) ok(k in D[lang], lang + ": chiave mancante \"" + k + "\"");
    for (const k of Object.keys(D[lang])) {
      ok(used.has(k), lang + ": chiave definita e mai usata \"" + k + "\"");
    }
  }
  ok(Object.keys(D.it).length === Object.keys(D.en).length,
     "it ed en devono avere lo stesso numero di chiavi");
  console.log("  " + used.size + " chiavi in uso, it ed en allineate");
}

/* ---------------- 2. file serviti ---------------- */

function checkFiles() {
  head("file serviti");
  const refs = [...html.matchAll(/(?:src|href)="(?!https?:|mailto:|#)([^"]+)"/g)].map((m) => m[1]);
  for (const r of new Set(refs)) {
    ok(fs.existsSync(path.join(ROOT, r)), "riferimento rotto: " + r);
  }
  console.log("  " + new Set(refs).size + " file referenziati, tutti presenti");
}

/* ---------------- 3. nessuna richiesta di rete ---------------- */

function checkOffline() {
  head("nessuna richiesta di rete");
  const cssRefs = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/["']/g, ""));
  for (const u of cssRefs) {
    ok(!/^https?:/i.test(u), "il CSS carica una risorsa remota: " + u);
    if (!/^data:/.test(u)) ok(fs.existsSync(path.join(ROOT, "assets", u)), "url() rotta: " + u);
  }
  // Link a pagine esterne sono legittimi (non sono risorse), ma non devono
  // essere immagini, font o script: quelli caricherebbero la pagina.
  const ext = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1]);
  for (const u of ext) {
    ok(!/\.(css|js|woff2?|ttf|otf|png|jpe?g|gif|webp|svg)(\?|$)/i.test(u),
       "risorsa esterna, non dovrebbe esserci: " + u);
  }
  ok(!/@import/i.test(css), "il CSS non deve usare @import");
  console.log("  " + (cssRefs.length + ext.length) + " riferimenti esterni, nessuno é una risorsa");
}

/* ---------------- 4. HTML coerente ---------------- */

function checkMarkup() {
  head("markup");
  const need = ['lang="it"', 'name="viewport"', 'name="description"', 'rel="icon"'];
  for (const n of need) ok(html.includes(n), "manca in <head>: " + n);

  // Ogni sezione collegata dalla testata deve esistere davvero: un link a
  // un'ancora inesistente su un sito di studio e' un vicolo cieco.
  const anchors = [...html.matchAll(/href="#([\w-]+)"/g)].map((m) => m[1]);
  for (const a of new Set(anchors)) {
    ok(new RegExp('id="' + a + '"').test(html), "ancora rotta: #" + a);
  }

  // Le sezioni non devono restare senza traduzione: è la verifica che non
  // lascia in pagina un pezzo di italiano accanto a un pezzo di inglese.
  const cards = (html.match(/class="card/g) || []).length;
  const titled = (html.match(/data-i18n="(verb|pillar|feat)\.\d\.t"|data-i18n="verb\.\w+"/g) || []).length;
  ok(titled >= cards, "ci sono card senza intestazione tradotta (" + titled + "/" + cards + ")");

  // La classe che lo stile usa per l'illuminazione deve esistere anche nel CSS,
  // altrimenti l'animazione si dichiara e non parte.
  ok(/class="[^"]*cone-lit/.test(html), "manca la classe cone-lit nella key art");
  ok(/\.cone-lit\s*{/.test(css), "manca la regola .cone-lit nel CSS");
  ok(/@keyframes breathe/.test(css), "manca l'animazione breathe");
  ok(/\.reveal\s*{/.test(css) && /\.reveal\.in/.test(css), "manca lo stile dei rivelamenti");
  ok(/prefers-reduced-motion/.test(css), "manca il blocco prefers-reduced-motion");

  // Non deve restare un solo pezzo della versione precedente.
  for (const gone of ["<canvas", "stealth.js", "level.js", "RedbotScene", "RedbotLOS"]) {
    ok(!html.includes(gone), "residuo della versione precedente in index.html: " + gone);
  }
  for (const gone of ["canvas", "stealth.js", "level.js"]) {
    ok(!fs.existsSync(path.join(ROOT, gone)) && !fs.existsSync(path.join(ROOT, "assets", gone)),
       "file della replica ancora presente: " + gone);
  }
  ok(!/\.js$/.test(css.replace(/[\s\S]*?\*\//g, "")), "il CSS non deve referenziare script");
  console.log("  " + anchors.length + " ancore, " + cards + " card, nessun residuo della replica");
}

/* ---------------- 5. deploy ---------------- */

function checkDeploy() {
  head("deploy");
  ok(fs.existsSync(path.join(ROOT, "CNAME")), "manca CNAME");
  const cname = fs.readFileSync(path.join(ROOT, "CNAME"), "utf8").trim();
  ok(cname === "redbot.kairodev.it", "il CNAME deve dire redbot.kairodev.it, dice: " + cname);
  ok(fs.existsSync(path.join(ROOT, "404.html")), "manca 404.html");
  ok(fs.existsSync(path.join(ROOT, ".nojekyll")), "manca .nojekyll");
  ok(fs.existsSync(path.join(ROOT, "README.md")), "manca README.md con le istruzioni di deploy");
  console.log("  CNAME, 404, .nojekyll e README presenti");
}

/* ---------------- esecuzione ---------------- */

checkI18n();
checkFiles();
checkOffline();
checkMarkup();
checkDeploy();

console.log("---");
if (fails) {
  console.log("FALLITO (" + checks + " controlli, " + fails + " problemi)");
  process.exit(1);
}
console.log("OK (" + checks + " controlli, 0 problemi)");
