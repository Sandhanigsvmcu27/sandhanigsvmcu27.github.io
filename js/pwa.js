/* Sandhani GSVMC Unit — PWA: service worker registration + install button.
   Wrapped in an IIFE so nothing leaks into the global scope (app.js owns
   top-level names like Auth, SB, GROUPS — see the signup bug postmortem). */
(function () {
  'use strict';

  function rootPath() {
    var p = window.location.pathname;
    var i = p.indexOf('/member/');
    if (i >= 0) return p.slice(0, i + 1);
    return p.slice(0, p.lastIndexOf('/') + 1);
  }

  /* ---------- service worker ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(rootPath() + 'sw.js', { scope: rootPath() })
        .catch(function () { /* PWA is an enhancement; site works without it */ });
    });
  }

  /* ---------- install button ---------- */
  var DISMISS_KEY = 'sandhaniPwaDismissedAt';
  function dismissedRecently() {
    try {
      var t = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
      return t && (Date.now() - t) < 30 * 24 * 60 * 60 * 1000;
    } catch (e) { return false; }
  }
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
  if (isStandalone() || dismissedRecently()) return;

  var isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
  var deferredPrompt = null;
  var pill = null, panel = null;

  function injectStyle() {
    if (document.getElementById('pwaStyle')) return;
    var s = document.createElement('style');
    s.id = 'pwaStyle';
    s.textContent =
      '.pwa-pill{position:fixed;left:14px;bottom:18px;z-index:1300;display:flex;align-items:center;gap:8px;background:#d32f2f;color:#fff;border:none;border-radius:999px;padding:11px 16px;font-family:inherit;font-size:15px;font-weight:700;box-shadow:0 4px 16px rgba(0,0,0,.3);cursor:pointer}' +
      '.pwa-pill .x{font-weight:400;opacity:.85;padding:0 2px}' +
      '@media (max-width:640px){.pwa-pill{bottom:88px}}' +
      '.pwa-panel{position:fixed;left:14px;right:14px;bottom:80px;z-index:1301;background:#fff;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.30);padding:18px;font-size:15px;line-height:1.65;display:none}' +
      '.pwa-panel.show{display:block}' +
      '.pwa-panel h4{margin-bottom:6px;font-size:16px}' +
      '.pwa-panel .close{margin-top:12px;background:#1565c0;color:#fff;border:none;border-radius:9px;padding:9px 18px;font-family:inherit;font-weight:700;cursor:pointer}' +
      '@media (max-width:640px){.pwa-panel{bottom:146px}}';
    document.head.appendChild(s);
  }

  function showPill() {
    if (pill || isStandalone()) return;
    injectStyle();
    pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'pwa-pill';
    pill.innerHTML = '📲 অ্যাপ ইনস্টল করুন <span class="x" aria-label="বন্ধ করুন">✕</span>';
    pill.addEventListener('click', function (e) {
      if (e.target && e.target.classList.contains('x')) {
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (err) {}
        hidePill();
        return;
      }
      onInstallTap();
    });
    document.body.appendChild(pill);
  }
  function hidePill() { if (pill) { pill.remove(); pill = null; } }

  function showIOSHelp() {
    injectStyle();
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'pwa-panel';
      panel.innerHTML = '<h4>📲 আইফোনে অ্যাপ যোগ করুন</h4>' +
        'নিচের <strong>Share (⬆️)</strong> বোতামে চাপ দিন, তারপর <strong>“Add to Home Screen”</strong> বেছে নিন। হোম স্ক্রিনে সন্ধানীর অ্যাপ আইকন যোগ হয়ে যাবে।' +
        '<br><button type="button" class="close">বুঝেছি</button>';
      panel.querySelector('.close').addEventListener('click', function () { panel.classList.remove('show'); });
      document.body.appendChild(panel);
    }
    panel.classList.add('show');
  }

  function onInstallTap() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () { deferredPrompt = null; hidePill(); });
    } else if (isIOS) {
      showIOSHelp();
    }
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    showPill();
  });
  window.addEventListener('appinstalled', function () { hidePill(); });

  // iOS Safari has no beforeinstallprompt — show the button right away.
  if (isIOS && /safari/i.test(window.navigator.userAgent) && !/crios|fxios/i.test(window.navigator.userAgent)) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showPill);
    else showPill();
  }
})();
