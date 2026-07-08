/**
 * TLKV Catalog Admin — brands, categories, enhanced products (Step 10).
 */
(function () {
  "use strict";

  var $ = function (id) {
    return document.getElementById(id);
  };

  var brandsCache = [];
  var categoriesCache = [];
  var editingBrandSortOrder = 0;
  var editingCategorySortOrder = 0;

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function getSb() {
    if (window.TLKVCatalogApi && window.TLKVCatalogApi.getSupabaseClient) {
      return window.TLKVCatalogApi.getSupabaseClient();
    }
    return null;
  }

  function toast(msg, type) {
    if (typeof window.showAdminToast === "function") window.showAdminToast(msg, type);
    else if (typeof window.showToast === "function") window.showToast(msg, type);
    else console.log(msg);
  }

  async function loadTaxonomies() {
    if (!window.TLKVCatalogApi) return;
    brandsCache = await window.TLKVCatalogApi.fetchBrandsList();
    categoriesCache = await window.TLKVCatalogApi.fetchCategoriesList();
    fillSelect($("pf-brand-id"), brandsCache, "Tất cả thương hiệu");
    fillSelect($("pf-category-id"), categoriesCache, "Chọn danh mục");
    fillSelect($("catalog-admin-filter-brand"), brandsCache, "Thương hiệu");
    fillSelect($("catalog-admin-filter-category"), categoriesCache, "Danh mục");
  }

  function fillSelect(sel, rows, placeholder) {
    if (!sel) return;
    var current = sel.value;
    sel.innerHTML = "";
    if (placeholder && sel.id !== "pf-brand-id" && sel.id !== "pf-category-id") {
      var o0 = document.createElement("option");
      o0.value = "";
      o0.textContent = placeholder;
      sel.appendChild(o0);
    }
    if (sel.id === "pf-brand-id") {
      var ob = document.createElement("option");
      ob.value = "";
      ob.textContent = "— Chọn thương hiệu —";
      sel.appendChild(ob);
    }
    if (sel.id === "pf-category-id") {
      var oc = document.createElement("option");
      oc.value = "";
      oc.textContent = "— Chọn danh mục —";
      sel.appendChild(oc);
    }
    (rows || []).forEach(function (r) {
      var o = document.createElement("option");
      o.value = r.id;
      o.textContent = r.name + (r.is_active === false ? " (ẩn)" : "");
      sel.appendChild(o);
    });
    if (current) sel.value = current;
  }

  function fillProductForm(item) {
    if (window.TLKVProductFormAdmin && window.TLKVProductFormAdmin.loadForEdit) {
      window.TLKVProductFormAdmin.loadForEdit(item);
    }
  }

  function formatWeightCell(p) {
    if (window.TLKVProducts && window.TLKVProducts.formatProductWeightDisplay) {
      return window.TLKVProducts.formatProductWeightDisplay(p && p.weight);
    }
    if (p && p.weight != null && Number.isFinite(Number(p.weight))) return String(Number(p.weight));
    return "—";
  }

  function flagBadges(p) {
    var parts = [];
    if (p.isFeatured) parts.push('<span class="tlkv-admin-badge tlkv-admin-badge--featured">Nổi bật</span>');
    if (p.isBestSeller) parts.push('<span class="tlkv-admin-badge tlkv-admin-badge--best">Bán chạy</span>');
    if (p.isHot) parts.push('<span class="tlkv-admin-badge tlkv-admin-badge--hot">Hot</span>');
    if (!p.isActive) parts.push('<span class="tlkv-admin-badge tlkv-admin-badge--off">Ẩn</span>');
    return parts.join(" ");
  }

  function renderProductsTable(items) {
    var tb = $("admin-product-rows");
    if (!tb) return;
    tb.innerHTML = "";
    if (!items.length) {
      tb.innerHTML = '<tr><td colspan="9" class="admin-empty-hint">0 sản phẩm.</td></tr>';
      return;
    }
    items.forEach(function (p) {
      var tr = document.createElement("tr");
      var imgRaw = p.thumbnailUrl || p.image || "";
      var imgSrc = window.TLKVProducts.resolveProductImageSrc(imgRaw);
      var tdThumb = imgSrc
        ? '<td><img class="admin-product-thumb" src="' + imgSrc.replace(/"/g, "&quot;") + '" alt="" width="48" height="48" loading="lazy" decoding="async" /></td>'
        : "<td>—</td>";
      tr.innerHTML =
        "<td><small>" +
        escapeHtml(p.id) +
        "</small></td>" +
        tdThumb +
        "<td>" +
        escapeHtml(p.name) +
        "</td>" +
        "<td>" +
        escapeHtml(p.brandName || "—") +
        "</td>" +
        "<td>" +
        escapeHtml(p.categoryName || p.category || "—") +
        "</td>" +
        "<td>" +
        escapeHtml(p.priceText) +
        "</td>" +
        "<td>" +
        escapeHtml(formatWeightCell(p)) +
        "</td>" +
        "<td>" +
        flagBadges(p) +
        "</td>" +
        '<td><div class="admin-cell-actions">' +
        '<button type="button" class="btn-edit btn-edit-product" data-id="' +
        escapeHtml(p.id) +
        '">Sửa</button>' +
        '<button type="button" class="btn-del btn-del-product" data-id="' +
        escapeHtml(p.id) +
        '">Xóa</button></div></td>';
      tb.appendChild(tr);
    });

    tb.querySelectorAll(".btn-edit-product").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        window.TLKVProducts.getProducts().then(function (d) {
          var row = d.items.find(function (x) {
            return x.id === id;
          });
          if (row) fillProductForm(row);
        });
      });
    });

    tb.querySelectorAll(".btn-del-product").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        if (!confirm("Xóa sản phẩm này?")) return;
        window.TLKVProducts.deleteProductById(id)
          .then(function () {
            toast("Đã xóa sản phẩm.", "success");
            refreshProductsTableAdmin();
          })
          .catch(function (e) {
            toast(e.message || String(e), "error");
          });
      });
    });
  }

  function refreshProductsTableAdmin() {
    if (!window.TLKVProducts) return;
    window.TLKVProducts.getProducts().then(function (data) {
      var items = (data && data.items) || [];
      var q = ($("catalog-admin-search") && $("catalog-admin-search").value.trim().toLowerCase()) || "";
      var bf = $("catalog-admin-filter-brand") && $("catalog-admin-filter-brand").value;
      var cf = $("catalog-admin-filter-category") && $("catalog-admin-filter-category").value;
      items = items.filter(function (p) {
        if (bf && p.brandId !== bf) return false;
        if (cf && p.categoryId !== cf) return false;
        if (q && String(p.name || "").toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      renderProductsTable(items);
    });
  }

  function resetBrandForm() {
    if ($("brand-form")) $("brand-form").reset();
    if ($("brand-form-id")) $("brand-form-id").value = "";
    editingBrandSortOrder = 0;
    if ($("brand-form-active")) $("brand-form-active").checked = true;
    if ($("brand-form-title")) $("brand-form-title").textContent = "Thêm thương hiệu";
  }

  function resetCategoryForm() {
    if ($("category-form")) $("category-form").reset();
    if ($("category-form-id")) $("category-form-id").value = "";
    editingCategorySortOrder = 0;
    if ($("category-form-active")) $("category-form-active").checked = true;
    if ($("category-form-title")) $("category-form-title").textContent = "Thêm danh mục";
  }

  function refreshBrandList() {
    return loadTaxonomies().then(function () {
      refreshBrandsTable();
    });
  }

  function refreshCategoryList() {
    return loadTaxonomies().then(function () {
      refreshCategoriesTable();
    });
  }

  async function saveBrandForm(e) {
    e.preventDefault();
    var sb = await getSb();
    if (!sb) return toast("Chưa có Supabase", "error");
    var id = ($("brand-form-id") && $("brand-form-id").value) || "";
    var name = $("brand-form-name").value.trim();
    if (!name) return toast("Nhập tên thương hiệu.", "error");
    var row = {
      name: name,
      slug: window.TLKVProducts.slugifySimple(name),
      description: ($("brand-form-desc") && $("brand-form-desc").value.trim()) || null,
      logo_url: ($("brand-form-logo") && $("brand-form-logo").value.trim()) || null,
      sort_order: id ? editingBrandSortOrder : 0,
      is_active: $("brand-form-active") ? $("brand-form-active").checked : true,
    };
    var res;
    if (id) res = await sb.from("brands").update(row).eq("id", id);
    else res = await sb.from("brands").insert(row);
    if (res.error) return toast(res.error.message, "error");
    toast("Đã lưu thương hiệu.", "success");
    resetBrandForm();
    loadTaxonomies();
    refreshBrandsTable();
  }

  async function saveCategoryForm(e) {
    e.preventDefault();
    var sb = await getSb();
    if (!sb) return toast("Chưa có Supabase", "error");
    var id = ($("category-form-id") && $("category-form-id").value) || "";
    var name = $("category-form-name").value.trim();
    if (!name) return toast("Nhập tên danh mục.", "error");
    var row = {
      name: name,
      slug: window.TLKVProducts.slugifySimple(name),
      sort_order: id ? editingCategorySortOrder : 0,
      is_active: $("category-form-active") ? $("category-form-active").checked : true,
    };
    var res;
    if (id) res = await sb.from("categories").update(row).eq("id", id);
    else res = await sb.from("categories").insert(row);
    if (res.error) return toast(res.error.message, "error");
    toast("Đã lưu danh mục.", "success");
    resetCategoryForm();
    loadTaxonomies();
    refreshCategoriesTable();
  }

  function truncateText(str, max) {
    var s = String(str || "");
    if (s.length <= max) return s;
    return s.slice(0, max) + "…";
  }

  async function refreshBrandsTable() {
    var tb = $("admin-brand-rows");
    if (!tb) return;
    var sb = await getSb();
    if (!sb) return;
    var res = await sb.from("brands").select("*").order("sort_order").order("name");
    if (res.error) return;
    tb.innerHTML = "";
    if (!(res.data || []).length) {
      tb.innerHTML = '<tr><td colspan="4" class="admin-empty-hint">Chưa có thương hiệu.</td></tr>';
      return;
    }
    (res.data || []).forEach(function (b) {
      var tr = document.createElement("tr");
      var statusBadge = b.is_active
        ? '<span class="tlkv-admin-badge tlkv-admin-badge--on">Hiển thị</span>'
        : '<span class="tlkv-admin-badge tlkv-admin-badge--off">Ẩn</span>';
      tr.innerHTML =
        "<td><strong>" +
        escapeHtml(b.name) +
        "</strong></td><td>" +
        escapeHtml(truncateText(b.description, 60)) +
        "</td><td>" +
        statusBadge +
        '</td><td><div class="admin-cell-actions"><button type="button" class="btn-edit" data-brand-edit="' +
        escapeHtml(b.id) +
        '">Sửa</button> <button type="button" class="btn-del" data-brand-del="' +
        escapeHtml(b.id) +
        '">Xóa</button></div></td>';
      tb.appendChild(tr);
    });
    tb.querySelectorAll("[data-brand-edit]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-brand-edit");
        var b = (res.data || []).find(function (x) {
          return x.id === id;
        });
        if (!b) return;
        editingBrandSortOrder = b.sort_order != null ? Number(b.sort_order) : 0;
        $("brand-form-id").value = b.id;
        if ($("brand-form-title")) $("brand-form-title").textContent = "Sửa thương hiệu";
        $("brand-form-name").value = b.name;
        if ($("brand-form-desc")) $("brand-form-desc").value = b.description || "";
        if ($("brand-form-logo")) $("brand-form-logo").value = b.logo_url || "";
        if ($("brand-form-active")) $("brand-form-active").checked = b.is_active;
        document.getElementById("brand-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    tb.querySelectorAll("[data-brand-del]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!confirm("Xóa thương hiệu?")) return;
        var id = btn.getAttribute("data-brand-del");
        var del = await sb.from("brands").delete().eq("id", id);
        if (del.error) toast(del.error.message, "error");
        else {
          toast("Đã xóa.", "success");
          refreshBrandsTable();
          loadTaxonomies();
        }
      });
    });
  }

  async function refreshCategoriesTable() {
    var tb = $("admin-category-rows");
    if (!tb) return;
    var sb = await getSb();
    if (!sb) return;
    var res = await sb.from("categories").select("*").order("sort_order").order("name");
    if (res.error) return;
    tb.innerHTML = "";
    if (!(res.data || []).length) {
      tb.innerHTML = '<tr><td colspan="3" class="admin-empty-hint">Chưa có danh mục.</td></tr>';
      return;
    }
    (res.data || []).forEach(function (c) {
      var tr = document.createElement("tr");
      var statusBadge = c.is_active
        ? '<span class="tlkv-admin-badge tlkv-admin-badge--on">Hiển thị</span>'
        : '<span class="tlkv-admin-badge tlkv-admin-badge--off">Ẩn</span>';
      tr.innerHTML =
        "<td><strong>" +
        escapeHtml(c.name) +
        "</strong></td><td>" +
        statusBadge +
        '</td><td><div class="admin-cell-actions"><button type="button" class="btn-edit" data-cat-edit="' +
        escapeHtml(c.id) +
        '">Sửa</button> <button type="button" class="btn-del" data-cat-del="' +
        escapeHtml(c.id) +
        '">Xóa</button></div></td>';
      tb.appendChild(tr);
    });
    tb.querySelectorAll("[data-cat-edit]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-cat-edit");
        var c = (res.data || []).find(function (x) {
          return x.id === id;
        });
        if (!c) return;
        editingCategorySortOrder = c.sort_order != null ? Number(c.sort_order) : 0;
        $("category-form-id").value = c.id;
        if ($("category-form-title")) $("category-form-title").textContent = "Sửa danh mục";
        $("category-form-name").value = c.name;
        if ($("category-form-active")) $("category-form-active").checked = c.is_active;
        document.getElementById("category-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    tb.querySelectorAll("[data-cat-del]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!confirm("Xóa danh mục?")) return;
        var id = btn.getAttribute("data-cat-del");
        var del = await sb.from("categories").delete().eq("id", id);
        if (del.error) toast(del.error.message, "error");
        else {
          toast("Đã xóa.", "success");
          refreshCategoriesTable();
          loadTaxonomies();
        }
      });
    });
  }

  function hookProductForm() {
    var form = $("product-form");
    if (!form || form.dataset.catalogHooked === "1") return;
    form.dataset.catalogHooked = "1";

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!window.TLKVProducts || !window.TLKVProducts.saveProduct) return;

      var submitBtn = form.querySelector('button[type="submit"]');
      var orig = submitBtn && submitBtn.textContent;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "⏳ Đang lưu...";
      }

      var isEdit =
        window.TLKVProductFormAdmin && window.TLKVProductFormAdmin.getMode() === "edit";

      var payloadPromise =
        window.TLKVProductFormAdmin && window.TLKVProductFormAdmin.buildPayload
          ? window.TLKVProductFormAdmin.buildPayload(categoriesCache)
          : Promise.reject(new Error("TLKVProductFormAdmin chưa load."));

      payloadPromise
        .then(function (payload) {
          return window.TLKVProducts.saveProduct(payload, {
            mode: isEdit ? "edit" : "create",
            existingSlug:
              isEdit && window.TLKVProductFormAdmin && window.TLKVProductFormAdmin.getOriginalSlug
                ? window.TLKVProductFormAdmin.getOriginalSlug()
                : "",
          }).then(function (saved) {
            return { saved: saved, payload: payload };
          });
        })
        .then(function (result) {
          var saved = result.saved;
          if (!window.TLKVAudit || !window.TLKVAudit.logProductSafe) return saved;
          return getSb().then(async function (client) {
            if (!client) return saved;
            var actorEmail = "";
            try {
              var u = await client.auth.getUser();
              actorEmail = (u.data && u.data.user && u.data.user.email) || "";
            } catch (_) {}
            var audit = await window.TLKVAudit.logProductSafe(
              client,
              {
                action: isEdit ? "product_update" : "product_insert",
                entity_name: saved.name,
                entity_id: saved.id,
                summary: isEdit ? "Cập nhật sản phẩm (catalog)" : "Thêm sản phẩm (catalog)",
                payload: saved,
              },
              actorEmail
            );
            if (!audit.ok && !audit.skipped) {
              toast("Đã lưu sản phẩm nhưng không ghi được lịch sử.", "error");
            }
            return saved;
          });
        })
        .then(function (saved) {
          toast(isEdit ? "Đã cập nhật." : "Đã thêm sản phẩm.", "success");
          if (window.TLKVProductFormAdmin) {
            window.TLKVProductFormAdmin.resetToCreateMode();
          } else if (typeof window.clearProductForm === "function") window.clearProductForm();
          refreshProductsTableAdmin();
        })
        .catch(function (err) {
          toast(err.message || String(err), "error");
        })
        .finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = orig || "💾 Lưu sản phẩm";
          }
        });
    });

  }

  function initSubTabs() {
    document.querySelectorAll("[data-catalog-subtab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tab = btn.getAttribute("data-catalog-subtab");
        document.querySelectorAll("[data-catalog-subtab]").forEach(function (b) {
          b.classList.toggle("admin-tab--active", b === btn);
        });
        document.querySelectorAll("[data-catalog-panel]").forEach(function (panel) {
          panel.hidden = panel.getAttribute("data-catalog-panel") !== tab;
        });
      });
    });
  }

  function boot() {
    if (window.TLKVProductFormAdmin && window.TLKVProductFormAdmin.init) {
      window.TLKVProductFormAdmin.init();
    }
    hookProductForm();
    initSubTabs();
    loadTaxonomies().then(function () {
      refreshProductsTableAdmin();
      refreshBrandsTable();
      refreshCategoriesTable();
    });

    $("catalog-admin-search")?.addEventListener("input", function () {
      refreshProductsTableAdmin();
    });
    $("catalog-admin-filter-brand")?.addEventListener("change", refreshProductsTableAdmin);
    $("catalog-admin-filter-category")?.addEventListener("change", refreshProductsTableAdmin);
    $("brand-form")?.addEventListener("submit", saveBrandForm);
    $("category-form")?.addEventListener("submit", saveCategoryForm);
    $("brand-form-refresh")?.addEventListener("click", function () {
      refreshBrandList().catch(function (e) {
        toast(e.message || String(e), "error");
      });
    });
    $("category-form-refresh")?.addEventListener("click", function () {
      refreshCategoryList().catch(function (e) {
        toast(e.message || String(e), "error");
      });
    });

    window.addEventListener("tlkv:products-changed", refreshProductsTableAdmin);
  }

  window.TLKVCatalogAdmin = {
    boot: boot,
    refreshProductsTableAdmin: refreshProductsTableAdmin,
    fillProductForm: fillProductForm,
    loadTaxonomies: loadTaxonomies,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
