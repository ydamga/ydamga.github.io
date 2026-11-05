// Kedi Odası'nın sahnesi: pencereden görünen gökyüzü (günün saatine göre), süsler (akademik takvimdeki
// tatiller, yılbaşı, mevsim) ve haftalık hedefle kazanılan eşyalar. Durum bilmez; kedi/oda.js çağırır.
(function () {
  var ESYA_SVG = {
    agac: '<svg viewBox="0 0 60 120"><rect x="6" y="112" width="48" height="8" rx="3" fill="#B98A5E"/><rect x="25" y="20" width="10" height="94" fill="#D9C2A0"/>' +
      '<path d="M25 30h10M25 42h10M25 54h10M25 66h10M25 78h10M25 90h10M25 102h10" stroke="#BFA27C" stroke-width="2"/>' +
      '<rect x="4" y="58" width="34" height="7" rx="3" fill="#B98A5E"/><rect x="24" y="14" width="34" height="7" rx="3" fill="#B98A5E"/>' +
      '<circle cx="12" cy="72" r="4" fill="#E7808F"/><path d="M12 65v3" stroke="#8A6A4F" stroke-width="1.5"/></svg>',
    bitki: '<svg viewBox="0 0 40 56"><path d="M9 36h22l-3 20H12z" fill="#C9744C"/><rect x="7" y="33" width="26" height="5" rx="2" fill="#B5643F"/>' +
      '<path d="M20 34C20 22 12 16 6 14c2 9 7 15 14 20zM20 34c0-14 8-22 14-24-1 11-6 19-14 24zM20 34c-1-12 1-24 0-32 4 8 5 20 0 32z" fill="#4FA36A"/></svg>',
    tablo: '<svg viewBox="0 0 56 42"><rect x="1" y="1" width="54" height="40" rx="3" fill="#B98A5E"/><rect x="5" y="5" width="46" height="32" fill="#CFE8F2"/>' +
      '<path d="M14 21c6-8 16-8 22 0-6 8-16 8-22 0zM36 21l8-6v12z" fill="#E39B5B"/><circle cx="19" cy="20" r="1.4" fill="#2B2420"/></svg>',
    hali: '<svg viewBox="0 0 200 30"><ellipse cx="100" cy="15" rx="98" ry="13" fill="#C98FA8" opacity="0.55"/><ellipse cx="100" cy="15" rx="78" ry="9" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="6 5" opacity="0.6"/></svg>',
    lamba: '<svg viewBox="0 0 40 130"><path d="M8 4h24l6 26H2z" fill="#F2D27A"/><rect x="18" y="30" width="4" height="92" fill="#8A6A4F"/><ellipse cx="20" cy="124" rx="14" ry="5" fill="#8A6A4F"/></svg>',
    sepet: '<svg viewBox="0 0 50 34"><circle cx="16" cy="12" r="9" fill="#8A5CD6"/><circle cx="31" cy="11" r="8" fill="#E7808F"/><path d="M14 6c4 3 5 9 2 14M29 5c3 4 4 9 1 13" stroke="#fff" stroke-width="1.2" fill="none" opacity="0.6"/>' +
      '<path d="M4 16h42l-4 16H8z" fill="#C49A6C"/><path d="M8 20h34M9 25h32" stroke="#A47C50" stroke-width="1.5"/></svg>'
  };

  // Pencerenin içine konan süs (gökyüzünün önünde)
  var PENCERE_SUS = {
    bahar: '<circle cx="18" cy="88" r="5" fill="#F3AAB4"/><circle cx="34" cy="90" r="4" fill="#F2D27A"/><circle cx="74" cy="88" r="5" fill="#F3AAB4"/><circle cx="88" cy="90" r="4" fill="#fff"/>' +
      '<path d="M10 96h90" stroke="#4FA36A" stroke-width="4"/>',
    yaz: '<circle cx="76" cy="24" r="12" fill="#F7C948"/>',
    sonbahar: '<path d="M20 20l5 3-2 6-6-2z" fill="#E08A3C"/><path d="M62 44l5 3-2 6-6-2z" fill="#C9583A"/><path d="M84 70l5 3-2 6-6-2z" fill="#E8B923"/><path d="M34 74l5 3-2 6-6-2z" fill="#E08A3C"/>',
    kis: '<g fill="#fff" opacity="0.9"><circle cx="14" cy="18" r="2"/><circle cx="40" cy="34" r="1.6"/><circle cx="70" cy="14" r="2"/><circle cx="88" cy="40" r="1.6"/><circle cx="24" cy="58" r="2"/><circle cx="58" cy="66" r="1.6"/><circle cx="82" cy="80" r="2"/></g>',
    yilbasi: '<g fill="#fff" opacity="0.9"><circle cx="14" cy="18" r="2"/><circle cx="70" cy="14" r="2"/><circle cx="24" cy="58" r="2"/><circle cx="82" cy="80" r="2"/></g>' +
      '<path d="M50 30l12 22h-6l9 16H35l9-16h-6z" fill="#3FA66B"/><rect x="47" y="68" width="6" height="8" fill="#8A6A4F"/><circle cx="50" cy="28" r="3" fill="#F7C948"/>'
  };
  var AY = '<path d="M72 12a12 12 0 1 0 10 20 10 10 0 1 1-10-20z" fill="#F4EFC8"/>';

  // Odanın tepesine asılan süsler (tatil ve yılbaşı)
  function girland(renkler, sekil) {
    var g = '<svg viewBox="0 0 400 40" preserveAspectRatio="none"><path d="M0 4Q200 34 400 4" stroke="#8A6A4F" stroke-width="1.5" fill="none"/>';
    for (var i = 0; i < 13; i++) {
      var x = 16 + i * 30, y = 4 + 30 * (1 - Math.pow((x - 200) / 200, 2)) * 0.97;
      var r = renkler[i % renkler.length];
      if (sekil === 'bayrak') g += '<path d="M' + (x - 9) + ' ' + y + 'h18l-9 16z" fill="' + r + '"/>';
      else if (sekil === 'fener') g += '<rect x="' + (x - 5) + '" y="' + (y + 2) + '" width="10" height="13" rx="4" fill="' + r + '"/><rect x="' + (x - 3) + '" y="' + y + '" width="6" height="3" fill="#8A6A4F"/>';
      else g += '<circle cx="' + x + '" cy="' + (y + 5) + '" r="4.5" fill="' + r + '"/>';
    }
    return g + '</svg>';
  }
  var TAVAN_SUS = {
    bayrak: function () { return girland(['#E30A17', '#fff'], 'bayrak'); },
    bayram: function () { return girland(['#F2C94C', '#E39B5B', '#3FA66B'], 'fener'); },
    yilbasi: function () { return girland(['#E0605E', '#F2C94C', '#3D7DD8', '#3FA66B'], 'isik'); }
  };

  function katman(oda, sinif) {
    var el = oda.querySelector('.' + sinif);
    if (!el) {
      el = document.createElement('div');
      el.className = sinif;
      el.setAttribute('aria-hidden', 'true');
      // Kedinin arkasında kalsın
      oda.insertBefore(el, oda.querySelector('.oda-zemin'));
    }
    return el;
  }

  window.KediSahne = {
    // durum: { dilim: 'sabah'|'gunduz'|'aksam'|'gece', sus: { kod, ad }, esyalar: [{ kod, ad }] }
    ciz: function (oda, durum) {
      oda.dataset.dilim = durum.dilim;
      oda.dataset.sus = durum.sus ? durum.sus.kod : '';

      var pencere = oda.querySelector('.oda-pencere');
      var ic = (durum.dilim === 'gece' ? AY : '') + ((durum.sus && PENCERE_SUS[durum.sus.kod]) || '');
      var ps = pencere.querySelector('svg');
      if (!ps) { ps = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); ps.setAttribute('viewBox', '0 0 100 100'); ps.setAttribute('preserveAspectRatio', 'none'); pencere.appendChild(ps); }
      if (ps.dataset.icerik !== ic) { ps.innerHTML = ic; ps.dataset.icerik = ic; }

      var tavan = katman(oda, 'oda-tavan');
      var t = durum.sus && TAVAN_SUS[durum.sus.kod] ? TAVAN_SUS[durum.sus.kod]() : '';
      if (tavan.dataset.kod !== (durum.sus && durum.sus.kod)) { tavan.innerHTML = t; tavan.dataset.kod = durum.sus ? durum.sus.kod : ''; }

      var esyaKat = katman(oda, 'oda-esyalar');
      var kodlar = (durum.esyalar || []).map(function (e) { return e.kod; }).join(',');
      if (esyaKat.dataset.kodlar !== kodlar) {
        esyaKat.dataset.kodlar = kodlar;
        esyaKat.innerHTML = '';
        (durum.esyalar || []).forEach(function (e) {
          var d = document.createElement('div');
          d.className = 'oda-esya-kazanc esya-' + e.kod;
          d.title = e.ad;
          d.innerHTML = ESYA_SVG[e.kod] || '';
          esyaKat.appendChild(d);
        });
      }
    }
  };
})();
