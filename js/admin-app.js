(function () {
  /** @type {import("@supabase/supabase-js").SupabaseClient | null} */
  var sb = null;
  var adminAuthed = false;

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

  /* ───── refreshTable (bảng giá) ───── */
  async function refreshTable() {
    var data;
    try {
      data = await window.TLKVGold.getGoldTable();
    } catch (err) {
      console.error(err);
      var tb = $("admin-rows");
      if (tb) {
        tb.innerHTML =
          "<tr><td colspan=\"8\">Không tải bảng giá từ Supabase: " +
          escapeHtml(err && err.message ? err.message : String(err)) +
          "</td></tr>";
      }
      return;
    }
    var tb = $("admin-rows");
    tb.innerHTML = "";
    var rows = (data && data.rows) || [];
    window.TLKVGold.walkMergedGoldRows(rows, function (ctx) {
      var r = ctx.row;
      var tr = document.createElement("tr");
      if (r.metal === "silver") tr.classList.add("row-silver");
      if (r.highlight === true) tr.classList.add("row-highlight");

      var tdId = document.createElement("td");
      tdId.textContent = r.id;
      tr.appendChild(tdId);

      if (ctx.showBrand) {
        var tdB = document.createElement("td");
        tdB.className = "admin-brand-cell";
        tdB.rowSpan = ctx.brandRowspan;
        tdB.textContent = r.brand;
        tr.appendChild(tdB);
      }
      if (ctx.showProduct) {
        var tdP = document.createElement("td");
        tdP.className = "admin-product-cell";
        tdP.rowSpan = ctx.productRowspan;
        tdP.textContent = ctx.productLabel;
        tr.appendChild(tdP);
      }

      var tdPur = document.createElement("td");
      tdPur.textContent = r.purity;
      tr.appendChild(tdPur);
      var tdBuy = document.createElement("td");
      tdBuy.textContent = r.buy;
      tr.appendChild(tdBuy);
      var tdSell = document.createElement("td");
      tdSell.textContent = r.sell;
      tr.appendChild(tdSell);
      var tdMetal = document.createElement("td");
      tdMetal.textContent = r.metal;
      tr.appendChild(tdMetal);

      var tdAct = document.createElement("td");
      tdAct.innerHTML =
        '<button type="button" class="btn-edit" data-id="' +
        escapeAttr(r.id) +
        '">Sửa</button> <button type="button" class="btn-del" data-id="' +
        escapeAttr(r.id) +
        '">Xóa</button>';
      tr.appendChild(tdAct);

      tb.appendChild(tr);
    });

    tb.querySelectorAll(".btn-del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        if (!confirm("Xóa dòng này?")) return;
        window.TLKVGold.getGoldTable()
          .then(function (d) {
            d.rows = d.rows.filter(function (x) {
              return x.id !== id;
            });
            return window.TLKVGold.saveToStorage(d);
          })
          .then(function () {
            showAdminToast("Đã xóa dòng giá.");
            refreshTable();
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
        window.TLKVGold.getGoldTable().then(function (d) {
          var row = d.rows.find(function (x) {
            return x.id === id;
          });
          if (!row) return;
          var idx = d.rows.findIndex(function (x) {
            return x.id === id;
          });
          var productShown =
            String(row.product || "").trim() ||
            (idx >= 0 ? window.TLKVGold.variantParentProduct(d.rows, idx) : "");
          $("f-id").value = row.id;
          $("f-brand").value = row.brand;
          $("f-product").value = productShown;
          $("f-purity").value = row.purity;
          $("f-buy").value = row.buy;
          $("f-sell").value = row.sell;
          $("f-metal").value = row.metal;
          $("f-highlight").checked = row.highlight === true;
          $("form-title").textContent = "Sửa dòng";
        });
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
            '<td><button type="button" class="btn-edit btn-edit-product" data-id="' +
            escapeAttr(p.id) +
            '">Sửa</button> <button type="button" class="btn-del btn-del-product" data-id="' +
            escapeAttr(p.id) +
            '">Xóa</button></td>';
          tb.appendChild(tr);
        });

        tb.querySelectorAll(".btn-del-product").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var id = btn.getAttribute("data-id");
            if (!confirm("Xóa sản phẩm này?")) return;
            window.TLKVProducts.getProducts()
              .then(function (d) {
                d.items = d.items.filter(function (x) {
                  return x.id !== id;
                });
                return window.TLKVProducts.saveToStorage(d);
              })
              .then(function () {
                showAdminToast("Đã xóa sản phẩm.");
                refreshProductsTable();
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
      window.TLKVGold
        .saveGoldMetaOnly({
          headerTime: $("meta-header-time").value.trim(),
          footerNote: $("meta-footer-note").value.trim(),
          unitLine: $("meta-unit-line").value.trim(),
          brandItalic: $("meta-brand-italic").value.trim(),
        })
        .then(function () {
          showAdminToast("Đã lưu meta.");
          refreshMetaForm();
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
      window.TLKVGold.getGoldTable()
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
          if (idx >= 0) {
            d.rows[idx] = row;
          } else if (metal === "silver") {
            d.rows = window.TLKVGold.insertSilverRow(d.rows, row);
          } else {
            d.rows = window.TLKVGold.insertGoldRow(d.rows, row);
          }
          return window.TLKVGold.saveToStorage(d);
        })
        .then(function () {
          showAdminToast("Đã lưu dòng giá.");
          refreshTable();
          resetForm();
        })
        .catch(function (err) {
          console.error(err);
          alert("Không lưu được dòng lên Supabase: " + (err && err.message ? err.message : String(err)));
        });
    });

    window.addEventListener("tlkv:gold-table-changed", function () {
      if (adminAuthed) {
        refreshTable();
        refreshMetaForm();
      }
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
      window.TLKVProducts.getProducts()
        .then(function (d) {
          var id = $("pf-id").value.trim();
          var item = {
            id: id || "p-" + Date.now(),
            name: $("pf-name").value.trim(),
            category: $("pf-category").value.trim(),
            priceText: $("pf-priceText").value.trim(),
            image: $("pf-image") ? $("pf-image").value.trim() : "",
          };
          var idx = d.items.findIndex(function (x) {
            return x.id === item.id;
          });
          if (idx >= 0) d.items[idx] = item;
          else d.items.push(item);
          return window.TLKVProducts.saveToStorage(d);
        })
        .then(function () {
          showAdminToast(wasEdit ? "Đã cập nhật sản phẩm." : "Đã thêm sản phẩm mới.");
          refreshProductsTable();
          resetProductForm();
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
