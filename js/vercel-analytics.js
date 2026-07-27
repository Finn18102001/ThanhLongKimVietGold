/**
 * Vercel Web Analytics for multi-page HTML (Express site on Vercel).
 * Enable Web Analytics in the Vercel project dashboard, then deploy.
 * Script `/_vercel/insights/script.js` only exists on Vercel — skip local/dev
 * hosts so DevTools stays clean (404 MIME errors on localhost).
 * @see https://vercel.com/docs/analytics/quickstart
 */
(function () {
  var host = String((location && location.hostname) || "");
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host.endsWith(".local")
  ) {
    return;
  }

  window.va =
    window.va ||
    function () {
      (window.vaq = window.vaq || []).push(arguments);
    };
  var s = document.createElement("script");
  s.defer = true;
  s.src = "/_vercel/insights/script.js";
  document.head.appendChild(s);
})();
