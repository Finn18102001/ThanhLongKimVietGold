(function () {
  /** @type {import("@supabase/supabase-js").SupabaseClient | null} */
  var sb = null;
  var adminAuthed = false;
  var currentTab = "gold";
  var goldHistSearchTimer = null;
  var productHistSearchTimer = null;
  /** Các id dòng đang sửa inline (có thể nhiều dòng cùng lúc). */
  var goldInlineEditRowIds = Object.create(null);

  function goldInlineEditHasAny() {
    return Object.keys(goldInlineEditRowIds).length > 0;
  }

  var GOLD_ACTION_LABELS = {
    meta_update: "Cập nhật meta bảng giá",
    row_insert: "Thêm dòng giá",
    row_update: "Sửa dòng giá",
    row_delete: "Xóa dòng giá",
  };

  var PRODUCT_ACTION_LABELS = {
    product_insert: "Thêm sản phẩm",
    product_update: "Sửa sản phẩm",
    product_delete: "Xóa sản phẩm",
  };

  function $(id) {
    return document.getElementById(id);
  }

  function showLogin() {
    $("login-panel").hidden = false;
    $("admin-panel").hidden = true;
  }

  function showAdmin() {
    $("login-panel").hidden = true;
    $("admin-panel").hidden = false;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  /** Snapshot tối giản cho audit / so sánh trên web (payload.before | .after). */
  function snapshotGoldAuditRow(r) {
    if (!r || typeof r !== "object") return {};
    return {
      id: r.id,
      brand: String(r.brand || ""),
      product: String(r.product || ""),
      purity: String(r.purity || ""),
      buy: String(r.buy || ""),
      sell: String(r.sell || ""),
      metal: r.metal === "silver" ? "silver" : "gold",
      highlight: r.highlight === true,
    };
  }

  function normGoldCell(s) {
    return String(s == null ? "" : s).trim();
  }

  function dispGoldCell(s) {
    var t = normGoldCell(s);
    return t === "" ? "(trống)" : t;
  }

  function goldCellEq(a, b, key) {
    return normGoldCell(a[key]) === normGoldCell(b[key]);
  }

  /** Mô tả thay đổi nhiều dòng: Giá bán … → …, xuống dòng Giá mua … */
  function buildGoldRowChangeSummary(oldR, newR) {
    if (!oldR || !newR) return "";
    var parts = [];
    function add(label, key) {
      if (goldCellEq(oldR, newR, key)) return;
      parts.push(label + " " + dispGoldCell(oldR[key]) + " → " + dispGoldCell(newR[key]));
    }
    add("Giá bán:", "sell");
    add("Giá mua:", "buy");
    add("Hàm lượng:", "purity");
    add("Sản phẩm:", "product");
    add("Thương hiệu:", "brand");
    if (normGoldCell(oldR.metal) !== normGoldCell(newR.metal)) {
      parts.push("Loại: " + dispGoldCell(oldR.metal) + " → " + dispGoldCell(newR.metal));
    }
    var oh = !!oldR.highlight;
    var nh = !!newR.highlight;
    if (oh !== nh) {
      parts.push("Nền xanh: " + (oh ? "bật" : "tắt") + " → " + (nh ? "bật" : "tắt"));
    }
    if (!parts.length) return "Không đổi giá trị.";
    return parts.join("\n");
  }

  function buildGoldRowInsertSummary(r) {
    var s = snapshotGoldAuditRow(r);
    var lines = ["Thêm dòng"];
    if (normGoldCell(s.brand)) lines.push("Thương hiệu: " + dispGoldCell(s.brand));
    if (normGoldCell(s.product)) lines.push("Sản phẩm: " + dispGoldCell(s.product));
    if (normGoldCell(s.purity)) lines.push("Hàm lượng: " + dispGoldCell(s.purity));
    if (normGoldCell(s.buy)) lines.push("Giá mua: " + dispGoldCell(s.buy));
    if (normGoldCell(s.sell)) lines.push("Giá bán: " + dispGoldCell(s.sell));
    lines.push("Loại: " + (s.metal === "silver" ? "bạc" : "vàng"));
    return lines.join("\n");
  }

  function buildGoldRowDeleteSummary(r) {
    var s = snapshotGoldAuditRow(r);
    var lines = ["Xóa dòng"];
    lines.push("Thương hiệu: " + dispGoldCell(s.brand));
    lines.push("Sản phẩm: " + dispGoldCell(s.product));
    lines.push("Hàm lượng: " + dispGoldCell(s.purity));
    lines.push("Giá mua: " + dispGoldCell(s.buy));
    lines.push("Giá bán: " + dispGoldCell(s.sell));
    lines.push("Loại: " + (s.metal === "silver" ? "bạc" : "vàng"));
    return lines.join("\n");
  }

  function formatSummaryHtml(summary) {
    var s = summary == null || summary === "" ? "—" : String(summary);
    return escapeHtml(s).replace(/\r\n|\r|\n/g, "<br>");
  }

  function showAdminToast(message) {
    var host = $("admin-toast-host");
    if (!host) return;
    var t = document.createElement("div");
    t.className = "admin-toast";
    t.textContent = message;
    host.appendChild(t);
    setTimeout(function () {
      t.style.opacity = "0";
      t.style.transition = "opacity 0.28s ease";
      setTimeout(function () {
        t.remove();
      }, 280);
    }, 3400);
  }

  function formatHistoryTime(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      return d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    } catch (_) {
      return String(iso);
    }
  }

  function renderHistoryTable(tbody, rows, labelMap) {
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!rows || !rows.length) {
      var tr = document.createElement("tr");
      tr.innerHTML = "<td colspan=\"5\" class=\"admin-empty-hint\">Chưa có bản ghi (hoặc chưa chạy SQL tạo bảng / chưa có thao tác).</td>";
      tbody.appendChild(tr);
      return;
    }
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      var act = r.action || "";
      var actLabel = labelMap[act] || act;
      tr.innerHTML =
        "<td>" +
        escapeHtml(formatHistoryTime(r.created_at)) +
        "</td><td>" +
        escapeHtml(actLabel) +
        "</td><td>" +
        escapeHtml(r.entity_name || "") +
        "</td><td>" +
        escapeHtml(r.entity_id || "—") +
        '</td><td class="admin-history-cell-summary">' +
        formatSummaryHtml(r.summary) +
        "</td>";
      tbody.appendChild(tr);
    });
  }

  function switchTab(tab) {
    currentTab = tab === "products" ? "products" : "gold";
    var goldPanel = $("admin-tab-gold");
    var prodPanel = $("admin-tab-products");
    var btnG = $("tab-btn-gold");
    var btnP = $("tab-btn-products");
    var title = $("admin-page-title");

    if (goldPanel) {
      goldPanel.hidden = currentTab !== "gold";
      goldPanel.classList.toggle("admin-tab-panel--hidden", currentTab !== "gold");
    }
    if (prodPanel) {
      prodPanel.hidden = currentTab !== "products";
      prodPanel.classList.toggle("admin-tab-panel--hidden", currentTab !== "products");
    }
    if (btnG) {
      btnG.classList.toggle("admin-tab--active", currentTab === "gold");
      btnG.setAttribute("aria-selected", currentTab === "gold" ? "true" : "false");
    }
    if (btnP) {
      btnP.classList.toggle("admin-tab--active", currentTab === "products");
      btnP.setAttribute("aria-selected", currentTab === "products" ? "true" : "false");
    }
    if (title) {
      title.textContent = currentTab === "products" ? "Quản lý sản phẩm" : "Quản lý giá vàng";
    }

    if (currentTab === "gold") refreshGoldHistory();
    else refreshProductHistory();
  }

  function refreshGoldHistory() {
    var tb = $("gold-history-rows");
    if (!tb) return;
    if (!sb || !window.TLKVAudit) {
      tb.innerHTML =
        "<tr><td colspan=\"5\" class=\"admin-empty-hint\">Chưa đăng nhập hoặc thiếu module lịch sử.</td></tr>";
      return;
    }
    var nameEl = $("gold-hist-search");
    var dateEl = $("gold-hist-date");
    var name = nameEl ? nameEl.value : "";
    var dateStr = dateEl ? dateEl.value : "";
    tb.innerHTML = "<tr><td colspan=\"5\" class=\"admin-empty-hint\">Đang tải…</td></tr>";
    window.TLKVAudit
      .fetchGoldLog(sb, { searchName: name, dateStr: dateStr, limit: 200 })
      .then(function (rows) {
        renderHistoryTable(tb, rows, GOLD_ACTION_LABELS);
      })
      .catch(function (err) {
        console.error(err);
        tb.innerHTML =
          "<tr><td colspan=\"5\">Không tải được lịch sử: " +
          escapeHtml(err && err.message ? err.message : String(err)) +
          "</td></tr>";
      });
  }

  function refreshProductHistory() {
    var tb = $("product-history-rows");
    if (!tb) return;
    if (!sb || !window.TLKVAudit) {
      tb.innerHTML =
        "<tr><td colspan=\"5\" class=\"admin-empty-hint\">Chưa đăng nhập hoặc thiếu module lịch sử.</td></tr>";
      return;
    }
    var nameEl = $("product-hist-search");
    var dateEl = $("product-hist-date");
    var name = nameEl ? nameEl.value : "";
    var dateStr = dateEl ? dateEl.value : "";
    tb.innerHTML = "<tr><td colspan=\"5\" class=\"admin-empty-hint\">Đang tải…</td></tr>";
    window.TLKVAudit
      .fetchProductLog(sb, { searchName: name, dateStr: dateStr, limit: 200 })
      .then(function (rows) {
        renderHistoryTable(tb, rows, PRODUCT_ACTION_LABELS);
      })
      .catch(function (err) {
        console.error(err);
        tb.innerHTML =
          "<tr><td colspan=\"5\">Không tải được lịch sử: " +
          escapeHtml(err && err.message ? err.message : String(err)) +
          "</td></tr>";
      });
  }

  function debounceGoldHistory() {
    if (goldHistSearchTimer) clearTimeout(goldHistSearchTimer);
    goldHistSearchTimer = setTimeout(function () {
      goldHistSearchTimer = null;
      if (adminAuthed && currentTab === "gold") refreshGoldHistory();
    }, 420);
  }

  function debounceProductHistory() {
    if (productHistSearchTimer) clearTimeout(productHistSearchTimer);
    productHistSearchTimer = setTimeout(function () {
      productHistSearchTimer = null;
      if (adminAuthed && currentTab === "products") refreshProductHistory();
    }, 420);
  }

  function setGoldThayDoiVisible(show) {
    var b = $("btn-gold-thay-doi");
    if (!b) return;
    b.hidden = !show;
  }

  function clearGoldInlineEdit() {
    goldInlineEditRowIds = Object.create(null);
    setGoldThayDoiVisible(false);
  }

  function stampMetaOnPayload(d) {
    if (!window.TLKVGold || !d) return d;
    d.meta = window.TLKVGold.stampMetaWithVietnamNow(d.meta || {});
    return d;
  }

  function findGoldRowTr(tbody, rowId) {
    if (!tbody) return null;
    var trs = tbody.getElementsByTagName("tr");
    for (var i = 0; i < trs.length; i++) {
      if (trs[i].getAttribute("data-row-id") === rowId) return trs[i];
    }
    return null;
  }

  function commitGoldInlineEdit() {
    if (!window.TLKVGold) return;
    if (!goldInlineEditHasAny()) return;
    if (!confirm("Bạn có chắc chắn muốn thay đổi giá vàng hiện tại không?")) return;

    var tb = $("admin-rows");
    if (!tb) return;

    var readRowFromTr = function (tr) {
      var readInline = function (field) {
        var el = tr.querySelector('[data-inline-field="' + field + '"]');
        return el ? String(el.value || "").trim() : "";
      };
      return {
        productVal: readInline("product"),
        purityVal: readInline("purity"),
        buyVal: readInline("buy"),
        sellVal: readInline("sell"),
      };
    };

    var auditEntries = [];

    window.TLKVGold
      .getGoldTable()
      .then(function (d) {
        var ids = Object.keys(goldInlineEditRowIds).filter(function (id) {
          return goldInlineEditRowIds[id];
        });
        var byIndex = ids
          .map(function (rowId) {
            return {
              rowId: rowId,
              idx: d.rows.findIndex(function (x) {
                return x.id === rowId;
              }),
            };
          })
          .filter(function (x) {
            return x.idx >= 0;
          })
          .sort(function (a, b) {
            return a.idx - b.idx;
          });

        var oldById = Object.create(null);
        for (var o = 0; o < byIndex.length; o++) {
          var oItem = byIndex[o];
          oldById[oItem.rowId] = snapshotGoldAuditRow(d.rows[oItem.idx]);
        }

        auditEntries.length = 0;

        for (var i = 0; i < byIndex.length; i++) {
          var rowId = byIndex[i].rowId;
          var idx = byIndex[i].idx;
          var tr = findGoldRowTr(tb, rowId);
          if (!tr) continue;
          var v = readRowFromTr(tr);
          var productVal = v.productVal;
          var parentName = window.TLKVGold.variantParentProduct(d.rows, idx);
          if (parentName && productVal.toLowerCase() === parentName.toLowerCase()) {
            productVal = "";
          }
          var base = d.rows[idx];
          var row = {
            id: base.id,
            brand: base.brand,
            product: productVal,
            purity: v.purityVal,
            buy: v.buyVal,
            sell: v.sellVal,
            metal: base.metal,
            highlight: base.highlight === true,
          };
          d.rows[idx] = row;
          auditEntries.push({
            before: oldById[rowId],
            after: snapshotGoldAuditRow(row),
          });
        }

        if (auditEntries.length === 0) {
          throw new Error("Không có dòng hợp lệ để lưu.");
        }

        stampMetaOnPayload(d);
        return window.TLKVGold.saveToStorage(d);
      })
      .then(function () {
        if (!sb || !window.TLKVAudit || auditEntries.length === 0) return Promise.resolve();
        var chain = Promise.resolve();
        auditEntries.forEach(function (entry) {
          chain = chain.then(function () {
            var after = entry.after;
            var en =
              after.brand +
              " — " +
              (String(after.product || "").trim() || "—") +
              " — " +
              after.purity;
            return window.TLKVAudit.logGold(sb, {
              action: "row_update",
              entity_name: en,
              entity_id: after.id,
              summary: buildGoldRowChangeSummary(entry.before, entry.after),
              payload: { before: entry.before, after: entry.after },
            });
          });
        });
        return chain;
      })
      .then(function () {
        var n = auditEntries.length;
        showAdminToast(n === 1 ? "Đã lưu 1 dòng giá." : "Đã lưu " + n + " dòng giá.");
        clearGoldInlineEdit();
        refreshTable();
        refreshMetaForm();
        if (currentTab === "gold") refreshGoldHistory();
      })
      .catch(function (err) {
        console.error(err);
        alert("Không lưu được lên Supabase: " + (err && err.message ? err.message : String(err)));
      });
  }

  /* ───── refreshMetaForm ───── */
  async function refreshMetaForm() {
    if (!window.TLKVGold) return;
    var d;
    try {
      d = await window.TLKVGold.getGoldTable();
    } catch (err) {
      console.error(err);
      return;
    }
    var m = (d && d.meta) || {};
    var el = function (id) {
      return document.getElementById(id);
    };
    el("meta-header-time").value = m.headerTime || "";
    el("meta-footer-note").value = m.footerNote || "";
    el("meta-unit-line").value = m.unitLine || "";
    el("meta-brand-italic").value = m.brandItalic || "";
  }

  /* ───── refreshTable (bảng giá — mỗi dòng một hàng, sửa inline) ───── */
  async function refreshTable() {
    var data;
    try {
      data = await window.TLKVGold.getGoldTable();
    } catch (err) {
      console.error(err);
      var tbErr = $("admin-rows");
      if (tbErr) {
        tbErr.innerHTML =
          "<tr><td colspan=\"8\">Không tải bảng giá từ Supabase: " +
          escapeHtml(err && err.message ? err.message : String(err)) +
          "</td></tr>";
      }
      setGoldThayDoiVisible(false);
      return;
    }
    var tb = $("admin-rows");
    tb.innerHTML = "";
    var rows = (data && data.rows) || [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var isEditing = !!goldInlineEditRowIds[r.id];
      var productShown =
        String(r.product || "").trim() ||
        (i >= 0 ? window.TLKVGold.variantParentProduct(rows, i) : "");
      var tr = document.createElement("tr");
      tr.setAttribute("data-row-id", r.id);
      if (r.metal === "silver") tr.classList.add("row-silver");
      if (r.highlight === true) tr.classList.add("row-highlight");

      var tdId = document.createElement("td");
      tdId.textContent = r.id;
      tr.appendChild(tdId);

      var tdBrand = document.createElement("td");
      tdBrand.textContent = r.brand;
      tr.appendChild(tdBrand);

      var tdProd = document.createElement("td");
      if (isEditing) {
        var inProd = document.createElement("input");
        inProd.type = "text";
        inProd.className = "admin-gold-inline-input";
        inProd.setAttribute("data-inline-field", "product");
        inProd.value = productShown;
        tdProd.appendChild(inProd);
      } else {
        tdProd.textContent = productShown;
      }
      tr.appendChild(tdProd);

      var tdPur = document.createElement("td");
      if (isEditing) {
        var inPur = document.createElement("input");
        inPur.type = "text";
        inPur.className = "admin-gold-inline-input";
        inPur.setAttribute("data-inline-field", "purity");
        inPur.value = r.purity;
        tdPur.appendChild(inPur);
      } else {
        tdPur.textContent = r.purity;
      }
      tr.appendChild(tdPur);

      var tdBuy = document.createElement("td");
      if (isEditing) {
        var inBuy = document.createElement("input");
        inBuy.type = "text";
        inBuy.className = "admin-gold-inline-input";
        inBuy.setAttribute("data-inline-field", "buy");
        inBuy.value = r.buy;
        tdBuy.appendChild(inBuy);
      } else {
        tdBuy.textContent = r.buy;
      }
      tr.appendChild(tdBuy);

      var tdSell = document.createElement("td");
      if (isEditing) {
        var inSell = document.createElement("input");
        inSell.type = "text";
        inSell.className = "admin-gold-inline-input";
        inSell.setAttribute("data-inline-field", "sell");
        inSell.value = r.sell;
        tdSell.appendChild(inSell);
      } else {
        tdSell.textContent = r.sell;
      }
      tr.appendChild(tdSell);

      var tdMetal = document.createElement("td");
      tdMetal.textContent = r.metal;
      tr.appendChild(tdMetal);

      var tdAct = document.createElement("td");
      tdAct.className = "admin-cell-actions";
      if (isEditing) {
        var bCancel = document.createElement("button");
        bCancel.type = "button";
        bCancel.className = "admin-btn-inline-secondary btn-gold-inline-cancel";
        bCancel.setAttribute("data-id", r.id);
        bCancel.textContent = "Hủy";
        var bDelEd = document.createElement("button");
        bDelEd.type = "button";
        bDelEd.className = "btn-del";
        bDelEd.setAttribute("data-id", r.id);
        bDelEd.textContent = "Xóa";
        tdAct.appendChild(bCancel);
        tdAct.appendChild(bDelEd);
      } else {
        var bEdit = document.createElement("button");
        bEdit.type = "button";
        bEdit.className = "btn-edit";
        bEdit.setAttribute("data-id", r.id);
        bEdit.textContent = "Sửa";
        var bDel = document.createElement("button");
        bDel.type = "button";
        bDel.className = "btn-del";
        bDel.setAttribute("data-id", r.id);
        bDel.textContent = "Xóa";
        tdAct.appendChild(bEdit);
        tdAct.appendChild(bDel);
      }
      tr.appendChild(tdAct);
      tb.appendChild(tr);
    }

    setGoldThayDoiVisible(goldInlineEditHasAny());

    tb.querySelectorAll(".btn-del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        if (!confirm("Xóa dòng này?")) return;
        if (goldInlineEditRowIds[id]) {
          delete goldInlineEditRowIds[id];
          if (!goldInlineEditHasAny()) setGoldThayDoiVisible(false);
        }
        var removedRow = null;
        window.TLKVGold
          .getGoldTable()
          .then(function (d) {
            removedRow = d.rows.find(function (x) {
              return x.id === id;
            });
            d.rows = d.rows.filter(function (x) {
              return x.id !== id;
            });
            stampMetaOnPayload(d);
            return window.TLKVGold.saveToStorage(d);
          })
          .then(function () {
            if (sb && window.TLKVAudit && removedRow) {
              var en =
                removedRow.brand +
                " — " +
                (String(removedRow.product || "").trim() || "—") +
                " — " +
                removedRow.purity;
              return window.TLKVAudit.logGold(sb, {
                action: "row_delete",
                entity_name: en,
                entity_id: removedRow.id,
                summary: buildGoldRowDeleteSummary(removedRow),
                payload: { before: snapshotGoldAuditRow(removedRow) },
              });
            }
          })
          .then(function () {
            showAdminToast("Đã xóa dòng giá.");
            refreshTable();
            refreshMetaForm();
            if (currentTab === "gold") refreshGoldHistory();
          })
          .catch(function (err) {
            console.error(err);
            alert("Không lưu được lên Supabase: " + (err && err.message ? err.message : String(err)));
          });
      });
    });

    tb.querySelectorAll(".btn-edit").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        if (!id) return;
        if (goldInlineEditRowIds[id]) {
          delete goldInlineEditRowIds[id];
        } else {
          goldInlineEditRowIds[id] = true;
        }
        refreshTable();
      });
    });

    tb.querySelectorAll(".btn-gold-inline-cancel").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        if (id && goldInlineEditRowIds[id]) delete goldInlineEditRowIds[id];
        if (!goldInlineEditHasAny()) setGoldThayDoiVisible(false);
        refreshTable();
      });
    });
  }

  /* ───── refreshProductsTable ───── */
  function refreshProductsTable() {
    if (!window.TLKVProducts) return;
    window.TLKVProducts.getProducts()
      .then(function (data) {
        var tb = $("admin-product-rows");
        if (!tb) return;
        if (!data || !Array.isArray(data.items)) {
          tb.innerHTML =
            "<tr><td colspan=\"6\" class=\"admin-empty-hint\">Phản hồi sản phẩm không hợp lệ.</td></tr>";
          return;
        }
        tb.innerHTML = "";
        if (data.items.length === 0) {
          var tr = document.createElement("tr");
          tr.innerHTML =
            "<td colspan=\"6\" class=\"admin-empty-hint\"><strong>0 sản phẩm.</strong> Kiểm tra RLS: cần policy SELECT trên bảng <code>products</code>.</td>";
          tb.appendChild(tr);
          return;
        }
        data.items.forEach(function (p) {
          var tr = document.createElement("tr");
          var imgSrc = window.TLKVProducts.resolveProductImageSrc(p.image);
          var tdThumb =
            imgSrc !== ""
              ? '<td><img class="admin-product-thumb" src="' +
                escapeAttr(imgSrc) +
                '" alt="" loading="lazy" width="48" height="48" /></td>'
              : "<td>—</td>";
          tr.innerHTML =
            "<td>" +
            escapeHtml(p.id) +
            "</td>" +
            tdThumb +
            "<td>" +
            escapeHtml(p.name) +
            "</td>" +
            "<td>" +
            escapeHtml(p.category) +
            "</td>" +
            "<td>" +
            escapeHtml(p.priceText) +
            "</td>" +
            '<td><div class="admin-cell-actions">' +
            '<button type="button" class="btn-edit btn-edit-product" data-id="' +
            escapeAttr(p.id) +
            '">Sửa</button>' +
            '<button type="button" class="btn-del btn-del-product" data-id="' +
            escapeAttr(p.id) +
            '">Xóa</button></div></td>';
          tb.appendChild(tr);
        });

        tb.querySelectorAll(".btn-del-product").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var id = btn.getAttribute("data-id");
            if (!confirm("Xóa sản phẩm này?")) return;
            var removed = null;
            window.TLKVProducts
              .getProducts()
              .then(function (d) {
                removed = d.items.find(function (x) {
                  return x.id === id;
                });
                d.items = d.items.filter(function (x) {
                  return x.id !== id;
                });
                return window.TLKVProducts.saveToStorage(d);
              })
              .then(function () {
                if (sb && window.TLKVAudit && removed) {
                  return window.TLKVAudit.logProduct(sb, {
                    action: "product_delete",
                    entity_name: removed.name || removed.id,
                    entity_id: removed.id,
                    summary: "Đã xóa sản phẩm",
                    payload: removed,
                  });
                }
              })
              .then(function () {
                showAdminToast("Đã xóa sản phẩm.");
                refreshProductsTable();
                if (currentTab === "products") refreshProductHistory();
              })
              .catch(function (err) {
                console.error(err);
                alert("Không lưu được lên Supabase: " + (err && err.message ? err.message : String(err)));
              });
          });
        });

        tb.querySelectorAll(".btn-edit-product").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var id = btn.getAttribute("data-id");
            window.TLKVProducts.getProducts().then(function (d) {
              var row = d.items.find(function (x) {
                return x.id === id;
              });
              if (!row) return;
              $("pf-id").value = row.id;
              $("pf-name").value = row.name;
              $("pf-category").value = row.category;
              $("pf-priceText").value = row.priceText;
              if ($("pf-image")) $("pf-image").value = row.image || "";
              $("product-form-title").textContent = "Sửa sản phẩm";
            });
          });
        });
      })
      .catch(function (err) {
        console.error(err);
        var tb = $("admin-product-rows");
        if (tb) {
          tb.innerHTML =
            "<tr><td colspan=\"6\">Không tải sản phẩm từ Supabase: " +
            escapeHtml(err && err.message ? err.message : String(err)) +
            "</td></tr>";
        }
      });
  }

  function resetProductForm() {
    $("pf-id").value = "";
    $("pf-name").value = "";
    $("pf-category").value = "";
    $("pf-priceText").value = "";
    if ($("pf-image")) $("pf-image").value = "";
    $("product-form-title").textContent = "Thêm sản phẩm";
  }

  /* ───── applySession ───── */
  function applySession(session) {
    adminAuthed = !!session;
    if (adminAuthed) {
      showAdmin();
      currentTab = "gold";
      switchTab("gold");
      refreshTable();
      refreshMetaForm();
      refreshProductsTable();
    } else {
      showLogin();
    }
  }

  /* ───── bootSupabaseAuth ───── */
  async function bootSupabaseAuth() {
    try {
      var m = await import("/js/supabaseClient.js");
      sb = m.supabase;
    } catch (e) {
      console.error(e);
      sb = null;
    }
    if (!sb) {
      showLogin();
      var panel = $("login-panel");
      if (panel) {
        var errEl = $("login-env-error");
        if (!errEl) {
          errEl = document.createElement("p");
          errEl.id = "login-env-error";
          errEl.className = "hint";
          errEl.style.color = "#b91c1c";
          panel.appendChild(errEl);
        }
        errEl.textContent =
          "Thiếu NEXT_PUBLIC_SUPABASE_URL / key trong .env hoặc .env.local — không đăng nhập được.";
      }
      return;
    }

    var sessionResult = await sb.auth.getSession();
    var session = sessionResult.data.session;

    if (session) {
      try {
        await sb.auth.getUser();
      } catch (_) {}
    }

    applySession(session);

    sb.auth.onAuthStateChange(function (event, newSession) {
      if (event === "INITIAL_SESSION") return;
      applySession(newSession);
    });
  }

  /* ───── DOMContentLoaded: form bindings ───── */
  document.addEventListener("DOMContentLoaded", function () {
    bootSupabaseAuth();

    $("tab-btn-gold")?.addEventListener("click", function () {
      switchTab("gold");
    });
    $("tab-btn-products")?.addEventListener("click", function () {
      switchTab("products");
    });

    $("gold-hist-refresh")?.addEventListener("click", refreshGoldHistory);
    $("product-hist-refresh")?.addEventListener("click", refreshProductHistory);
    $("gold-hist-search")?.addEventListener("input", debounceGoldHistory);
    $("gold-hist-date")?.addEventListener("change", refreshGoldHistory);
    $("product-hist-search")?.addEventListener("input", debounceProductHistory);
    $("product-hist-date")?.addEventListener("change", refreshProductHistory);

    $("login-form")?.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = $("login-user").value.trim();
      var password = $("login-pass").value;
      if (!sb) {
        alert("Chưa có client Supabase. Kiểm tra .env.local và chạy npm start.");
        return;
      }
      sb.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
        if (res.error) {
          alert(res.error.message);
          return;
        }
      });
    });

    $("btn-logout")?.addEventListener("click", function () {
      clearGoldInlineEdit();
      if (sb) sb.auth.signOut();
      else showLogin();
    });

    $("btn-reset-json")?.addEventListener("click", function () {
      if (!confirm("Xóa khóa localStorage cũ của bảng giá (nếu có)? Dữ liệu trên Supabase không bị xóa."))
        return;
      window.TLKVGold.clearStorage();
      refreshTable();
      refreshMetaForm();
    });

    $("meta-form")?.addEventListener("submit", function (e) {
      e.preventDefault();
      var meta = {
        headerTime: $("meta-header-time").value.trim(),
        footerNote: $("meta-footer-note").value.trim(),
        unitLine: $("meta-unit-line").value.trim(),
        brandItalic: $("meta-brand-italic").value.trim(),
      };
      window.TLKVGold
        .saveGoldMetaOnly(meta)
        .then(function () {
          if (sb && window.TLKVAudit) {
            return window.TLKVAudit.logGold(sb, {
              action: "meta_update",
              entity_name: "META — " + (meta.headerTime || "bảng giá"),
              entity_id: "gold_meta:1",
              summary: "Cập nhật thời gian & đơn vị hiển thị",
              payload: meta,
            });
          }
        })
        .then(function () {
          showAdminToast("Đã lưu meta.");
          refreshMetaForm();
          if (currentTab === "gold") refreshGoldHistory();
        })
        .catch(function (err) {
          console.error(err);
          alert("Không lưu được meta lên Supabase: " + (err && err.message ? err.message : String(err)));
        });
    });

    function resetForm() {
      $("f-id").value = "";
      $("f-brand").value = "";
      $("f-product").value = "";
      $("f-purity").value = "";
      $("f-buy").value = "";
      $("f-sell").value = "";
      $("f-metal").value = "gold";
      if ($("f-highlight")) $("f-highlight").checked = false;
      $("form-title").textContent = "Thêm dòng";
    }

    $("btn-new")?.addEventListener("click", resetForm);

    function syncSilverIfBacBrand() {
      var bEl = $("f-brand");
      var mEl = $("f-metal");
      if (!bEl || !mEl || !window.TLKVGold) return;
      if (window.TLKVGold.brandsMatch(bEl.value.trim(), "Bạc")) {
        mEl.value = "silver";
      }
    }
    $("f-brand")?.addEventListener("input", syncSilverIfBacBrand);
    $("f-brand")?.addEventListener("change", syncSilverIfBacBrand);

    $("row-form")?.addEventListener("submit", function (e) {
      e.preventDefault();
      var wasEdit = false;
      var savedRow = null;
      var beforeSnapshot = null;
      window.TLKVGold
        .getGoldTable()
        .then(function (d) {
          var metal = $("f-metal").value === "silver" ? "silver" : "gold";
          var brandVal = $("f-brand").value.trim();
          if (window.TLKVGold.brandsMatch(brandVal, "Bạc")) {
            metal = "silver";
            $("f-metal").value = "silver";
          }
          var id = $("f-id").value.trim();
          var idx = d.rows.findIndex(function (x) {
            return x.id === id;
          });
          wasEdit = idx >= 0;
          if (wasEdit) beforeSnapshot = snapshotGoldAuditRow(d.rows[idx]);
          var productVal = $("f-product").value.trim();
          if (idx >= 0) {
            var parentName = window.TLKVGold.variantParentProduct(d.rows, idx);
            if (parentName && productVal.toLowerCase() === parentName.toLowerCase()) {
              productVal = "";
            }
          }
          var row = {
            id: id || "r-" + Date.now(),
            brand: $("f-brand").value.trim(),
            product: productVal,
            purity: $("f-purity").value.trim(),
            buy: $("f-buy").value.trim(),
            sell: $("f-sell").value.trim(),
            metal: metal,
            highlight: $("f-highlight") ? $("f-highlight").checked : false,
          };
          savedRow = row;
          if (idx >= 0) {
            d.rows[idx] = row;
          } else if (metal === "silver") {
            d.rows = window.TLKVGold.insertSilverRow(d.rows, row);
          } else {
            d.rows = window.TLKVGold.insertGoldRow(d.rows, row);
          }
          stampMetaOnPayload(d);
          return window.TLKVGold.saveToStorage(d);
        })
        .then(function () {
          if (sb && window.TLKVAudit && savedRow) {
            var afterSnap = snapshotGoldAuditRow(savedRow);
            var en =
              savedRow.brand +
              " — " +
              (String(savedRow.product || "").trim() || "—") +
              " — " +
              savedRow.purity;
            var summary = wasEdit && beforeSnapshot
              ? buildGoldRowChangeSummary(beforeSnapshot, afterSnap)
              : buildGoldRowInsertSummary(savedRow);
            var payload = wasEdit && beforeSnapshot
              ? { before: beforeSnapshot, after: afterSnap }
              : { after: afterSnap };
            return window.TLKVAudit.logGold(sb, {
              action: wasEdit ? "row_update" : "row_insert",
              entity_name: en,
              entity_id: savedRow.id,
              summary: summary,
              payload: payload,
            });
          }
        })
        .then(function () {
          showAdminToast("Đã lưu dòng giá.");
          refreshTable();
          refreshMetaForm();
          resetForm();
          if (currentTab === "gold") refreshGoldHistory();
        })
        .catch(function (err) {
          console.error(err);
          alert("Không lưu được dòng lên Supabase: " + (err && err.message ? err.message : String(err)));
        });
    });

    window.addEventListener("tlkv:gold-table-changed", function () {
      if (adminAuthed) {
        clearGoldInlineEdit();
        refreshTable();
        refreshMetaForm();
      }
    });

    $("btn-gold-thay-doi")?.addEventListener("click", function () {
      commitGoldInlineEdit();
    });

    $("btn-product-new")?.addEventListener("click", resetProductForm);

    $("btn-refresh-products")?.addEventListener("click", function () {
      refreshProductsTable();
    });

    $("btn-reset-products-json")?.addEventListener("click", function () {
      if (!confirm("Xóa khóa localStorage cũ của sản phẩm (nếu có)? Dữ liệu trên Supabase không bị xóa."))
        return;
      window.TLKVProducts.clearStorage();
      refreshProductsTable();
    });

    $("product-form")?.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!window.TLKVProducts) return;
      var wasEdit = !!$("pf-id").value.trim();
      var savedItem = null;
      window.TLKVProducts
        .getProducts()
        .then(function (d) {
          var id = $("pf-id").value.trim();
          var item = {
            id: id || "p-" + Date.now(),
            name: $("pf-name").value.trim(),
            category: $("pf-category").value.trim(),
            priceText: $("pf-priceText").value.trim(),
            image: $("pf-image") ? $("pf-image").value.trim() : "",
          };
          savedItem = item;
          var idx = d.items.findIndex(function (x) {
            return x.id === item.id;
          });
          if (idx >= 0) d.items[idx] = item;
          else d.items.push(item);
          return window.TLKVProducts.saveToStorage(d);
        })
        .then(function () {
          if (sb && window.TLKVAudit && savedItem) {
            return window.TLKVAudit.logProduct(sb, {
              action: wasEdit ? "product_update" : "product_insert",
              entity_name: savedItem.name || savedItem.id,
              entity_id: savedItem.id,
              summary: wasEdit ? "Cập nhật sản phẩm" : "Thêm sản phẩm mới",
              payload: savedItem,
            });
          }
        })
        .then(function () {
          showAdminToast(wasEdit ? "Đã cập nhật sản phẩm." : "Đã thêm sản phẩm mới.");
          refreshProductsTable();
          resetProductForm();
          if (currentTab === "products") refreshProductHistory();
        })
        .catch(function (err) {
          console.error(err);
          alert("Không lưu được sản phẩm lên Supabase: " + (err && err.message ? err.message : String(err)));
        });
    });

    window.addEventListener("tlkv:products-changed", function () {
      if (adminAuthed) refreshProductsTable();
    });
  });
})();
