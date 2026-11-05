// Lazer oyunu: 10 saniye boyunca odada kırmızı bir nokta gezdirilir (fare, parmak ya da ok tuşları),
// kedi peşinden koşar. Nokta yerdeyken kedi ona yetişirse bir yakalama sayılır.
// KediLazer.oyna(odaEl, zeminEl, kedi) → Promise<yakalama sayısı>. Esc oyunu erken bitirir.
(function () {
  var SURE = 10000;
  var YAKALAMA_PX = 26;
  var BEKLEME = 700; // iki yakalama arası en az süre

  window.KediLazer = {
    oyna: function (oda, zemin, kedi) {
      return new Promise(function (bitti) {
        var katman = document.createElement('div');
        katman.className = 'lazer-katman';
        katman.tabIndex = 0;
        katman.setAttribute('role', 'application');
        katman.setAttribute('aria-label', 'Lazer oyunu: noktayı fareyle, parmağınla ya da ok tuşlarıyla gezdir. Esc ile bitir.');
        katman.innerHTML = '<span class="lazer-nokta"></span><div class="lazer-bilgi"><b class="lazer-sayi">0</b> yakalama · <span class="lazer-sure">10</span> sn</div>';
        oda.appendChild(katman);
        var nokta = katman.querySelector('.lazer-nokta');
        var sayiEl = katman.querySelector('.lazer-sayi');
        var sureEl = katman.querySelector('.lazer-sure');

        var w = oda.clientWidth, h = oda.clientHeight;
        var x = w * 0.7, y = h * 0.82; // yerde başlar
        var sayi = 0, sonYakalama = 0, bas = Date.now(), bitti_ = false;

        function ciz() { nokta.style.transform = 'translate(' + (x - 7) + 'px,' + (y - 7) + 'px)'; }
        // Zemin şeridi odanın alt kısmında; kedi yalnızca yatayda koşar
        function zemindeMi() { return y > h * 0.62; }
        function zeminX() {
          var r = zemin.getBoundingClientRect(), o = oda.getBoundingClientRect();
          return x - (r.left - o.left);
        }
        function kovala() { if (!bitti_) kedi.kovala(zeminX()); }

        function konumla(e) {
          var o = oda.getBoundingClientRect();
          x = Math.max(8, Math.min(w - 8, e.clientX - o.left));
          y = Math.max(8, Math.min(h - 8, e.clientY - o.top));
          ciz();
        }
        katman.addEventListener('pointermove', konumla);
        katman.addEventListener('pointerdown', function (e) { konumla(e); katman.setPointerCapture && katman.setPointerCapture(e.pointerId); });
        katman.addEventListener('keydown', function (e) {
          var adim = 28;
          if (e.key === 'ArrowLeft') x = Math.max(8, x - adim);
          else if (e.key === 'ArrowRight') x = Math.min(w - 8, x + adim);
          else if (e.key === 'ArrowUp') y = Math.max(8, y - adim);
          else if (e.key === 'ArrowDown') y = Math.min(h - 8, y + adim);
          else if (e.key === 'Escape') { bitir(); return; }
          else return;
          e.preventDefault();
          ciz();
        });

        kedi.yonet(true);
        ciz();
        katman.focus({ preventScroll: true });

        var hedefZaman = setInterval(kovala, 300);
        var denetim = setInterval(function () {
          var kalan = Math.max(0, SURE - (Date.now() - bas));
          sureEl.textContent = Math.ceil(kalan / 1000);
          if (zemindeMi() && Math.abs(kedi.merkez() - zeminX()) < YAKALAMA_PX && Date.now() - sonYakalama > BEKLEME) {
            sayi++;
            sonYakalama = Date.now();
            sayiEl.textContent = sayi;
            nokta.classList.remove('yakalandi');
            void nokta.offsetWidth;
            nokta.classList.add('yakalandi');
            // Nokta kaçar: rastgele yeni bir yere sıçrar
            x = 20 + Math.random() * (w - 40);
            y = h * (0.66 + Math.random() * 0.26);
            ciz();
          }
          if (kalan <= 0) bitir();
        }, 60);

        function bitir() {
          if (bitti_) return;
          bitti_ = true;
          clearInterval(hedefZaman);
          clearInterval(denetim);
          katman.remove();
          kedi.yonet(false);
          bitti(sayi);
        }
      });
    }
  };
})();
