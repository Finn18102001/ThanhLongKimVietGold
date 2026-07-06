/**
 * TLKVNewsEditor — wrapper around Editor.js (loaded via CDN UMD bundles).
 *
 *   Editor.js is loaded as global window objects by news.html:
 *     window.EditorJS, window.Header, window.NestedList (or List),
 *     window.Quote, window.SimpleImage / ImageTool, window.Embed,
 *     window.Delimiter, window.LinkTool, window.Marker, window.InlineCode
 *
 *  We bind the Image tool to Supabase Storage via TLKVNewsStorage.upload('content', file).
 *
 *  API:
 *    await TLKVNewsEditor.mount({ holder, data }) → { save(), destroy(), setData() }
 */
(function (global) {
  "use strict";

  function pick(names) {
    for (var i = 0; i < names.length; i++) {
      if (typeof global[names[i]] !== "undefined") return global[names[i]];
    }
    return null;
  }

  function isAllowedImageUrl(url) {
    var s = String(url || "").trim();
    if (!s) return false;
    if (/^https:\/\//i.test(s)) return true;
    if (s.indexOf("/") === 0 && s.indexOf("//") !== 0) return true;
    return false;
  }

  function textValue(v) {
    return String(v == null ? "" : v);
  }

  function hasText(v) {
    return textValue(v).replace(/<br\s*\/?>/gi, "").trim() !== "";
  }

  function normalizeListItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map(function (item) {
      if (typeof item === "string") return { content: item, items: [] };
      return {
        content: textValue(item && item.content),
        items: normalizeListItems(item && item.items),
      };
    }).filter(function (item) {
      return hasText(item.content) || (item.items && item.items.length > 0);
    });
  }

  function normalizeBlock(block) {
    if (!block || typeof block !== "object") return null;
    var type = String(block.type || "").trim();
    if (!type) return null;
    var data = block.data && typeof block.data === "object" ? block.data : {};

    if (type === "paragraph" || type === "text") {
      var paragraphText = textValue(data.text != null ? data.text : data.content);
      if (!hasText(paragraphText)) return null;
      return { type: "paragraph", data: { text: paragraphText } };
    }

    if (type === "header" || type === "heading") {
      var headerText = textValue(data.text != null ? data.text : data.content);
      if (!hasText(headerText)) return null;
      return {
        type: "header",
        data: {
          text: headerText,
          level: Math.min(4, Math.max(1, Number(data.level) || 2)),
        },
      };
    }

    if (type === "list" || type === "nestedlist" || type === "nestedList") {
      var items = normalizeListItems(data.items);
      if (!items.length) return null;
      return {
        type: "list",
        data: {
          style: data.style === "ordered" ? "ordered" : "unordered",
          items: items,
        },
      };
    }

    if (type === "quote") {
      return {
        type: "quote",
        data: {
          text: textValue(data.text),
          caption: textValue(data.caption),
          alignment: data.alignment === "center" ? "center" : "left",
        },
      };
    }

    if (type === "image") {
      var url = (data.file && data.file.url) || data.url || "";
      if (!isAllowedImageUrl(url)) return null;
      return {
        type: "image",
        data: {
          file: { url: String(url).trim() },
          caption: textValue(data.caption),
          withBorder: data.withBorder === true,
          withBackground: data.withBackground === true,
          stretched: data.stretched === true,
        },
      };
    }

    return { type: type, data: data };
  }

  function newBlockId() {
    return "blk-" + Math.random().toString(36).slice(2, 11);
  }

  function normalizeEditorData(raw) {
    var blocks = raw && Array.isArray(raw.blocks) ? raw.blocks : [];
    var normalized = blocks.map(normalizeBlock).filter(Boolean);
    return {
      time: raw && raw.time,
      blocks: normalized,
      version: (raw && raw.version) || "2.30.7",
    };
  }

  /** Normalize + assign stable ids before Editor.js hydrate (production-safe). */
  function prepareForMount(raw) {
    var data = normalizeEditorData(raw && typeof raw === "object" ? raw : { blocks: [] });
    data.blocks = (data.blocks || []).map(function (block) {
      var next = Object.assign({}, block);
      if (!next.id) next.id = newBlockId();
      return next;
    });
    return data;
  }

  function buildTools() {
    var Paragraph  = pick(["Paragraph"]);
    var Header     = pick(["Header"]);
    var List       = pick(["NestedList", "EditorJsList", "List"]);
    var Quote      = pick(["Quote"]);
    var ImageTool  = pick(["ImageTool", "SimpleImage"]);
    var Embed      = pick(["Embed"]);
    var Delimiter  = pick(["Delimiter"]);
    var LinkTool   = pick(["LinkTool"]);
    var Marker     = pick(["Marker"]);
    var InlineCode = pick(["InlineCode"]);
    var Table      = pick(["Table"]);

    var tools = {};
    if (Paragraph) {
      tools.paragraph = {
        class: Paragraph,
        inlineToolbar: true,
        config: { placeholder: "Viết nội dung…" },
      };
    }
    if (Header) {
      tools.header = {
        class: Header,
        inlineToolbar: ["link", "marker", "bold", "italic"],
        config: {
          levels: [1, 2, 3, 4],
          defaultLevel: 2,
          placeholder: "Nhập tiêu đề…",
        },
      };
    }
    if (List) {
      var listTool = {
        class: List,
        inlineToolbar: true,
        config: { defaultStyle: "unordered" },
      };
      tools.list = listTool;
      tools.nestedlist = listTool;
    }
    if (Quote) {
      tools.quote = {
        class: Quote,
        inlineToolbar: true,
        config: { quotePlaceholder: "Trích dẫn", captionPlaceholder: "Tác giả / nguồn (tuỳ chọn)" },
      };
    }
    if (Delimiter) tools.delimiter = { class: Delimiter };
    if (Embed) {
      tools.embed = {
        class: Embed,
        inlineToolbar: true,
        config: {
          services: {
            youtube: true,
            vimeo: true,
            facebook: true,
          },
        },
      };
    }
    if (Marker)     tools.marker = { class: Marker, shortcut: "CMD+SHIFT+M" };
    if (InlineCode) tools.inlineCode = { class: InlineCode };
    if (Table) tools.table = { class: Table, inlineToolbar: true, config: { rows: 2, cols: 2 } };

    if (ImageTool) {
      // ImageTool expects an uploader.uploadByFile(file) → { success:1, file:{ url } }
      tools.image = {
        class: ImageTool,
        config: {
          captionPlaceholder: "Chú thích ảnh (không bắt buộc)",
          buttonContent: "Chọn ảnh từ máy",
          uploader: {
            uploadByFile: function (file) {
              return global.TLKVNewsStorage.upload("content", file).then(function (r) {
                return { success: 1, file: { url: r.publicUrl, path: r.path } };
              }).catch(function (e) {
                return { success: 0, message: e && e.message ? e.message : "Upload thất bại" };
              });
            },
            uploadByUrl: function (url) {
              if (!isAllowedImageUrl(url)) {
                return Promise.resolve({
                  success: 0,
                  message: "URL phải bắt đầu bằng https:// hoặc / (đường dẫn tương đối).",
                });
              }
              return Promise.resolve({ success: 1, file: { url: String(url).trim() } });
            },
          },
        },
      };
    }
    return tools;
  }

  async function mount(opts) {
    if (!global.EditorJS) {
      throw new Error("Editor.js chưa được tải. Kiểm tra <script> trong news.html.");
    }
    var holder = opts && opts.holder;
    if (!holder) throw new Error("Thiếu opts.holder cho editor.");

    // Editor.js accepts either an HTMLElement or a plain ID string (no '#').
    // We resolve to an element here so we can verify existence and surface a
    // clear error if the host forgot to render the holder div.
    var holderEl = null;
    if (typeof holder === "string") {
      var idOrSel = holder.trim();
      holderEl = idOrSel.charAt(0) === "#" || idOrSel.charAt(0) === "."
        ? document.querySelector(idOrSel)
        : document.getElementById(idOrSel);
    } else if (holder && holder.nodeType === 1) {
      holderEl = holder;
    }
    if (!holderEl) throw new Error("Không tìm thấy phần tử cho editor.");

    var data = prepareForMount(opts && opts.data && typeof opts.data === "object" ? opts.data : { blocks: [] });
    var tools = buildTools();

    var editor = new global.EditorJS({
      holder: holderEl,
      tools: tools,
      data: { time: data.time || Date.now(), blocks: [], version: data.version || "2.30.7" },
      placeholder: "Bắt đầu viết bài… Nhấn “/” để chọn loại khối.",
      autofocus: false,
      minHeight: 320,
      onReady: function () {
        if (typeof opts.onReady === "function") opts.onReady();
      },
      onChange: function () {
        if (typeof opts.onChange === "function") opts.onChange();
      },
    });

    function save() {
      return editor.isReady.then(function () {
        return editor.save().then(function (output) {
          return normalizeEditorData({
            time: output.time,
            blocks: Array.isArray(output.blocks) ? output.blocks : [],
            version: output.version,
          });
        });
      });
    }

    function setData(next) {
      // The simplest cross-version path: clear + render again.
      return editor.isReady.then(function () {
        return editor.blocks.render(normalizeEditorData(next && typeof next === "object" ? next : { blocks: [] }));
      });
    }

    function destroy() {
      try { return editor.destroy(); } catch (e) { return Promise.resolve(); }
    }

    /** Insert an image block at the end of the document (used by admin sidebar uploader). */
    function insertImage(url, caption) {
      if (!isAllowedImageUrl(url)) {
        return Promise.reject(new Error("URL ảnh không hợp lệ (https:// hoặc /…)."));
      }
      return editor.isReady.then(function () {
        var data = {
          file: { url: String(url).trim() },
          caption: String(caption || ""),
          withBorder: false,
          withBackground: false,
          stretched: false,
        };
        var index = editor.blocks.getBlocksCount();
        return editor.blocks.insert("image", data, {}, index, true);
      });
    }

    await editor.isReady;
    if (data.blocks && data.blocks.length) {
      await editor.blocks.render(data);
    }
    return {
      save: save,
      setData: setData,
      destroy: destroy,
      insertImage: insertImage,
      _editor: editor,
    };
  }

  global.TLKVNewsEditor = {
    mount: mount,
    isAllowedImageUrl: isAllowedImageUrl,
    normalizeEditorData: normalizeEditorData,
    prepareForMount: prepareForMount,
  };
})(typeof window !== "undefined" ? window : globalThis);
