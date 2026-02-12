(function () {
  var STORAGE_KEY = 'rekruteer-theme';

  function getTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function setTheme(value) {
    try {
      if (value) localStorage.setItem(STORAGE_KEY, value);
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  function applyTheme(value) {
    var html = document.documentElement;
    if (value === 'dark') html.setAttribute('data-theme', 'dark');
    else html.removeAttribute('data-theme');
  }

  // Apply saved theme immediately to avoid flash (script runs after DOM, so set as first line)
  var saved = getTheme();
  if (saved === 'dark') applyTheme('dark');

  function createToggle() {
    var headerInner = document.querySelector('.header-inner');
    if (!headerInner) return;

    var navToggle = headerInner.querySelector('.nav-toggle');
    if (!navToggle) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-toggle';
    btn.setAttribute('aria-label', document.documentElement.getAttribute('data-theme') === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    btn.innerHTML =
      '<span class="theme-icon-moon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg></span>' +
      '<span class="theme-icon-sun" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg></span>';

    btn.addEventListener('click', function () {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        applyTheme('');
        setTheme('');
      } else {
        applyTheme('dark');
        setTheme('dark');
      }
      btn.setAttribute('aria-label', document.documentElement.getAttribute('data-theme') === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      setTimeout(function () { btn.blur(); }, 2000);
    });

    headerInner.insertBefore(btn, navToggle);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createToggle);
  } else {
    createToggle();
  }
})();
