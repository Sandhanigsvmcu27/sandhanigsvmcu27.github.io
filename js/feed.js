// Public activity feed: photos.js-এর পুরনো এন্ট্রি + টিমের আপলোড করা DB কার্যক্রম (নতুন আগে)।
// প্রতিটি এন্ট্রি: { photos: [url,...], cat, title, dateText, place, desc, cap }
window.Feed = {
  staticList: function () {
    return (window.GALLERY_PHOTOS || []).map(function (p) {
      return { photos: [p.src], cat: p.cat, title: p.title, dateText: p.dateText, place: p.place, desc: p.desc, cap: p.cap };
    });
  },
  load: function (cb) {
    var base = this.staticList();
    var cfg = window.SANDHANI_SUPABASE || {};
    if (!cfg.url || !cfg.anon) { cb(base); return; }
    fetch(cfg.url + '/rest/v1/activities?select=title,cat,date_text,place,description,photos,created_at&order=created_at.desc', {
      headers: { apikey: cfg.anon, Authorization: 'Bearer ' + cfg.anon }
    }).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
      var db = (rows || []).map(function (a) {
        return {
          photos: a.photos || [], cat: a.cat || 'other', title: a.title,
          dateText: a.date_text || '', place: a.place || '',
          desc: a.description || '', cap: a.title || ''
        };
      }).filter(function (a) { return a.photos.length; });
      cb(db.concat(base));
    }).catch(function () { cb(base); });
  }
};
