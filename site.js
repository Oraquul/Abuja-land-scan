/* Enquiry form, WhatsApp button and optional analytics.
   Submissions are posted only to the configured endpoint. This file never
   writes visitor details to localStorage, cookies, or the repository. */
(function (root) {
  "use strict";

  var BUYER_TYPES = [
    ["local", "Local buyer"],
    ["diaspora", "Diaspora buyer"],
    ["developer", "Developer"],
  ];
  var BUDGETS = [
    "Under ₦10 million",
    "₦10–25 million",
    "₦25–50 million",
    "₦50–100 million",
    "₦100 million and above",
    "Not stated",
  ];
  var PLACEHOLDER = /YOUR_|PLACEHOLDER|change-?me/i;

  function configured(value) {
    var s = String(value == null ? "" : value).trim();
    if (!s || PLACEHOLDER.test(s)) return "";
    return s;
  }

  function httpsUrl(value) {
    var s = configured(value);
    if (!s) return "";
    try {
      var u = new URL(s);
      if (u.protocol !== "https:") return "";
      return u.toString();
    } catch (e) {
      return "";
    }
  }

  function hostName(value) {
    var s = configured(value).replace(/^https?:\/\//, "").split("/")[0].trim();
    if (!s || !/^[a-z0-9.-]+$/i.test(s) || s.indexOf(".") === -1) return "";
    return s.toLowerCase();
  }

  function normalizeConfig(raw) {
    raw = raw || {};
    var endpoint = httpsUrl(raw.FORM_ENDPOINT);
    var accessKey = configured(raw.WEB3FORMS_ACCESS_KEY);
    var provider = configured(raw.ANALYTICS_PROVIDER).toLowerCase();
    var web3forms = /web3forms\.com$/i.test(endpointHost(endpoint));
    if (provider !== "goatcounter" && provider !== "plausible") provider = "";
    var goatHost = provider === "goatcounter" ? hostName(raw.GOATCOUNTER_HOST) : "";
    var plausibleDomain = provider === "plausible" ? hostName(raw.PLAUSIBLE_DOMAIN) : "";
    if (provider === "goatcounter" && !goatHost) provider = "";
    if (provider === "plausible" && !plausibleDomain) provider = "";
    return {
      formEndpoint: endpoint,
      web3forms: web3forms,
      web3formsAccessKey: web3forms ? accessKey : "",
      formReady: Boolean(endpoint) && (!web3forms || Boolean(accessKey)),
      whatsappNumber: digits(raw.WHATSAPP_NUMBER),
      analyticsProvider: provider,
      goatcounterHost: goatHost,
      plausibleDomain: plausibleDomain,
    };
  }

  function endpointHost(endpoint) {
    if (!endpoint) return "";
    try { return new URL(endpoint).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
  }

  function digits(value) {
    var s = configured(value);
    if (!s) return "";
    var n = s.replace(/\D/g, "");
    if (n.length < 8 || n.length > 15) return "";
    if (/^0+$/.test(n)) return "";
    return n;
  }

  function safeEstate(value) {
    var s = String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, 80);
    if (!s || s.indexOf("@") !== -1) return "";
    if (/^\+?\d[\d\s-]{6,}$/.test(s)) return "";
    return s;
  }

  function whatsappHref(number, estate, page) {
    var n = digits(number);
    if (!n) return "";
    var where = page === "studio" ? "Plot-to-Home Studio" : "Abuja Estate Land Scan";
    var place = safeEstate(estate);
    var text = place
      ? "Hello, I am looking at " + place + " on the " + where + " and would like to ask a few questions."
      : "Hello, I am on the " + where + " and would like to ask a few questions.";
    return "https://wa.me/" + n + "?text=" + encodeURIComponent(text);
  }

  function publicSourceUrl(url) {
    var raw = String(url == null ? "" : url).trim();
    if (!raw) return "";
    var u;
    try { u = new URL(raw); } catch (e) { return ""; }
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    var host = u.hostname.toLowerCase().replace(/^www\./, "");
    var path = u.pathname.toLowerCase();
    var linkedin = host === "linkedin.com" || host.slice(-13) === ".linkedin.com";
    if (linkedin && (path.indexOf("/in/") === 0 || path.indexOf("/pub/") === 0)) return "";
    var facebook = host === "facebook.com" || host.slice(-13) === ".facebook.com";
    if (facebook && (path.indexOf("/profile.php") === 0 || path.indexOf("/people/") === 0)) return "";
    return raw;
  }

  function clip(value, max) {
    return String(value == null ? "" : value).trim().slice(0, max);
  }

  function buildPayload(fields, cfg) {
    var estate = clip(fields.estate, 160);
    var payload = {
      name: clip(fields.name, 120),
      phone: clip(fields.phone, 40),
      email: clip(fields.email, 160),
      estate: estate,
      budget: fields.budget,
      buyer_type: fields.buyer_type,
      consent: "yes",
    };
    if (cfg && cfg.web3forms) {
      payload.access_key = cfg.web3formsAccessKey;
      payload.subject = "Estate enquiry: " + estate;
      payload.botcheck = "";
    } else {
      payload._subject = "Estate enquiry: " + estate;
      payload._replyto = payload.email;
      payload._gotcha = "";
    }
    return payload;
  }

  function allowedBudget(value) {
    return BUDGETS.indexOf(value) !== -1;
  }

  function allowedBuyer(value) {
    for (var i = 0; i < BUYER_TYPES.length; i++) if (BUYER_TYPES[i][0] === value) return true;
    return false;
  }

  var api = {
    BUYER_TYPES: BUYER_TYPES,
    BUDGETS: BUDGETS,
    normalizeConfig: normalizeConfig,
    whatsappHref: whatsappHref,
    publicSourceUrl: publicSourceUrl,
    safeEstate: safeEstate,
    buildPayload: buildPayload,
    allowedBudget: allowedBudget,
    allowedBuyer: allowedBuyer,
    digits: digits,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  var cfg = normalizeConfig(root.SITE_CONFIG);
  var viewedEstate = "";
  var analyticsMode = cfg.analyticsProvider || "off";
  var pending = [];
  var booted = false;

  function sendGoat(item) {
    var path = "/event/" + String(item.name || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    root.goatcounter.count({
      path: path || "/event/event",
      title: item.estate ? item.name + ": " + item.estate : item.name,
      event: true,
    });
  }

  function sendPlausible(item) {
    if (item.estate) root.plausible(item.name, { props: { estate: item.estate } });
    else root.plausible(item.name);
  }

  function flush() {
    if (!pending.length) return;
    var goatReady = analyticsMode === "goatcounter" && root.goatcounter && typeof root.goatcounter.count === "function";
    var plausibleReady = analyticsMode === "plausible" && typeof root.plausible === "function";
    if (!goatReady && !plausibleReady) return;
    var batch = pending.splice(0, pending.length);
    for (var i = 0; i < batch.length; i++) {
      if (analyticsMode === "goatcounter") sendGoat(batch[i]);
      else sendPlausible(batch[i]);
    }
  }

  function track(name, props) {
    if (analyticsMode !== "goatcounter" && analyticsMode !== "plausible") return;
    var item = { name: clip(name, 40), estate: safeEstate(props && props.estate) };
    if (analyticsMode === "plausible" && typeof root.plausible === "function") sendPlausible(item);
    else if (analyticsMode === "goatcounter" && root.goatcounter && typeof root.goatcounter.count === "function") sendGoat(item);
    else pending.push(item);
  }

  function updateWhatsApp() {
    var link = document.getElementById("site-wa");
    if (!link) return;
    var href = whatsappHref(cfg.whatsappNumber, viewedEstate, document.body.getAttribute("data-site-page"));
    if (!href) {
      link.hidden = true;
      return;
    }
    link.href = href;
    link.hidden = false;
    var place = safeEstate(viewedEstate);
    link.setAttribute("aria-label", place ? "Chat on WhatsApp about " + place : "Chat on WhatsApp");
  }

  function mountWhatsApp() {
    if (document.getElementById("site-wa")) return;
    var href = whatsappHref(cfg.whatsappNumber, "", document.body.getAttribute("data-site-page"));
    if (!href) return;
    var a = document.createElement("a");
    a.id = "site-wa";
    a.className = "site-wa";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.href = href;
    a.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.04 2C6.58 2 2.15 6.4 2.15 11.83c0 1.74.46 3.44 1.34 4.94L2 22l5.39-1.4a10 10 0 0 0 4.65 1.18h.01c5.46 0 9.89-4.4 9.89-9.83C21.94 6.4 17.5 2 12.04 2zm5.76 14.15c-.24.68-1.4 1.3-1.94 1.38-.5.07-1.12.1-1.81-.11-.41-.13-.95-.31-1.64-.61-2.88-1.24-4.76-4.14-4.9-4.33-.14-.19-1.16-1.54-1.16-2.94s.73-2.08 1-2.37c.24-.28.64-.41 1.02-.41h.37c.3 0 .44.02.64.5.24.58.82 2 .89 2.15.07.14.12.32.02.51-.09.19-.14.31-.28.48-.14.16-.29.37-.42.49-.14.14-.28.29-.12.56.16.27.71 1.17 1.52 1.9 1.05.93 1.93 1.22 2.2 1.36.28.14.44.12.6-.07.16-.19.69-.8.87-1.08.19-.27.37-.23.62-.14.26.09 1.62.76 1.9.9.28.14.46.21.53.32.07.12.07.68-.17 1.36z"/></svg><span class="site-wa-label">WhatsApp</span>';
    a.addEventListener("click", function () {
      track("WhatsApp click", { estate: viewedEstate });
    });
    document.body.appendChild(a);
    document.documentElement.setAttribute("data-wa", "on");
    updateWhatsApp();
  }

  function option(value, label) {
    var o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    return o;
  }

  function field(id, labelText, control) {
    var wrap = document.createElement("label");
    wrap.htmlFor = id;
    wrap.appendChild(document.createTextNode(labelText));
    control.id = id;
    wrap.appendChild(control);
    return wrap;
  }

  function mountForm() {
    var host = document.getElementById("site-lead");
    if (!host || host.dataset.ready === "1") return;
    host.dataset.ready = "1";
    host.innerHTML = "";
    var section = host;
    section.classList.add("site-lead");
    var h = document.createElement("h2");
    h.id = "enquire-title";
    h.textContent = "Ask about an estate";
    var intro = document.createElement("p");
    intro.className = "site-intro";
    intro.textContent = cfg.formReady
      ? "Leave a way to reach you about the estate you are viewing. The message is sent to the form service for this site and is not saved in the public website files."
      : "The enquiry form is on this page, but it is not accepting messages until the site operator turns it on.";
    var form = document.createElement("form");
    form.className = "site-form";
    form.noValidate = true;
    form.setAttribute("aria-labelledby", "enquire-title");
    var grid = document.createElement("div");
    grid.className = "site-grid";

    var name = document.createElement("input");
    name.name = "name";
    name.autocomplete = "name";
    name.required = true;
    name.maxLength = 120;
    grid.appendChild(field("lead-name", "Name", name));

    var phone = document.createElement("input");
    phone.name = "phone";
    phone.type = "tel";
    phone.autocomplete = "tel";
    phone.inputMode = "tel";
    phone.required = true;
    phone.maxLength = 40;
    phone.spellcheck = false;
    grid.appendChild(field("lead-phone", "Phone or WhatsApp", phone));

    var email = document.createElement("input");
    email.name = "email";
    email.type = "email";
    email.autocomplete = "email";
    email.required = true;
    email.maxLength = 160;
    email.spellcheck = false;
    grid.appendChild(field("lead-email", "Email", email));

    var estate = document.createElement("input");
    estate.name = "estate";
    estate.required = true;
    estate.maxLength = 160;
    estate.setAttribute("list", "lead-estates");
    estate.autocomplete = "off";
    grid.appendChild(field("lead-estate", "Estate of interest", estate));

    var budget = document.createElement("select");
    budget.name = "budget";
    budget.required = true;
    budget.appendChild(option("", "Select a budget"));
    for (var b = 0; b < BUDGETS.length; b++) budget.appendChild(option(BUDGETS[b], BUDGETS[b]));
    grid.appendChild(field("lead-budget", "Budget", budget));

    var buyer = document.createElement("select");
    buyer.name = "buyer_type";
    buyer.required = true;
    buyer.appendChild(option("", "Select buyer type"));
    for (var t = 0; t < BUYER_TYPES.length; t++) buyer.appendChild(option(BUYER_TYPES[t][0], BUYER_TYPES[t][1]));
    grid.appendChild(field("lead-buyer", "Buyer type", buyer));

    var list = document.createElement("datalist");
    list.id = "lead-estates";
    var hp = document.createElement("div");
    hp.className = "site-hp";
    hp.setAttribute("aria-hidden", "true");
    var hpLabel = document.createElement("label");
    hpLabel.textContent = "Company";
    hpLabel.htmlFor = "lead-company";
    var hpInput = document.createElement("input");
    hpInput.id = "lead-company";
    hpInput.name = "company";
    hpInput.tabIndex = -1;
    hpInput.autocomplete = "off";
    hp.appendChild(hpLabel);
    hp.appendChild(hpInput);

    var check = document.createElement("p");
    check.className = "site-check";
    var consent = document.createElement("input");
    consent.type = "checkbox";
    consent.id = "lead-consent";
    consent.name = "consent";
    consent.required = true;
    var consentLabel = document.createElement("label");
    consentLabel.htmlFor = "lead-consent";
    consentLabel.textContent = "I agree that these details may be used to reply to this enquiry.";
    check.appendChild(consent);
    check.appendChild(consentLabel);

    var fine = document.createElement("p");
    fine.className = "site-fine";
    fine.innerHTML = 'Prices are public asking prices. Titles are seller-claimed and unverified. This is not legal advice. Read the <a href="privacy.html">disclaimer and privacy notice</a>.';

    var button = document.createElement("button");
    button.className = "site-submit";
    button.type = "submit";
    button.textContent = "Send enquiry";

    var status = document.createElement("p");
    status.className = "site-status";
    status.id = "lead-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    form.appendChild(grid);
    form.appendChild(list);
    form.appendChild(hp);
    form.appendChild(check);
    form.appendChild(fine);
    form.appendChild(button);
    form.appendChild(status);
    section.appendChild(h);
    section.appendChild(intro);
    section.appendChild(form);
    if (!section.id) section.id = "enquire";

    if (viewedEstate) estate.value = viewedEstate;
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      sendForm(form, status, button);
    });
  }

  function formFields(form) {
    return {
      name: form.name.value,
      phone: form.phone.value,
      email: form.email.value,
      estate: form.estate.value,
      budget: form.budget.value,
      buyer_type: form.buyer_type.value,
      consent: form.consent.checked,
      company: form.company.value,
    };
  }

  function problems(fields) {
    var missing = [];
    if (!clip(fields.name, 120)) missing.push("your name");
    var phoneDigits = String(fields.phone || "").replace(/\D/g, "");
    if (phoneDigits.length < 7 || phoneDigits.length > 15) missing.push("a phone or WhatsApp number");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clip(fields.email, 160))) missing.push("a valid email");
    if (!clip(fields.estate, 160)) missing.push("the estate of interest");
    if (!allowedBudget(fields.budget)) missing.push("a budget");
    if (!allowedBuyer(fields.buyer_type)) missing.push("a buyer type");
    if (!fields.consent) missing.push("consent");
    return missing;
  }

  function setStatus(node, state, text) {
    node.dataset.state = state;
    node.textContent = text;
  }

  async function sendForm(form, status, button) {
    form.classList.add("site-tried");
    var fields = formFields(form);
    if (clip(fields.company, 80)) {
      form.reset();
      setStatus(status, "ok", "Enquiry sent. Nothing was stored in this website's files.");
      return;
    }
    var missing = problems(fields);
    if (missing.length) {
      setStatus(status, "err", "Add " + missing.join(", ") + ".");
      return;
    }
    if (!cfg.formReady) {
      setStatus(status, "err", "This form is not accepting messages yet.");
      return;
    }
    button.disabled = true;
    var previous = button.textContent;
    button.textContent = "Sending…";
    setStatus(status, "", "");
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 20000);
    try {
      var res = await fetch(cfg.formEndpoint, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(fields, cfg)),
        signal: ctrl.signal,
      });
      var data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      if (!res.ok || (data && (data.ok === false || data.success === false))) {
        setStatus(status, "err", res.status === 422 ? "The form service rejected the message. Check the fields and try again." : "The enquiry could not be sent. Try again in a moment.");
        return;
      }
      track("Form submit", { estate: fields.estate });
      form.reset();
      var estateInput = document.getElementById("lead-estate");
      if (estateInput && viewedEstate) estateInput.value = viewedEstate;
      setStatus(status, "ok", "Enquiry sent. Nothing was stored in this website's files.");
    } catch (err) {
      setStatus(status, "err", err && err.name === "AbortError" ? "The form service did not respond. Try again in a moment." : "The enquiry could not be sent. Try again in a moment.");
    } finally {
      clearTimeout(timer);
      button.disabled = false;
      button.textContent = previous;
    }
  }

  function fillEstates() {
    var list = document.getElementById("lead-estates");
    if (!list || !root.dash || typeof root.dash.data !== "function") return;
    var pack = root.dash.data("estates");
    if (!pack || pack.status !== "ok" || !pack.data) return;
    var names = [];
    for (var i = 0; i < pack.data.length; i++) if (pack.data[i].name) names.push(pack.data[i].name);
    names.sort(function (a, b) { return a.localeCompare(b); });
    list.replaceChildren.apply(list, names.map(function (n) {
      var o = document.createElement("option");
      o.value = n;
      return o;
    }));
  }

  function loadAnalytics() {
    if (analyticsMode === "plausible") {
      root.plausible = root.plausible || function () {
        (root.plausible.q = root.plausible.q || []).push(arguments);
      };
      var p = document.createElement("script");
      p.defer = true;
      p.dataset.domain = cfg.plausibleDomain;
      p.src = "https://plausible.io/js/script.js";
      document.head.appendChild(p);
      return;
    }
    if (analyticsMode === "goatcounter") {
      var g = document.createElement("script");
      g.async = true;
      g.src = "https://gc.zgo.at/count.js";
      g.dataset.goatcounter = "https://" + cfg.goatcounterHost + "/count";
      g.addEventListener("load", flush);
      document.head.appendChild(g);
    }
  }

  function setEstate(name) {
    var next = String(name == null ? "" : name).trim();
    var input = document.getElementById("lead-estate");
    if (input && (input.value.trim() === "" || input.value.trim() === viewedEstate)) input.value = next;
    viewedEstate = next;
    updateWhatsApp();
  }

  function start() {
    if (booted) return;
    booted = true;
    mountForm();
    mountWhatsApp();
    loadAnalytics();
    var estateField = document.getElementById("f-estate");
    if (estateField) {
      setEstate(estateField.value);
      estateField.addEventListener("input", function () { setEstate(estateField.value); });
    }
    var jump = document.getElementById("openEnquire");
    if (jump) {
      jump.addEventListener("click", function () {
        var step = document.querySelector('.step[data-p="summary"]');
        if (step) step.click();
        var target = document.getElementById("enquire");
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        var name = document.getElementById("lead-name");
        if (name) name.focus();
      });
    }
    document.addEventListener("sa-loaded", fillEstates);
    fillEstates();
  }

  root.siteTrack = track;
  root.siteSetEstate = setEstate;
  root.sitePublicSourceUrl = publicSourceUrl;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})(typeof window !== "undefined" ? window : globalThis);
