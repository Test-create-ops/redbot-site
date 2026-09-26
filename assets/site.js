/* Redbot — comportamento della pagina
 *
 * Tre cose, tutte piccole: le lingue, la testata che si comprime quando si
 * scorre, e i rivelamenti allo scroll che si spengono sotto
 * prefers-reduced-motion.
 *
 * Niente canvas, niente simulazione: questo e' un sito di presentazione. Il
 * gioco si racconta con la key art e con le parole, non con una ricostruzione
 * della stanza — che sarebbe un facsimile, cioe' una cosa piu' brutta sia del
 * gioco sia del sito.
 */
(function () {
  "use strict";

  var I18N = window.REDBOT_I18N;
  var STORE_KEY = "redbot.lang";

  function t(key) {
    var lang = document.documentElement.lang || "it";
    var dict = I18N[lang] || I18N.it;
    if (!(key in dict)) {
      // Una chiave mancante deve essere rumorosa in console, non invisibile
      // in pagina: se non si vede in sviluppo, in produzione non si vede
      // nemmeno che il testo e' sparito.
      if (window.console) console.warn("[redbot] chiave mancante: " + key);
      return key;
    }
    return dict[key];
  }

  function applyLang(lang) {
    document.documentElement.lang = lang;
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      el.textContent = t(el.getAttribute("data-i18n"));
    }
    var placeholders = document.querySelectorAll("[data-i18n-placeholder]");
    for (var p = 0; p < placeholders.length; p++) {
      placeholders[p].placeholder = t(placeholders[p].getAttribute("data-i18n-placeholder"));
    }
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", t("meta.desc"));
    document.title = t("meta.title");
    var btns = document.querySelectorAll(".lang button");
    for (var b = 0; b < btns.length; b++) {
      btns[b].setAttribute("aria-pressed", String(btns[b].dataset.lang === lang));
    }
    try { localStorage.setItem(STORE_KEY, lang); } catch (e) { /* niente */ }
  }

  function initLang() {
    var saved = null;
    try { saved = localStorage.getItem(STORE_KEY); } catch (e) { /* niente */ }
    if (!saved) saved = (navigator.language || "it").slice(0, 2) === "it" ? "it" : "en";
    applyLang(saved);
    var btns = document.querySelectorAll(".lang button");
    for (var i = 0; i < btns.length; i++) {
      (function (lang) {
        btns[i].addEventListener("click", function () { applyLang(lang); });
      })(btns[i].dataset.lang);
    }
  }

  // La testata prende un bordo quando non si e' piu' in cima: da' un segnale
  // che la pagina e' lunga, senza aggiungere un elemento.
  function initHeader() {
    var header = document.querySelector("header");
    if (!header) return;
    var solid = function () { header.classList.toggle("is-solid", window.scrollY > 8); };
    window.addEventListener("scroll", solid, { passive: true });
    solid();
  }

  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!items.length) return;
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      for (var i = 0; i < items.length; i++) items[i].classList.add("in");
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          entries[i].target.classList.add("in");
          io.unobserve(entries[i].target);
        }
      }
    }, { threshold: 0.12 });
    for (var j = 0; j < items.length; j++) io.observe(items[j]);
  }

  function initEmailJS() {
    var PUBLIC_KEY = "USER_PUBLIC_KEY";
    try { emailjs.init(PUBLIC_KEY); } catch (e) { /* EmailJS non disponibile */ }
    var form = document.getElementById("contact-form");
    var msg = document.getElementById("contact-msg");
    if (!form || !msg) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      emailjs.sendForm("USER_SERVICE_ID", "USER_TEMPLATE_ID", form)
        .then(function () {
          msg.textContent = t("contact.success");
          msg.style.color = "var(--relic)";
          form.reset();
        })
        .catch(function () {
          msg.textContent = t("contact.error");
          msg.style.color = "var(--alert)";
        });
    });
  }

  function boot() {
    initLang();
    initHeader();
    initReveal();
    initEmailJS();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
