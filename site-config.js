/* ============================================================================
 * SITE CONFIG — the only file the site owner needs to edit.
 *
 * Replace each YOUR_… placeholder. A feature stays off while its value is
 * still a placeholder (or, for analytics, while ANALYTICS_PROVIDER is "").
 *
 * This repository is public. Do not put visitor submissions, client names,
 * or private notes in this file or anywhere else in the repo.
 * WHATSAPP_NUMBER is the public click-to-chat line and is meant to be here.
 * Enquiry messages are sent only to FORM_ENDPOINT. They are not written here.
 * ========================================================================== */
window.SITE_CONFIG = {
  // Lead form POST address.
  // Formspree: "https://formspree.io/f/xxxxxxxx"
  // Web3Forms: "https://api.web3forms.com/submit" (also set WEB3FORMS_ACCESS_KEY)
  FORM_ENDPOINT: "https://formspree.io/f/mvkzbdqq",

  // Web3Forms access key. Leave the placeholder when using Formspree.
  // This key is visible to anyone who can load the site. Restrict it to your
  // domain in the Web3Forms dashboard. It is not a private server secret.
  WEB3FORMS_ACCESS_KEY: "YOUR_WEB3FORMS_ACCESS_KEY",

  // WhatsApp click-to-chat number: country code and digits only, no plus sign.
  // +234 706 812 4363 → wa.me/2347068124363
  WHATSAPP_NUMBER: "2347068124363",

  // Privacy-friendly analytics. "" leaves analytics off (no script is loaded).
  // Use "goatcounter" or "plausible".
  ANALYTICS_PROVIDER: "",

  // GoatCounter code host, for example "abujaland.goatcounter.com".
  GOATCOUNTER_HOST: "YOUR_SITE.goatcounter.com",

  // The domain you added in Plausible, for example "username.github.io".
  PLAUSIBLE_DOMAIN: "YOUR_DOMAIN",
};
