/**
 * TLKVNewsRenderer — JSON-block → DOM renderer.
 *
 *   Input  : { blocks: [{type:'header', data:{...}}, ...] }   (Editor.js shape)
 *   Output : a <div class="tlkv-news-article"> element you append to the page.
 *
 *  Design:
 *    - A small registry maps `type` → renderer(data, ctx) → HTMLElement.
 *    - To add a new block type, push a new entry into `RENDERERS`.
 *    - No raw HTML injection: text passes through TLKVNewsSanitize.
 *    - Unknown block types are rendered as a quiet `<!-- unsupported -->` comment
 *      (never crash the page, never leak content).
 */
(function (global) {
  "use strict";

  function s() {
    return global.TLKVNewsSanitize;
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === "class") node.className = String(v);
        else if (k === "html") node.innerHTML = String(v);
        else node.setAttribute(k, String(v));
      });
    }
    if (Array.isArray(children)) {
      children.forEach(function (c) {
        if (c == null) return;
        node.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
      });
    } else if (children != null) {
      node.appendChild(children.nodeType ? children : document.createTextNode(String(children)));
    }
    return node;
  }

  // ---------------------------------------------------------------------------
  // Individual block renderers.
  // Each returns an HTMLElement (or null to skip).
  // ---------------------------------------------------------------------------

  function HeadingBlock(data) {
    var level = Math.min(6, Math.max(1, Number(data && data.level) || 2));
    var node = document.createElement("h" + level);
    node.className = "tlkv-news-block tlkv-news-h tlkv-news-h-" + level;
    node.appendChild(s().sanitizeInline(data && data.text));
    return node;
  }

  function ParagraphBlock(data) {
    var node = document.createElement("p");
    node.className = "tlkv-news-block tlkv-news-p";
    node.appendChild(s().sanitizeInline(data && data.text));
    return node;
  }

  function ListBlock(data) {
    var style = (data && data.style) === "ordered" ? "ol" : "ul";
    var root = document.createElement(style);
    root.className = "tlkv-news-block tlkv-news-list tlkv-news-list--" + (style === "ol" ? "ordered" : "unordered");

    function buildItems(items, parent) {
      (items || []).forEach(function (item) {
        // Editor.js v2.27+ NestedList: item = { content, items: [...] }
        // Editor.js classic List:    item = "..."
        var li = document.createElement("li");
        var content = typeof item === "string" ? item : (item && item.content) || "";
        li.appendChild(s().sanitizeInline(content));
        var children = item && Array.isArray(item.items) ? item.items : null;
        if (children && children.length) {
          var sub = document.createElement(style);
          sub.className = "tlkv-news-list tlkv-news-list--nested";
          buildItems(children, sub);
          li.appendChild(sub);
        }
        parent.appendChild(li);
      });
    }
    buildItems(data && data.items, root);
    return root;
  }

  function QuoteBlock(data) {
    var fig = document.createElement("figure");
    fig.className = "tlkv-news-block tlkv-news-quote";
    var bq = document.createElement("blockquote");
    bq.appendChild(s().sanitizeInline(data && data.text));
    fig.appendChild(bq);
    var caption = (data && data.caption) || "";
    if (caption) {
      var fc = document.createElement("figcaption");
      fc.appendChild(s().sanitizeInline(caption));
      fig.appendChild(fc);
    }
    var alignment = (data && data.alignment) || "left";
    fig.setAttribute("data-align", alignment === "center" ? "center" : "left");
    return fig;
  }

  function DividerBlock() {
    var node = document.createElement("hr");
    node.className = "tlkv-news-block tlkv-news-divider";
    return node;
  }

  // SAFE image URL: must be https://, /assets/..., or supabase storage public URL.
  function isSafeImageUrl(url) {
    var s = String(url || "").trim();
    if (!s) return false;
    if (/^https:\/\//i.test(s)) return true;
    if (s.indexOf("/") === 0 && s.indexOf("//") !== 0) return true;
    return false;
  }

  function ImageBlock(data) {
    var url =
      (data && data.file && data.file.url) ||
      (data && data.url) ||
      "";
    if (!isSafeImageUrl(url)) return null;
    var caption = (data && data.caption) || "";
    var fig = document.createElement("figure");
    fig.className = "tlkv-news-block tlkv-news-image";
    if (data && data.stretched) fig.classList.add("is-stretched");
    if (data && data.withBorder) fig.classList.add("has-border");
    if (data && data.withBackground) fig.classList.add("has-bg");

    var img = document.createElement("img");
    img.src = url;
    img.alt = s().stripInline(caption);
    img.loading = "lazy";
    img.decoding = "async";
    fig.appendChild(img);
    if (caption) {
      var fc = document.createElement("figcaption");
      fc.appendChild(s().sanitizeInline(caption));
      fig.appendChild(fc);
    }
    return fig;
  }

  // Trusted embed providers — extend as needed.
  // Each maps service → function(id) → iframe src.
  var EMBED_PROVIDERS = {
    youtube: function (id) { return "https://www.youtube.com/embed/" + encodeURIComponent(id); },
    vimeo:   function (id) { return "https://player.vimeo.com/video/" + encodeURIComponent(id); },
    facebook: function (id) {
      // id is the canonical FB URL — Editor.js stores it as such for fb embeds
      return "https://www.facebook.com/plugins/video.php?href=" + encodeURIComponent(id);
    },
  };

  function EmbedBlock(data) {
    if (!data) return null;
    var service = String(data.service || "").toLowerCase();
    var embedUrl = String(data.embed || "").trim();
    if (!EMBED_PROVIDERS[service]) return null;
    if (!/^https:\/\//i.test(embedUrl)) return null;

    var wrap = document.createElement("div");
    wrap.className = "tlkv-news-block tlkv-news-embed tlkv-news-embed--" + service;
    var iframe = document.createElement("iframe");
    iframe.src = embedUrl;
    iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
    wrap.appendChild(iframe);

    var caption = data.caption || "";
    if (caption) {
      var fc = document.createElement("p");
      fc.className = "tlkv-news-embed-caption";
      fc.appendChild(s().sanitizeInline(caption));
      wrap.appendChild(fc);
    }
    return wrap;
  }

  function LinkBlock(data) {
    var link = data && data.link;
    if (!link) return null;
    var meta = (data && data.meta) || {};
    var a = document.createElement("a");
    a.className = "tlkv-news-block tlkv-news-link";
    a.href = String(link);
    a.target = "_blank";
    a.rel = "nofollow noopener noreferrer";

    var title = el("strong", { class: "tlkv-news-link__title" }, [s().sanitizeInline(meta.title || link)]);
    var desc = meta.description ? el("p", { class: "tlkv-news-link__desc" }, [s().sanitizeInline(meta.description)]) : null;
    var host = el("span", { class: "tlkv-news-link__host" }, [(function () {
      try { return new URL(link).host; } catch (e) { return ""; }
    })()]);
    a.appendChild(title);
    if (desc) a.appendChild(desc);
    a.appendChild(host);
    return a;
  }

  function TableBlock(data) {
    if (!data || !Array.isArray(data.content)) return null;
    var wrap = document.createElement("div");
    wrap.className = "tlkv-news-block tlkv-news-table-wrap";
    var t = document.createElement("table");
    t.className = "tlkv-news-table";
    var rows = data.content;
    var withHeadings = data.withHeadings === true;
    rows.forEach(function (row, rIdx) {
      var tr = document.createElement("tr");
      (row || []).forEach(function (cell) {
        var c = document.createElement(withHeadings && rIdx === 0 ? "th" : "td");
        c.appendChild(s().sanitizeInline(cell));
        tr.appendChild(c);
      });
      t.appendChild(tr);
    });
    wrap.appendChild(t);
    return wrap;
  }

  function RawBlock() {
    // Explicitly disabled: never render raw HTML supplied by the editor.
    return null;
  }

  // ---------------------------------------------------------------------------
  // Registry — single source of truth. Extend by adding to this map.
  // ---------------------------------------------------------------------------
  var RENDERERS = {
    header: HeadingBlock,
    heading: HeadingBlock,
    paragraph: ParagraphBlock,
    text: ParagraphBlock,
    list: ListBlock,
    nestedlist: ListBlock,
    quote: QuoteBlock,
    delimiter: DividerBlock,
    divider: DividerBlock,
    image: ImageBlock,
    simpleImage: ImageBlock,
    embed: EmbedBlock,
    linkTool: LinkBlock,
    link: LinkBlock,
    table: TableBlock,
    raw: RawBlock,
  };

  /**
   * Render an Editor.js JSON document to a <div class="tlkv-news-article">.
   * @param {{blocks: Array<{type:string,data:object}>} | null | undefined} doc
   * @param {{ on404?: 'skip' | 'comment' }} [opts]
   * @returns {HTMLElement}
   */
  function renderArticle(doc, opts) {
    var root = document.createElement("div");
    root.className = "tlkv-news-article";
    var blocks = (doc && Array.isArray(doc.blocks)) ? doc.blocks : [];
    var on404 = (opts && opts.on404) || "skip";

    blocks.forEach(function (b) {
      if (!b || typeof b !== "object") return;
      var type = String(b.type || "").toLowerCase();
      var fn = RENDERERS[type];
      if (!fn) {
        if (on404 === "comment") {
          root.appendChild(document.createComment(" tlkv-news: unsupported block type=" + type + " "));
        }
        return;
      }
      try {
        var node = fn(b.data || {}, { rootDoc: doc });
        if (node) root.appendChild(node);
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[TLKVNewsRenderer] render", type, "failed:", e);
      }
    });

    return root;
  }

  /** Public: register / override a renderer (e.g. add a CodeBlock later). */
  function registerBlock(type, fn) {
    if (!type || typeof fn !== "function") return;
    RENDERERS[String(type).toLowerCase()] = fn;
  }

  global.TLKVNewsRenderer = {
    renderArticle: renderArticle,
    registerBlock: registerBlock,
    _registry: RENDERERS,
  };
})(typeof window !== "undefined" ? window : globalThis);
