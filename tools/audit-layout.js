/* Audit di layout di redbot-site via Chrome DevTools Protocol.
 *
 *   node tools/audit-layout.js [url] [larghezza]
 *
 * Non serve a fare le cose belle: serve a trovare i difetti che si vedono solo
 * dopo che il browser ha messo in pagina. Il CSS puo' essere valido e il
 * risultato essere rotto lo stesso, per tre motivi:
 *
 *   - overflow orizzontale (una griglia che non entra, una word che non va in
 *     a capo, una sezione larga piu' del viewport);
 *   - elementi sovrapposti, perche' un'absolute posizionata male copre il
 *     testo sotto;
 *   - testo tagliato, cioe' un contenitore con overflow hidden piu' piccolo
 *     del suo contenuto.
 *
 * E un quarto, che e' quello che fa fallire una pagina per meta' dei visitatori
 * su telefono: la barra di scorrimento orizzontale.
 *
 * Non si aprono finestre e non si fanno screenshot: si chiede al browser le
 * misure e si guarda se tornano.
 */
"use strict";

const url = process.argv[2] || "http://127.0.0.1:8733/";
const width = parseInt(process.argv[3] || "1440", 10);
const height = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* --- CDP minimale: basta un WebSocket e un contatore di id --- */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.waiting = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      const slot = this.waiting.get(msg.id);
      if (slot) {
        this.waiting.delete(msg.id);
        if (msg.error) slot.reject(new Error(msg.error.message));
        else slot.resolve(msg.result);
      }
    });
  }
  static async attach(port) {
    let targets = null;
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/json/list`);
        targets = await r.json();
        if (targets.some((t) => t.type === "page" && t.webSocketDebuggerUrl)) break;
      } catch (e) { /* Chrome non è ancora in ascolto */ }
      await sleep(150);
    }
    if (!targets) throw new Error("Chrome non ha aperto la porta di debug");
    const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", rej, { once: true });
    });
    return new CDP(ws);
  }
  send(method, params) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    return new Promise((resolve, reject) => this.waiting.set(id, { resolve, reject }));
  }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error("eccezione nella pagina: " +
        (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result.value;
  }
}

/* --- la misurazione, eseguita dentro la pagina --- */
const PROBE = `(function () {
  const vw = window.innerWidth, vh = window.innerHeight;
  const out = {
    vw, vh,
    docScrollW: document.documentElement.scrollWidth,
    docScrollH: document.documentElement.scrollHeight,
    lang: document.documentElement.lang,
    title: document.title,
    overflow: [],
    clipped: [],
    overlaps: [],
    tiny: [],
    invisible: [],
    sections: [],
  };

  const label = (el) => {
    const bits = [el.tagName.toLowerCase()];
    if (el.id) bits.push('#' + el.id);
    if (el.className && typeof el.className === 'string') {
      bits.push('.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.'));
    }
    const t = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 28);
    if (t) bits.push('"' + t + '"');
    return bits.join(' ');
  };

  const all = document.body.querySelectorAll('*');

  // 1. overflow orizzontale: la pagina non deve scorrere di lato
  if (out.docScrollW > vw + 1) {
    for (const el of [document.documentElement, document.body, ...all]) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.right > vw + 1 || r.left < -1) {
        out.overflow.push({ el: label(el), left: Math.round(r.left), right: Math.round(r.right) });
      }
    }
  }

  // 2. testo tagliato: contenitore piu' piccolo del proprio contenuto
  for (const el of all) {
    if (el.children.length) continue;
    const txt = (el.textContent || '').trim();
    if (!txt) continue;
    const cs = getComputedStyle(el);
    if (cs.overflow === 'hidden' || cs.overflowX === 'hidden') {
      if (el.scrollWidth > el.clientWidth + 1) {
        out.clipped.push({ el: label(el), scrollW: el.scrollWidth, clientW: el.clientWidth });
      }
    }
  }

  // 3. sovrapposizioni fra blocchi testuali di sezioni diverse
  const texts = [...all].filter((el) => {
    if (el.children.length) return false;
    if (!(el.textContent || '').trim()) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 2 && oy > 2) {
        out.overlaps.push({ a: label(a), b: label(b),
                            area: Math.round(ox * oy) });
      }
    }
  }

  // 4. testo piccolo: sotto i 10px non si legge, e su telefono si legge peggio
  for (const el of texts) {
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 10) out.tiny.push({ el: label(el), size: fs });
  }

  // 5. testo presente ma invisibile per un colore di sfondo sbagliato
  for (const el of texts) {
    const cs = getComputedStyle(el);
    if (parseFloat(cs.opacity) < 0.05 || cs.visibility === 'hidden' || cs.display === 'none') {
      out.invisible.push({ el: label(el) });
    }
  }

  // 6. sezioni: altezza e dove iniziano
  for (const s of document.querySelectorAll('header, main > section, footer')) {
    const r = s.getBoundingClientRect();
    out.sections.push({
      id: s.id || s.tagName.toLowerCase(),
      top: Math.round(r.top + window.scrollY),
      h: Math.round(r.height),
    });
  }

  return out;
})()`;

async function main() {
  const port = 9333;
  const cdp = await CDP.attach(port);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: width < 700,
  });

  let problems = 0;
  const note = (n) => { problems++; console.log("  ! " + n); };

  for (const lang of ["it", "en"]) {
    console.log("=== " + width + "px · " + lang.toUpperCase() + " ===");
    await cdp.send("Page.navigate", { url });
    await sleep(900);

    // applica la lingua come farebbe un visitatore, poi ri-misura
    await cdp.eval(`(function(){
      const b = document.querySelector('.lang button[data-lang="${lang}"]');
      if (b) b.click();
      // i rivelamenti si accendono solo allo scroll: per l'audit li forziamo
      document.querySelectorAll('.reveal').forEach(e => e.classList.add('in'));
      return true;
    })()`);
    // I rivelamenti hanno una transizione: misurare mentre un elemento e' a
    // meta' del percorso dà numeri che non esistono. Si aspetta che finiscano.
    await sleep(900);

    const r = await cdp.eval(PROBE);
    console.log("  lingua=" + r.lang + "  documento=" + r.docScrollW + "x" + r.docScrollH);
    if (r.title) console.log("  title: " + r.title.slice(0, 60));

    if (r.docScrollW > width + 1) {
      note("overflow orizzontale: documento " + r.docScrollW + "px su viewport " + width + "px");
      for (const o of r.overflow.slice(0, 6)) console.log("      " + o.el);
    } else {
      console.log("  nessun overflow orizzontale");
    }

    if (r.clipped.length) {
      note("testo tagliato: " + r.clipped.length);
      for (const c of r.clipped.slice(0, 6)) console.log("      " + c.el + " (" + c.scrollW + ">" + c.clientW + ")");
    } else console.log("  nessun testo tagliato");

    if (r.overlaps.length) {
      note("elementi sovrapposti: " + r.overlaps.length);
      for (const o of r.overlaps.slice(0, 6)) console.log("      " + o.a + "  ×  " + o.b);
    } else console.log("  nessuna sovrapposizione");

    if (r.tiny.length) {
      note("testo sotto i 10px: " + r.tiny.length);
      for (const t of r.tiny.slice(0, 6)) console.log("      " + t.el + " (" + t.size + "px)");
    } else console.log("  nessun testo illeggibile");

    if (r.invisible.length) {
      note("testo presente ma invisibile: " + r.invisible.length);
      for (const t of r.invisible.slice(0, 6)) console.log("      " + t.el);
    } else console.log("  nessun testo nascosto");

    const empty = r.sections.filter((s) => s.h < 40);
    if (empty.length) {
      note("sezioni con altezza insufficiente: " + empty.map((s) => s.id).join(", "));
    }
    console.log("  sezioni: " + r.sections.map((s) => s.id + "@" + s.top + "+" + s.h).join("  "));
    console.log("");
  }

  console.log("---");
  console.log(problems
    ? "PROBLEMI (" + problems + ")"
    : "OK, layout pulito a " + width + "px in entrambe le lingue");
  process.exit(problems ? 1 : 0);
}

main().catch((e) => { console.error("audit fallito: " + e.message); process.exit(2); });