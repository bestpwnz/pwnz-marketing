(function () {
  var accordion = document.getElementById('expertise-panel');
  if (!accordion) return;

  var headers = accordion.querySelectorAll('.expertise-item-header');
  var bodies = accordion.querySelectorAll('.expertise-item-body');

  function expand(index) {
    var i = parseInt(index, 10);
    if (i < 0 || i >= headers.length) return;
    headers.forEach(function (h, j) {
      var open = j === i;
      h.classList.toggle('is-expanded', open);
      h.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (bodies[j]) {
        bodies[j].classList.toggle('is-expanded', open);
      }
    });
  }

  // Click: open clicked item, close others
  headers.forEach(function (header, index) {
    header.addEventListener('click', function () {
      expand(index);
    });
  });

  // Scroll: when a header scrolls into view, expand that item (optional accordion-by-scroll)
  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var header = entry.target;
        var idx = header.getAttribute('data-index');
        if (idx !== null) expand(parseInt(idx, 10));
      });
    },
    { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
  );
  headers.forEach(function (h) {
    observer.observe(h);
  });
})();
