const assert = require("assert");
const fs = require("fs");
const path = require("path");
const site = require("../site.js");

const window = {};
eval(fs.readFileSync(path.join(__dirname, "../site-config.js"), "utf8"));
const live = site.normalizeConfig(window.SITE_CONFIG);
assert.strictEqual(live.formEndpoint, "https://formspree.io/f/mvkzbdqq");
assert.strictEqual(live.formReady, true);
assert.strictEqual(live.web3forms, false);

const placeholders = site.normalizeConfig({
  FORM_ENDPOINT: "https://formspree.io/f/YOUR_FORM_ID",
  WEB3FORMS_ACCESS_KEY: "YOUR_WEB3FORMS_ACCESS_KEY",
  WHATSAPP_NUMBER: "YOUR_NUMBER",
  ANALYTICS_PROVIDER: "",
  GOATCOUNTER_HOST: "YOUR_SITE.goatcounter.com",
  PLAUSIBLE_DOMAIN: "YOUR_DOMAIN",
});
assert.strictEqual(placeholders.formReady, false);
assert.strictEqual(placeholders.formEndpoint, "");
assert.strictEqual(placeholders.whatsappNumber, "");
assert.strictEqual(placeholders.analyticsProvider, "");

const formspree = site.normalizeConfig({
  FORM_ENDPOINT: "https://formspree.io/f/abcdwxyz",
  WEB3FORMS_ACCESS_KEY: "YOUR_WEB3FORMS_ACCESS_KEY",
  WHATSAPP_NUMBER: "2348012345678",
  ANALYTICS_PROVIDER: "GoatCounter",
  GOATCOUNTER_HOST: "abujaland.goatcounter.com",
});
assert.strictEqual(formspree.formReady, true);
assert.strictEqual(formspree.web3forms, false);
assert.strictEqual(formspree.web3formsAccessKey, "");
assert.strictEqual(formspree.whatsappNumber, "2348012345678");
assert.strictEqual(formspree.analyticsProvider, "goatcounter");

const web3 = site.normalizeConfig({
  FORM_ENDPOINT: "https://api.web3forms.com/submit",
  WEB3FORMS_ACCESS_KEY: "YOUR_WEB3FORMS_ACCESS_KEY",
});
assert.strictEqual(web3.formReady, false, "Web3Forms stays off without a real access key");
const web3on = site.normalizeConfig({
  FORM_ENDPOINT: "https://api.web3forms.com/submit",
  WEB3FORMS_ACCESS_KEY: "public-key",
});
assert.strictEqual(web3on.formReady, true);
assert.strictEqual(web3on.web3formsAccessKey, "public-key");

assert.strictEqual(site.normalizeConfig({ FORM_ENDPOINT: "http://formspree.io/f/abcdwxyz" }).formReady, false);
assert.strictEqual(site.normalizeConfig({ FORM_ENDPOINT: "javascript:alert(1)" }).formEndpoint, "");
assert.strictEqual(site.normalizeConfig({ ANALYTICS_PROVIDER: "plausible", PLAUSIBLE_DOMAIN: "YOUR_DOMAIN" }).analyticsProvider, "");
assert.strictEqual(site.normalizeConfig({ ANALYTICS_PROVIDER: "plausible", PLAUSIBLE_DOMAIN: "example.github.io" }).plausibleDomain, "example.github.io");
assert.strictEqual(site.digits("00000000"), "");
assert.strictEqual(site.digits("234"), "");

const href = site.whatsappHref("2348012345678", "Lugbe Phase 30 estate", "dashboard");
assert.ok(href.startsWith("https://wa.me/2348012345678?text="));
assert.ok(decodeURIComponent(href).includes("Lugbe Phase 30 estate"));
assert.ok(decodeURIComponent(href).includes("Abuja Estate Land Scan"));
assert.ok(decodeURIComponent(site.whatsappHref("2348012345678", "", "studio")).includes("Plot-to-Home Studio"));
assert.strictEqual(site.whatsappHref("YOUR_NUMBER", "Somewhere", "dashboard"), "");
assert.strictEqual(site.safeEstate("buyer@example.com"), "");
assert.strictEqual(site.safeEstate("08031234567"), "");

const fields = {
  name: "Test Name",
  phone: "+234 801 234 5678",
  email: "buyer@example.com",
  estate: "Example estate",
  budget: "Under ₦10 million",
  buyer_type: "diaspora",
};
const payload = site.buildPayload(fields, web3on);
assert.deepStrictEqual(Object.keys(payload).sort(), ["access_key", "botcheck", "budget", "buyer_type", "consent", "email", "estate", "name", "phone", "subject"]);
assert.strictEqual(payload.consent, "yes");
assert.strictEqual(payload.access_key, "public-key");
assert.ok(!("company" in payload));
assert.ok(!("_replyto" in payload));
const formspreePayload = site.buildPayload(fields, formspree);
assert.deepStrictEqual(Object.keys(formspreePayload).sort(), ["_gotcha", "_replyto", "_subject", "budget", "buyer_type", "consent", "email", "estate", "name", "phone"]);
assert.ok(!("access_key" in formspreePayload));

assert.strictEqual(site.publicSourceUrl("https://nigeriapropertycentre.com/for-sale/land"), "https://nigeriapropertycentre.com/for-sale/land");
assert.strictEqual(site.publicSourceUrl("https://ng.linkedin.com/in/someone"), "");
assert.strictEqual(site.publicSourceUrl("https://www.linkedin.com/pub/someone"), "");
assert.strictEqual(site.publicSourceUrl("https://facebook.com/profile.php?id=1"), "");
assert.strictEqual(site.publicSourceUrl("javascript:alert(1)"), "");

console.log("site-widgets tests passed");
