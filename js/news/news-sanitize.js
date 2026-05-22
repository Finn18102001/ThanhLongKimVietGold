/**
 * TLKVNewsSanitize — tiny, dependency-free HTML sanitizer for Editor.js inline marks.
 *
 *  Editor.js stores `paragraph.data.text` (and `header.data.text`, etc.) as a string
 *  that contains a small set of inline HTML produced by the editor itself:
 *      <b>, <strong>, <i>, <em>, <u>, <mark>, <code>, <a href="…">, <br>
 *
 *  Anything else is treated as untrusted text. We never inject raw user HTML into
 *  the DOM: we parse the string, walk an allow-list, and rebuild safe elements.
 *
 *  Why not DOMPurify? — we keep the public site dependency-free (already true today),
 *  and our allow-list is short enough to implement in <120 lines, audited in one file.
 */
(function (global) {
  "use strict";

  var ALLOWED_TAGS = {
    B: true, STRONG: true,
    I: true, EM: true,
    U: true,
    MARK: true,
    CODE: true,
    BR: true,
    A: true,
    SPAN: true, // Editor.js wraps marker tool / inline code in spans sometimes
  };

  // For <a>: allow only http(s), mailto, tel + relative `/...` URLs.
  function safeHref(href) {
    var s = String(href || "").trim();
    if (!s) return null;
    if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
    if (s.charAt(0) === "/" && s.charAt(1) !== "/") return s; // same-origin
    return null;
  }

  function copyAllowedAttrs(srcEl, dstEl) {
    if (srcEl.nodeName === "A") {
      var href = safeHref(srcEl.getAttribute("href"));
      if (href) dstEl.setAttribute("href", href);
      dstEl.setAttribute("rel", "nofollow noopener noreferrer");
      dstEl.setAttribute("target", "_blank");
    }
    if (srcEl.nodeName === "SPAN") {
      var cls = String(srcEl.getAttribute("class") || "");
      // Editor.js Marker tool emits class="cdx-marker"; keep that single token.
      if (/(^|\s)cdx-marker(\s|$)/.test(cls)) dstEl.setAttribute("class", "cdx-marker");
      var inlineCode = /(^|\s)inline-code(\s|$)/.test(cls);
      if (inlineCode) dstEl.setAttribute("class", "inline-code");
    }
  }

  function walk(node, out) {
    if (!node) return;
    var childNodes = node.childNodes;
    for (var i = 0; i < childNodes.length; i++) {
      var c = childNodes[i];
      if (c.nodeType === 3 /* TEXT */) {
        out.appendChild(document.createTextNode(c.nodeValue));
        continue;
      }
      if (c.nodeType !== 1) continue;
      var name = c.nodeName;
      if (!ALLOWED_TAGS[name]) {
        // strip the tag, keep its children
        walk(c, out);
        continue;
      }
      var fresh = document.createElement(name);
      copyAllowedAttrs(c, fresh);
      walk(c, fresh);
      out.appendChild(fresh);
    }
  }

  /**
   * Sanitize an HTML fragment string into a safe DocumentFragment.
   * @param {string} html
   * @returns {DocumentFragment}
   */
  function sanitizeInline(html) {
    var frag = document.createDocumentFragment();
    var raw = String(html == null ? "" : html);
    var tpl = document.createElement("template");
    tpl.innerHTML = raw;
    walk(tpl.content, frag);
    return frag;
  }

  /**
   * Escape a plain string for use as text content (no inline HTML allowed).
   * @param {string} s
   * @returns {string}
   */
  function escapeText(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function stripInline(html) {
    var raw = String(html == null ? "" : html);
    var tpl = document.createElement("template");
    tpl.innerHTML = raw;
    return (tpl.content.textContent || "").replace(/\s+/g, " ").trim();
  }

  global.TLKVNewsSanitize = {
    sanitizeInline: sanitizeInline,
    escapeText: escapeText,
    stripInline: stripInline,
  };
})(typeof window !== "undefined" ? window : globalThis);
