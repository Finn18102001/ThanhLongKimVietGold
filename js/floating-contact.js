/**
 * Floating contact sidebar — data-driven, fixed left.
 * Skips tv-model and admin pages.
 */
(function (global) {
  "use strict";

  var MOUNT_ID = "tlkv-float-contact-root";

  var FLOAT_CONTACT_ITEMS = [
    {
      id: "facebook",
      type: "icon",
      href: "https://www.facebook.com/profile.php?id=61589525696826",
      target: "_blank",
      rel: "noopener noreferrer",
      ariaLabel: "Facebook Thăng Long Kim Việt",
      icon: "facebook",
    },
    {
      id: "messenger",
      type: "icon",
      href: "https://m.me/1076166245588709",
      target: "_blank",
      rel: "noopener noreferrer",
      ariaLabel: "Nhắn tin Messenger Thăng Long Kim Việt",
      iconSrc: "/assets/icon-message.png",
    },
    {
      id: "zalo",
      type: "icon",
      href: "https://zalo.me/0995682568",
      target: "_blank",
      rel: "noopener noreferrer",
      ariaLabel: "Chat Zalo Thăng Long Kim Việt",
      iconSrc: "/assets/icon-zalo.svg",
    },
    {
      id: "hotline",
      type: "hotline",
      href: "tel:0995682568",
      ariaLabel: "Gọi tổng đài vàng trang sức 099 568 2568",
      label: "TỔNG ĐÀI VÀNG TRANG SỨC",
      phone: "099 568 2568",
    },
  ];

  function shouldMount() {
    var path = (global.location && global.location.pathname) || "";
    if (/\/admin(\/|$)/.test(path)) return false;
    if (document.documentElement.classList.contains("tlkv-tv-model-page")) return false;
    if (document.getElementById(MOUNT_ID)) return false;
    return true;
  }

  function facebookIconSvg() {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var path = document.createElementNS(ns, "path");
    path.setAttribute(
      "fill",
      "currentColor"
    );
    path.setAttribute(
      "d",
      "M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"
    );
    svg.appendChild(path);
    return svg;
  }

  function createIconButton(item) {
    var a = document.createElement("a");
    a.className = "tlkv-float-contact__btn tlkv-float-contact__btn--icon";
    a.href = item.href;
    a.setAttribute("aria-label", item.ariaLabel);
    if (item.target) a.target = item.target;
    if (item.rel) a.rel = item.rel;

    var wrap = document.createElement("span");
    wrap.className = "tlkv-float-contact__icon";

    if (item.icon === "facebook") {
      wrap.classList.add("tlkv-float-contact__icon--facebook");
      wrap.appendChild(facebookIconSvg());
    } else if (item.iconSrc) {
      if (item.id === "messenger") wrap.classList.add("tlkv-float-contact__icon--messenger");
      if (item.id === "zalo") wrap.classList.add("tlkv-float-contact__icon--zalo");
      var img = document.createElement("img");
      img.src = item.iconSrc;
      img.alt = "";
      img.width = 28;
      img.height = 28;
      img.decoding = "async";
      wrap.appendChild(img);
    }

    a.appendChild(wrap);
    return a;
  }

  function createHotlineButton(item) {
    var a = document.createElement("a");
    a.className = "tlkv-float-contact__btn tlkv-float-contact__btn--hotline";
    a.href = item.href;
    a.setAttribute("aria-label", item.ariaLabel);

    var label = document.createElement("span");
    label.className = "tlkv-float-contact__hotline-label";
    label.textContent = item.label;

    var phone = document.createElement("span");
    phone.className = "tlkv-float-contact__hotline-phone";
    phone.textContent = item.phone;

    a.appendChild(label);
    a.appendChild(phone);
    return a;
  }

  function createItemNode(item) {
    var li = document.createElement("li");
    li.className = "tlkv-float-contact__item";
    li.setAttribute("data-float-id", item.id);

    var btn =
      item.type === "hotline" ? createHotlineButton(item) : createIconButton(item);
    li.appendChild(btn);
    return li;
  }

  function mount() {
    if (!shouldMount()) return;

    var nav = document.createElement("nav");
    nav.id = MOUNT_ID;
    nav.className = "tlkv-float-contact";
    nav.setAttribute("aria-label", "Liên hệ nhanh");

    var list = document.createElement("ul");
    list.className = "tlkv-float-contact__list";
    list.setAttribute("role", "list");

    FLOAT_CONTACT_ITEMS.map(createItemNode).forEach(function (li) {
      list.appendChild(li);
    });

    nav.appendChild(list);
    document.body.appendChild(nav);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  global.TLKVFloatContact = {
    items: FLOAT_CONTACT_ITEMS,
    remount: function () {
      var el = document.getElementById(MOUNT_ID);
      if (el) el.remove();
      mount();
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
