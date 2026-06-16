/**
 * Centralized admin UI visibility — email-based access split (not RBAC).
 * Always resolve access via Supabase auth.getUser() (server-validated session).
 *
 * Design constraints:
 * - freeze object: access snapshots + public API are Object.freeze'd
 * - action guards: guardAction(module) before mutations
 * - reduce globals: one window.TLKVAdminAccess namespace; session held module-internally
 */
(function (global) {
  "use strict";

  var GOLD_SHOP_EMAIL = "thanglongkimviet@gmail.com";
  /** @type {Readonly<ReturnType<typeof buildAccess>> | null} */
  var currentAccess = null;

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function isGoldShopAccount(emailOrUser) {
    var email =
      typeof emailOrUser === "string"
        ? emailOrUser
        : emailOrUser && emailOrUser.email;
    return normalizeEmail(email) === GOLD_SHOP_EMAIL;
  }

  function buildAccess(user) {
    if (!user || !user.email) {
      return {
        email: null,
        isGoldShop: false,
        canAccessGoldManagement: false,
        canAccessContentManagement: false,
      };
    }

    var email = normalizeEmail(user.email);
    var isGoldShop = email === GOLD_SHOP_EMAIL;

    return {
      email: email,
      isGoldShop: isGoldShop,
      canAccessGoldManagement: isGoldShop,
      canAccessContentManagement: !isGoldShop,
    };
  }

  function freezeAccess(access) {
    return Object.freeze(buildAccess(access && access.email ? access : null));
  }

  /**
   * @param {import("@supabase/supabase-js").User | { email?: string } | null | undefined} user
   */
  function resolveFromUser(user) {
    return freezeAccess(buildAccess(user));
  }

  /**
   * Validates the current session with Supabase (never localStorage-only).
   * @param {import("@supabase/supabase-js").SupabaseClient | null | undefined} sb
   */
  async function resolveFromSupabase(sb) {
    if (!sb || typeof sb.auth.getUser !== "function") {
      return resolveFromUser(null);
    }

    try {
      var userRes = await sb.auth.getUser();
      if (userRes.error) {
        return resolveFromUser(null);
      }
      return resolveFromUser(userRes.data && userRes.data.user);
    } catch (_) {
      return resolveFromUser(null);
    }
  }

  function setCurrentAccess(access) {
    currentAccess =
      access && access.email ? freezeAccess(access) : null;
  }

  function getCurrentAccess() {
    return currentAccess;
  }

  function clearCurrentAccess() {
    currentAccess = null;
  }

  function canAccessGoldManagement(userOrAccess) {
    var access =
      userOrAccess && typeof userOrAccess.canAccessGoldManagement === "boolean"
        ? userOrAccess
        : resolveFromUser(userOrAccess);
    return access.canAccessGoldManagement;
  }

  function canAccessContentManagement(userOrAccess) {
    var access =
      userOrAccess && typeof userOrAccess.canAccessContentManagement === "boolean"
        ? userOrAccess
        : resolveFromUser(userOrAccess);
    return access.canAccessContentManagement;
  }

  /** @typedef {"gold" | "products" | "news"} AdminModule */

  /**
   * @param {Readonly<ReturnType<typeof buildAccess>> | null | undefined} access
   * @param {AdminModule} module
   */
  function canAccessModule(access, module) {
    var resolved = access && access.email ? access : currentAccess;
    if (!resolved || !resolved.email) return false;
    if (module === "gold") return resolved.canAccessGoldManagement;
    if (module === "products" || module === "news") return resolved.canAccessContentManagement;
    return false;
  }

  /**
   * @param {Readonly<ReturnType<typeof buildAccess>> | null | undefined} access
   * @returns {"gold" | "products" | null}
   */
  function defaultModule(access) {
    var resolved = access && access.email ? access : currentAccess;
    if (!resolved || !resolved.email) return null;
    if (resolved.canAccessGoldManagement) return "gold";
    if (resolved.canAccessContentManagement) return "products";
    return null;
  }

  /**
   * Action guard — call before any admin mutation or protected read.
   * @param {AdminModule} module
   * @param {{ access?: Readonly<ReturnType<typeof buildAccess>>, onDenied?: function(): void }} [opts]
   */
  function guardAction(module, opts) {
    opts = opts || {};
    var access = opts.access || currentAccess;
    if (canAccessModule(access, module)) return true;
    if (typeof opts.onDenied === "function") opts.onDenied();
    return false;
  }

  function setNavItemVisible(el, visible) {
    if (!el) return;
    el.hidden = !visible;
    el.setAttribute("aria-hidden", visible ? "false" : "true");
    if (visible) el.removeAttribute("tabindex");
    else el.setAttribute("tabindex", "-1");
  }

  /**
   * Hide/show main dashboard tab navigation based on resolved access.
   * @param {Readonly<ReturnType<typeof buildAccess>>} access
   */
  function applyMainAdminNavVisibility(access) {
    var showGold = canAccessModule(access, "gold");
    var showContent = canAccessModule(access, "products");

    setNavItemVisible(document.getElementById("tab-btn-gold"), showGold);
    setNavItemVisible(document.getElementById("tab-btn-products"), showContent);
    setNavItemVisible(document.getElementById("tab-btn-news"), showContent);
  }

  /**
   * Route guard for /admin/news.html — redirect gold-shop account to main dashboard.
   * @param {Readonly<ReturnType<typeof buildAccess>>} access
   * @param {{ redirectTo?: string }} [opts]
   */
  function guardNewsPageAccess(access, opts) {
    if (canAccessModule(access, "news")) return true;
    var target = (opts && opts.redirectTo) || "/admin/";
    global.location.replace(target);
    return false;
  }

  global.TLKVAdminAccess = Object.freeze({
    GOLD_SHOP_EMAIL: GOLD_SHOP_EMAIL,
    normalizeEmail: normalizeEmail,
    isGoldShopAccount: isGoldShopAccount,
    canAccessGoldManagement: canAccessGoldManagement,
    canAccessContentManagement: canAccessContentManagement,
    resolveFromUser: resolveFromUser,
    resolveFromSupabase: resolveFromSupabase,
    setCurrentAccess: setCurrentAccess,
    getCurrentAccess: getCurrentAccess,
    clearCurrentAccess: clearCurrentAccess,
    canAccessModule: canAccessModule,
    defaultModule: defaultModule,
    guardAction: guardAction,
    applyMainAdminNavVisibility: applyMainAdminNavVisibility,
    guardNewsPageAccess: guardNewsPageAccess,
  });
})(typeof window !== "undefined" ? window : globalThis);
