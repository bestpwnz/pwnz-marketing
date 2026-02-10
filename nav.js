(function () {
  var toggle = document.querySelector('.nav-toggle');
  var overlay = document.getElementById('nav-overlay');
  var drawer = document.getElementById('nav-drawer');
  var body = document.body;

  if (!toggle || !overlay || !drawer) return;

  function openNav() {
    body.classList.add('nav-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
    overlay.setAttribute('aria-hidden', 'false');
    drawer.setAttribute('aria-hidden', 'false');
  }

  function closeNav() {
    body.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    overlay.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('aria-hidden', 'true');
  }

  function isOpen() {
    return body.classList.contains('nav-open');
  }

  toggle.addEventListener('click', function () {
    if (isOpen()) closeNav();
    else openNav();
  });

  overlay.addEventListener('click', closeNav);

  var drawerClose = drawer.querySelector('.nav-drawer-close');
  if (drawerClose) drawerClose.addEventListener('click', closeNav);

  drawer.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', closeNav);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen()) closeNav();
  });
})();
