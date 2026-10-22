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

  // ভাসমান শুধু কল বোতাম (Premium pack 2026-10-22: FB/Messenger footer-এ সরানো হয়েছে)
  if (document.body.classList.contains('pub') && !document.querySelector('.float-social')) {
    var fs = document.createElement('div');
    fs.className = 'float-social';
    fs.innerHTML =
      '<a class="call" href="tel:+8801755085138" aria-label="জরুরি প্রয়োজনে কল করুন" title="জরুরি প্রয়োজনে কল করুন">📞</a>';
    document.body.appendChild(fs);
    // Footer-এর যোগাযোগ অংশে Messenger লিংক (FB লিংক আগেই আছে)
    var fc = document.querySelector('footer.site .fcontact');
    if (fc && !fc.querySelector('.msgr-link')) {
      var mp = document.createElement('p');
      mp.innerHTML = '<a class="msgr-link" href="https://m.me/sandhani.gsvmcu" target="_blank" rel="noopener">💬 Messenger-এ মেসেজ করুন</a>';
      fc.appendChild(mp);
    }
  }

  // Scroll fade-in (Premium pack) — section ও card ধীরে ভেসে ওঠে
  if (document.body.classList.contains('pub') && 'IntersectionObserver' in window) {
    var els = document.querySelectorAll('body.pub section, body.pub .card');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.06 });
    els.forEach(function (el) { el.classList.add('reveal'); io.observe(el); });
  }
});
