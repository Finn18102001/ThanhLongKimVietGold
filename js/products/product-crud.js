/**
 * Product domain rules — single source for CRUD validation.
 * Data access: TLKVProducts (write), TLKVCatalogApi (public read).
 */
(function (global) {
  "use strict";

  var PRODUCT_PUBLIC_SELECT =
    "id, name, slug, price_text, price_numeric, image, sort_order, weight, price_source_product, price_row_id, price_source, " +
    "is_featured, is_best_seller, is_hot, is_active, brand_id, category_id, " +
    "brands ( id, name, slug ), categories ( id, name, slug ), " +
    "product_images ( role, public_url, sort_order )";

  /**
   * @param {object} item — app-shaped product from form
   * @returns {{ ok: boolean, errors: string[] }}
   */
  function validateForSave(item) {
    var errors = [];
    item = item || {};
    var name = String(item.name || "").trim();
    if (!name) errors.push("Tên sản phẩm là bắt buộc.");
    if (!String(item.brandId || "").trim()) errors.push("Chọn thương hiệu.");
    if (!String(item.categoryId || "").trim()) errors.push("Chọn danh mục.");
    return { ok: errors.length === 0, errors: errors };
  }

  /**
   * Create: new id. Edit: keep id.
   */
  function resolveProductId(item, mode) {
    var id = String((item && item.id) || "").trim();
    if (mode === "edit" && id) return id;
    if (id) return id;
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return "p-" + Date.now();
  }

  var OPERATION_LABEL = {
    create: "Thêm sản phẩm",
    update: "Cập nhật sản phẩm",
    delete: "Xóa sản phẩm",
    deactivate: "Ẩn sản phẩm",
    read: "Tải sản phẩm",
    list: "Tải danh sách sản phẩm",
    sync_image: "Lưu ảnh sản phẩm",
    bulk_save: "Đồng bộ danh sách sản phẩm",
  };

  function operationLabel(operation) {
    return OPERATION_LABEL[operation] || "Thao tác sản phẩm";
  }

  function quoteLabel(value) {
    var s = String(value == null ? "" : value).trim();
    return s ? "«" + s + "»" : "";
  }

  function readPgError(err) {
    var src = err || {};
    var message = String(src.message || err || "");
    var details = String(src.details || "");
    var hint = String(src.hint || "");
    var blob = [message, details, hint].join(" ");
    var constraint = String(src.constraint || "");
    if (!constraint) {
      var named = blob.match(/(?:unique|foreign key|check|exclusion) constraint "([^"]+)"/i);
      if (named) constraint = named[1];
    }
    var column = "";
    var columnMatch = blob.match(/column "([^"]+)"/i);
    if (columnMatch) column = columnMatch[1];
    var fkTable = "";
    var tableMatch = blob.match(/not present in table "([^"]+)"/i) || blob.match(/on table "([^"]+)"/i);
    if (tableMatch) fkTable = tableMatch[1];
    return {
      message: message,
      code: String(src.code || ""),
      details: details,
      hint: hint,
      constraint: constraint,
      column: column,
      fkTable: fkTable,
    };
  }

  function subjectLine(context) {
    var op = operationLabel(context && context.operation);
    var name = quoteLabel(context && context.name);
    var id = !name && context && context.id ? " " + quoteLabel(context.id) : "";
    return "Không thực hiện được: " + op + (name ? " " + name : id) + ".";
  }

  /**
   * Map Supabase/Postgres errors to a short Vietnamese reason + what to do.
   * Raw code, constraint, and message stay on the thrown error and in the console.
   */
  function explainProductCrudError(err, context) {
    context = context || {};
    var pg = readPgError(err);
    var code = pg.code;
    var constraint = pg.constraint;
    var blob = (pg.message + " " + pg.details + " " + constraint).toLowerCase();
    var reason = "";
    var action = "";

    if (code === "VALIDATION") {
      reason = pg.message || "Dữ liệu sản phẩm chưa hợp lệ.";
      action = "Điền các mục còn thiếu trên form rồi bấm Lưu.";
    } else if (/row-level security|\brls\b/.test(blob) || code === "42501") {
      var who = context.email ? " Email đang đăng nhập: " + context.email + "." : "";
      reason = "Supabase từ chối ghi vì chính sách quyền (RLS)." + who;
      action =
        "Đăng nhập bằng email admin. Nếu đúng email rồi vẫn lỗi, thêm email đó vào tlkv_admin_emails() trong supabase/tlkv-admin-rls.sql rồi chạy lại trên SQL Editor.";
    } else if (code === "23505" && /price_source_weight/.test(constraint + blob)) {
      var source = quoteLabel(context.priceSourceProduct) || "dòng bảng giá đã chọn";
      var weight = context.weight != null && context.weight !== "" ? String(context.weight) + " chỉ" : "cùng khối lượng";
      reason = "Đã có sản phẩm khác dùng " + source + " với " + weight + ".";
      action = "Đổi định lượng, chọn dòng bảng giá khác, hoặc sửa sản phẩm đang dùng cặp này.";
    } else if (code === "23505" && /slug/.test(constraint + blob)) {
      reason = "Đường dẫn sản phẩm đã tồn tại" + (context.slug ? " (" + context.slug + ")" : "") + ".";
      action = "Đổi tên sản phẩm rồi lưu lại. Hệ thống sẽ tạo đường dẫn mới.";
    } else if (code === "23505" && /pkey|products_pkey|_pk\b/.test(constraint + blob)) {
      reason = "Mã sản phẩm đã có trong database.";
      action = "Tải lại trang /admin rồi thêm sản phẩm mới, không giữ mã cũ.";
    } else if (code === "23505" && /thumbnail|product_images/.test(constraint + blob)) {
      reason = "Sản phẩm đã có một ảnh đại diện.";
      action = "Tải lại trang, mở lại sản phẩm và lưu ảnh một lần nữa.";
    } else if (code === "23505") {
      reason = "Dữ liệu bị trùng một ràng buộc duy nhất" + (constraint ? " (" + constraint + ")" : "") + ".";
      action = "Đổi tên, đường dẫn, hoặc dòng bảng giá rồi lưu lại. Nếu vẫn lỗi, gửi mã ở cuối thông báo.";
    } else if (code === "23503" && (/brand/.test(constraint + blob) || pg.fkTable === "brands")) {
      reason = "Thương hiệu đã chọn không còn trong hệ thống.";
      action = "Chọn lại thương hiệu trong danh sách rồi lưu.";
    } else if (code === "23503" && (/categor/.test(constraint + blob) || pg.fkTable === "categories")) {
      reason = "Danh mục đã chọn không còn trong hệ thống.";
      action = "Chọn lại danh mục rồi lưu.";
    } else if (code === "23503" && (/price_row|gold_price/.test(constraint + blob) || pg.fkTable === "gold_price_rows")) {
      reason = "Dòng bảng giá liên kết không còn tồn tại.";
      action = "Chọn lại dòng bảng giá, hoặc chọn «Chưa liên kết» nếu muốn nhập giá tay.";
    } else if (code === "23503") {
      reason = "Không xóa hoặc không lưu được vì còn dữ liệu liên quan" + (pg.fkTable ? " (bảng " + pg.fkTable + ")" : "") + ".";
      action =
        context.operation === "delete"
          ? "Ẩn sản phẩm thay vì xóa, hoặc gỡ dữ liệu đang trỏ tới sản phẩm này."
          : "Chọn lại thương hiệu, danh mục và dòng bảng giá rồi lưu.";
    } else if (code === "23502") {
      reason = "Thiếu dữ liệu bắt buộc" + (pg.column ? " (cột " + pg.column + ")" : "") + ".";
      action = "Điền tên, thương hiệu và danh mục. Nếu là link giá, chọn dòng bảng giá.";
    } else if (code === "23514") {
      reason = "Giá trị không đúng quy tắc của bảng sản phẩm" + (constraint ? " (" + constraint + ")" : "") + ".";
      action = "Kiểm tra định lượng (số chỉ > 0) và dòng bảng giá rồi lưu lại.";
    } else if (code === "22003") {
      reason = "Định lượng hoặc giá vượt quá giới hạn lưu được (tối đa 9999.9 chỉ).";
      action = "Nhập lại số chỉ nhỏ hơn, ví dụ 0.1, 1 hoặc 10.";
    } else if (code === "22P02") {
      reason = "Thương hiệu, danh mục hoặc dòng bảng giá không đúng định dạng.";
      action = "Chọn lại từ danh sách thả xuống, không dán mã tay.";
    } else if (code === "42703" || code === "42P01" || code === "PGRST204") {
      reason = "Bảng hoặc cột sản phẩm trên Supabase chưa khớp code.";
      action = "Chạy các file SQL trong supabase/migrations trên SQL Editor, rồi tải lại trang.";
    } else if (/jwt|invalid claim|session|not authenticated|auth session missing/i.test(blob) || code === "PGRST301") {
      reason = "Phiên đăng nhập admin đã hết hạn hoặc không hợp lệ.";
      action = "Tải lại /admin và đăng nhập lại, rồi thử lưu.";
    } else if (/failed to fetch|network|timeout|load failed/i.test(blob)) {
      reason = "Không kết nối được tới Supabase.";
      action = "Kiểm tra mạng, rồi thử lại. Nếu vừa deploy, đợi vài giây và tải lại trang.";
    } else if (pg.message) {
      reason = pg.message;
      action = "Mở Console (F12 → Console), tìm dòng [TLKVProducts], rồi gửi nguyên khối log đó khi báo lỗi.";
    } else {
      reason = "Lỗi không xác định từ Supabase.";
      action = "Mở Console (F12) và gửi dòng [TLKVProducts].";
    }

    if (context.operation === "sync_image") {
      reason = "Sản phẩm đã được ghi. Ảnh đại diện chưa lưu. " + reason;
      action = "Tải lại trang, mở lại sản phẩm và lưu ảnh lần nữa. " + action;
    }

    var debugBits = [];
    if (code) debugBits.push("Mã " + code);
    if (constraint) debugBits.push(constraint);
    var userMessage = [subjectLine(context), reason, "Cách xử lý: " + action];
    if (debugBits.length) userMessage.push(debugBits.join(" · "));

    return {
      title: operationLabel(context.operation) + " thất bại",
      userMessage: userMessage.filter(Boolean).join("\n"),
      reason: reason,
      action: action,
      code: code,
      constraint: constraint,
      details: pg.details,
      hint: pg.hint,
      rawMessage: pg.message,
    };
  }

  function throwProductCrudError(err, context) {
    if (err && err.name === "ProductCrudError") throw err;
    context = context || {};
    var explained = explainProductCrudError(err, context);
    var error = new Error(explained.userMessage);
    error.name = "ProductCrudError";
    error.code = explained.code;
    error.constraint = explained.constraint;
    error.details = explained.details;
    error.hint = explained.hint;
    error.reason = explained.reason;
    error.action = explained.action;
    error.operation = context.operation || "";
    error.cause = err && err instanceof Error ? err : undefined;
    error.debug = {
      operation: context.operation || "",
      productId: context.id || "",
      name: context.name || "",
      slug: context.slug || "",
      weight: context.weight != null ? context.weight : null,
      priceSourceProduct: context.priceSourceProduct || "",
      priceRowId: context.priceRowId || "",
      brandId: context.brandId || "",
      categoryId: context.categoryId || "",
      email: context.email || "",
      code: explained.code,
      constraint: explained.constraint,
      details: explained.details,
      hint: explained.hint,
      rawMessage: explained.rawMessage,
    };
    console.error("[TLKVProducts] " + explained.title, error.debug);
    throw error;
  }

  global.TLKVProductCrud = {
    PRODUCT_PUBLIC_SELECT: PRODUCT_PUBLIC_SELECT,
    validateForSave: validateForSave,
    resolveProductId: resolveProductId,
    explainProductCrudError: explainProductCrudError,
    throwProductCrudError: throwProductCrudError,
  };
})(typeof window !== "undefined" ? window : globalThis);
