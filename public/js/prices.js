// public/js/prices.js

(function () {
  const rowsEl = document.getElementById('priceRows');
  const saleBanner = document.getElementById('saleBanner');
  const saleBannerText = document.getElementById('saleBannerText');

  if (!rowsEl) return;

  // Base price data
  const packages = [
    {
      key: 'none',
      name: 'None (pay-as-you-go)',
      hours: 0,
      packagePrice: null,      // show "—"
      pricePerHour: 35
    },
    {
      key: 'starter',
      name: 'Starter',
      hours: 2,
      packagePrice: 60,
      pricePerHour: 30
    },
    {
      key: 'bronze',
      name: 'Bronze',
      hours: 4,
      packagePrice: 100,
      pricePerHour: 25
    },
    {
      key: 'silver',
      name: 'Silver',
      hours: 6,
      packagePrice: 125,
      pricePerHour: 20.83
    },
    {
      key: 'gold',
      name: 'Gold',
      hours: 8,
      packagePrice: 150,
      pricePerHour: 18.75
    },
    {
      key: 'platinum',
      name: 'Platinum',
      hours: 10,
      packagePrice: 175,
      pricePerHour: 17.5
    }
  ];

  function fmtGBP(value) {
    return '£' + value.toFixed(2).replace(/\.00$/, '');
  }

  function renderTable(sale) {
    const active = sale && sale.active && sale.discountPercent > 0;
    rowsEl.innerHTML = '';

    packages.forEach(pkg => {
      const tr = document.createElement('tr');

      // Package name
      const tdName = document.createElement('td');
      tdName.className = 'pkg-name';
      tdName.textContent = pkg.name;
      tr.appendChild(tdName);

      // Hours
      const tdHours = document.createElement('td');
      tdHours.textContent = pkg.hours;
      tr.appendChild(tdHours);

      // Package price
      const tdPackage = document.createElement('td');
      if (pkg.packagePrice == null) {
        // pay-as-you-go row shows em dash
        tdPackage.textContent = '—';
      } else if (!active) {
        tdPackage.textContent = fmtGBP(pkg.packagePrice);
      } else {
        const discounted = pkg.packagePrice * (1 - sale.discountPercent / 100);

        const spanOrig = document.createElement('span');
        spanOrig.className = 'price-original';
        spanOrig.textContent = fmtGBP(pkg.packagePrice);

        const spanSale = document.createElement('span');
        spanSale.className = 'price-sale';
        spanSale.textContent = fmtGBP(discounted);

        tdPackage.appendChild(spanOrig);
        tdPackage.appendChild(spanSale);
      }
      tr.appendChild(tdPackage);

      // Price per hour
      const tdPerHour = document.createElement('td');
      if (!active) {
        tdPerHour.textContent = fmtGBP(pkg.pricePerHour);
      } else {
        const discountedPerHour = pkg.pricePerHour * (1 - sale.discountPercent / 100);
        const spanOrigH = document.createElement('span');
        spanOrigH.className = 'price-original';
        spanOrigH.textContent = fmtGBP(pkg.pricePerHour);

        const spanSaleH = document.createElement('span');
        spanSaleH.className = 'price-sale';
        spanSaleH.textContent = fmtGBP(discountedPerHour);

        tdPerHour.appendChild(spanOrigH);
        tdPerHour.appendChild(spanSaleH);
      }
      tr.appendChild(tdPerHour);

      rowsEl.appendChild(tr);
    });
  }

  async function loadSaleAndRender() {
    let sale = { active: false, name: '', discountPercent: 0 };

    try {
      const res = await fetch('/api/sale', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.sale) {
          sale = {
            active: !!data.sale.active,
            name: data.sale.name || '',
            discountPercent: Number(data.sale.discountPercent || 0)
          };
        }
      }
    } catch (e) {
      // Fail quietly – we’ll just show normal prices
      console.error('Failed to load sale info:', e);
    }

    // Banner
    if (saleBanner && saleBannerText) {
      if (sale.active && sale.discountPercent > 0) {
        saleBanner.style.display = 'flex';
        const label = sale.name && sale.name.trim().length
          ? sale.name.trim()
          : `${sale.discountPercent}% off coaching packages`;

        saleBannerText.textContent = `${label} — all listed package prices and hourly rates are reduced.`;
      } else {
        saleBanner.style.display = 'none';
        saleBannerText.textContent = '';
      }
    }

    renderTable(sale);
  }

  document.addEventListener('DOMContentLoaded', loadSaleAndRender);
})();

