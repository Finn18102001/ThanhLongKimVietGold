/**
 * TLKVNewsFormLifecycle — central state machine for News CMS form/editor/upload/submit.
 *
 * Subsystems are independent; submit readiness derives from form:ready only (not editor).
 */
(function (global) {
  "use strict";

  var EDITOR_MOUNT_TIMEOUT_MS = 30000;

  var sessionId = 0;
  var formData = null;
  var lifecycle = {
    form: "idle",
    editor: "idle",
    upload: "idle",
    submit: "idle",
  };
  var changeListeners = [];

  function log(tag) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (args.length <= 1) console.log("[" + tag + "]", args[0]);
    else console.log("[" + tag + "]", args);
  }

  function notify() {
    changeListeners.forEach(function (fn) {
      try { fn(); } catch (e) { console.error("[FORM] onChange error:", e); }
    });
  }

  function setLifecycle(patch) {
    var changed = false;
    Object.keys(patch).forEach(function (k) {
      if (lifecycle[k] !== patch[k]) {
        lifecycle[k] = patch[k];
        changed = true;
      }
    });
    if (changed) {
      log("FORM", "lifecycle", Object.assign({}, lifecycle));
      notify();
    }
  }

  function beginSession() {
    sessionId += 1;
    formData = null;
    lifecycle = { form: "mounting", editor: "idle", upload: "idle", submit: "idle" };
    log("FORM", "beginSession", { sessionId: sessionId });
    notify();
    return sessionId;
  }

  function endSession() {
    log("FORM", "endSession", { sessionId: sessionId });
    sessionId += 1;
    formData = null;
    lifecycle = { form: "destroyed", editor: "idle", upload: "idle", submit: "idle" };
    notify();
  }

  function isStale(id) {
    return id !== sessionId;
  }

  function getSessionId() {
    return sessionId;
  }

  function initFormData(data) {
    formData = Object.assign({}, data);
    log("FORM", "initFormData", { id: formData.id });
    return formData;
  }

  function getFormData() {
    return formData ? Object.assign({}, formData) : null;
  }

  function patchFormData(patch) {
    if (!formData) {
      console.warn("[FORM] patchFormData called with no formData");
      return null;
    }
    formData = Object.assign({}, formData, patch);
    return formData;
  }

  function setForm(state) {
    setLifecycle({ form: state });
  }

  function setEditor(state) {
    setLifecycle({ editor: state });
  }

  function setUpload(state) {
    setLifecycle({ upload: state });
  }

  function setSubmit(state) {
    setLifecycle({ submit: state });
  }

  function getLifecycle() {
    return Object.assign({}, lifecycle);
  }

  function isUploading() {
    return lifecycle.upload === "uploading";
  }

  function canSubmit() {
    if (lifecycle.form !== "ready") {
      return {
        ok: false,
        reason: lifecycle.form === "mounting"
          ? "Form đang tải, vui lòng đợi…"
          : "Form chưa sẵn sàng.",
      };
    }
    if (!formData) {
      return { ok: false, reason: "Không có dữ liệu form." };
    }
    if (lifecycle.submit === "validating" || lifecycle.submit === "saving") {
      return { ok: false, reason: "Đang lưu…" };
    }
    return { ok: true, reason: null };
  }

  function onChange(fn) {
    if (typeof fn === "function") changeListeners.push(fn);
  }

  /**
   * Mount Editor.js with timeout; sets editor lifecycle to mounting → ready|failed.
   * @param {function} mountFn — (opts) => Promise<editorInstance>
   */
  async function mountEditorWithTimeout(mountFn, opts, timeoutMs) {
    timeoutMs = timeoutMs || EDITOR_MOUNT_TIMEOUT_MS;
    setEditor("mounting");
    log("EDITOR", "mounting", { timeoutMs: timeoutMs });

    var timer;
    try {
      var instance = await Promise.race([
        Promise.resolve().then(function () { return mountFn(opts); }),
        new Promise(function (_, reject) {
          timer = setTimeout(function () {
            reject(new Error("Editor mount timeout (" + Math.round(timeoutMs / 1000) + "s)"));
          }, timeoutMs);
        }),
      ]);
      clearTimeout(timer);
      setEditor("ready");
      log("EDITOR", "ready");
      return instance;
    } catch (e) {
      if (timer) clearTimeout(timer);
      setEditor("failed");
      log("EDITOR", "failed", e && e.message ? e.message : e);
      throw e;
    }
  }

  global.TLKVNewsFormLifecycle = {
    beginSession: beginSession,
    endSession: endSession,
    isStale: isStale,
    getSessionId: getSessionId,
    initFormData: initFormData,
    getFormData: getFormData,
    patchFormData: patchFormData,
    setForm: setForm,
    setEditor: setEditor,
    setUpload: setUpload,
    setSubmit: setSubmit,
    getLifecycle: getLifecycle,
    canSubmit: canSubmit,
    isUploading: isUploading,
    mountEditorWithTimeout: mountEditorWithTimeout,
    onChange: onChange,
    log: log,
  };
})(typeof window !== "undefined" ? window : globalThis);
