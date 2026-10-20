// Sandhani — public pages mobile menu toggle + active page highlight
document.addEventListener('DOMContentLoaded', function () {
  var btn = document.getElementById('navToggle');
  var nav = document.getElementById('mainNav');
  if (!btn || !nav) return;
  btn.setAttribute('aria-expanded', 'false');
  function setOpen(o) {
    nav.classList.toggle('open', o);
    btn.setAttribute('aria-expanded', o ? 'true' : 'false');
    btn.textContent = o ? '✕' : '☰';
  }
  btn.addEventListener('click', function () { setOpen(!nav.classList.contains('open')); });
  nav.addEventListener('click', function (e) {
    if (e.target && e.target.tagName === 'A') setOpen(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setOpen(false);
  });
  // বর্তমান পেজের মেনু আইটেম হাইলাইট
  var page = location.pathname.split('/').pop() || 'index.html';
  if (page === '') page = 'index.html';
  nav.querySelectorAll('a').forEach(function (a) {
    if ((a.getAttribute('href') || '') === page) a.classList.add('active');
  });
});
