// Dedicated Supabase project for this site's application/inquiry form.
// The anon/publishable key is safe to expose client-side — it only allows
// what the table's row-level security policies permit (insert-only, no read).
const SUPABASE_URL = 'https://vwtcxasrejpwftooqfjg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_6RD3Szoo7FPmeOWOI4dt3w_Lw2Q-lu4';

document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const themeToggle = document.getElementById('theme-toggle');
  const navToggle = document.getElementById('nav-toggle');
  const mainNav = document.getElementById('main-nav');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ----- Theme (light/dark) -----
  const savedTheme = localStorage.getItem('ll-theme');
  if (savedTheme) root.setAttribute('data-theme', savedTheme);

  themeToggle.addEventListener('click', () => {
    const current = root.getAttribute('data-theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('ll-theme', next);
  });

  // ----- Mobile nav -----
  navToggle.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
  mainNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mainNav.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });

  // ----- Custom cursor ring (desktop pointer only, additive to native cursor) -----
  const cursorRing = document.getElementById('cursor-ring');
  if (window.matchMedia('(pointer: fine)').matches && !prefersReducedMotion) {
    let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0;
    let started = false;
    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      cursorRing.classList.add('active');
      if (!started) {
        started = true;
        ringX = mouseX;
        ringY = mouseY;
      }
    });
    const tick = () => {
      ringX += (mouseX - ringX) * 0.2;
      ringY += (mouseY - ringY) * 0.2;
      cursorRing.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    document.querySelectorAll('a, button, input, select, textarea, .service-row-head').forEach(el => {
      el.addEventListener('mouseenter', () => cursorRing.classList.add('is-hover'));
      el.addEventListener('mouseleave', () => cursorRing.classList.remove('is-hover'));
    });
  }

  // ----- Scroll progress rail -----
  const progressFill = document.getElementById('scroll-progress-fill');
  const updateScrollProgress = () => {
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0;
    progressFill.style.height = Math.min(Math.max(pct, 0), 100) + '%';
  };
  window.addEventListener('scroll', updateScrollProgress, { passive: true });
  updateScrollProgress();

  // ----- Editorial services list (single-open accordion) -----
  document.querySelectorAll('.service-row-head').forEach(head => {
    head.addEventListener('click', () => {
      const row = head.closest('.service-row');
      const isOpen = row.classList.contains('open');
      document.querySelectorAll('.service-row').forEach(r => {
        r.classList.remove('open');
        r.querySelector('.service-row-head').setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        row.classList.add('open');
        head.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // ----- FAQ Accordion -----
  document.querySelectorAll('.accordion-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('.accordion-item');
      const isOpen = item.classList.contains('open');
      item.parentElement.querySelectorAll('.accordion-item').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });

  // ----- Portfolio gallery filter -----
  const galleryFilterBtns = document.querySelectorAll('.gallery-filter .toggle-btn');
  const galleryItems = document.querySelectorAll('.gallery-item');
  galleryFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      galleryFilterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const genre = btn.dataset.genre;
      galleryItems.forEach(item => {
        item.classList.toggle('hidden', genre !== 'all' && item.dataset.genre !== genre);
      });
    });
  });

  if (document.getElementById('calc-price')) {
    // ----- Pricing calculator -----
    const RATES = {
      photo: {
        crew: {
          solo: { base: 400, hourly: 150 },
          duo: { base: 700, hourly: 280 },
          full: { base: 1200, hourly: 450 },
        },
        addons: { drone: 500, rush: 400, album: 600 },
      },
      video: {
        crew: {
          solo: { base: 800, hourly: 300 },
          duo: { base: 1500, hourly: 500 },
          full: { base: 2800, hourly: 800 },
        },
        addons: { drone: 800, rush: 500, revision: 300 },
      },
    };

    const CREW_LABELS = {
      photo: { solo: '1 Photographer', duo: '2 Photographers', full: 'Full Crew (4)' },
      video: { solo: '1 Videographer', duo: '2-Camera Crew', full: 'Full Crew + Drone Team' },
    };

    const ADDON_LABELS = {
      drone: 'Drone Aerial Footage',
      rush: 'Rush Delivery (48h)',
      album: 'Printed Album',
      revision: 'Extra Revision Round',
    };

    const PRESETS = {
      photo: {
        basic: { crew: 'solo', hours: 2, addons: [] },
        standard: { crew: 'duo', hours: 5, addons: ['drone'] },
        premium: { crew: 'full', hours: 8, addons: ['drone', 'rush', 'album'] },
      },
      video: {
        basic: { crew: 'solo', hours: 3, addons: [] },
        standard: { crew: 'duo', hours: 6, addons: ['drone'] },
        premium: { crew: 'full', hours: 8, addons: ['drone', 'rush', 'revision'] },
      },
    };

    const modeToggleBtns = document.querySelectorAll('.pricing-toggle .toggle-btn');
    const presetBtns = document.querySelectorAll('.preset-btn');
    const crewSelect = document.getElementById('calc-crew');
    const hoursSlider = document.getElementById('calc-hours');
    const hoursValueEl = document.getElementById('calc-hours-value');
    const addonCheckboxes = document.querySelectorAll('.calc-addons input[type="checkbox"]');
    const addonRows = document.querySelectorAll('.checkbox-row[data-addon-mode]');
    const priceEl = document.getElementById('calc-price');
    const breakdownEl = document.getElementById('calc-breakdown');
    const bookBtn = document.getElementById('calc-book-btn');
    const interestSelect = document.getElementById('interest');
    const messageField = document.getElementById('message');

    let currentMode = 'photo';
    let displayedPrice = 0;

    function updateAddonVisibilityAndPrices() {
      addonRows.forEach(row => {
        const rowMode = row.dataset.addonMode;
        const matches = rowMode === currentMode;
        row.classList.toggle('hidden', !matches);
        if (!matches) row.querySelector('input').checked = false;
      });
      document.querySelectorAll('.addon-price').forEach(span => {
        const key = span.dataset.addonPrice;
        const value = RATES[currentMode].addons[key];
        span.textContent = value ? `+$${value.toLocaleString()}` : '';
      });
    }

    function clearPresetActive() {
      presetBtns.forEach(b => b.classList.remove('active'));
    }

    function getSelectedAddons() {
      return Array.from(addonCheckboxes)
        .filter(cb => cb.checked && !cb.closest('.checkbox-row').classList.contains('hidden'))
        .map(cb => cb.dataset.addon);
    }

    function animatePriceTo(target) {
      const start = displayedPrice;
      if (prefersReducedMotion || start === target) {
        priceEl.firstChild.textContent = `$${target.toLocaleString()}`;
        displayedPrice = target;
        return;
      }
      const duration = 350;
      const startTime = performance.now();
      function step(now) {
        const t = Math.min((now - startTime) / duration, 1);
        const val = Math.round(start + (target - start) * t);
        priceEl.firstChild.textContent = `$${val.toLocaleString()}`;
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          displayedPrice = target;
        }
      }
      requestAnimationFrame(step);
    }

    function recalculate() {
      const crew = crewSelect.value;
      const hours = Number(hoursSlider.value);
      hoursValueEl.textContent = hours;
      const addons = getSelectedAddons();

      const rateInfo = RATES[currentMode].crew[crew];
      const hourCost = rateInfo.hourly * hours;
      const addonCost = addons.reduce((sum, a) => sum + (RATES[currentMode].addons[a] || 0), 0);
      const total = rateInfo.base + hourCost + addonCost;

      breakdownEl.innerHTML = '';
      const rows = [
        { label: `${CREW_LABELS[currentMode][crew]} — base rate`, value: rateInfo.base },
        { label: `${hours}h coverage (@ $${rateInfo.hourly.toLocaleString()}/hr)`, value: hourCost },
      ];
      addons.forEach(a => rows.push({ label: ADDON_LABELS[a], value: RATES[currentMode].addons[a] }));
      rows.forEach(r => {
        const li = document.createElement('li');
        const labelSpan = document.createElement('span');
        labelSpan.textContent = r.label;
        const valueSpan = document.createElement('span');
        valueSpan.textContent = `$${r.value.toLocaleString()}`;
        li.append(labelSpan, valueSpan);
        breakdownEl.appendChild(li);
      });

      animatePriceTo(total);
      return { crew, hours, addons, total };
    }

    function applyPreset(name) {
      const preset = PRESETS[currentMode][name];
      crewSelect.value = preset.crew;
      hoursSlider.value = preset.hours;
      addonCheckboxes.forEach(cb => {
        cb.checked = preset.addons.includes(cb.dataset.addon);
      });
      recalculate();
    }

    modeToggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        modeToggleBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.dataset.mode;
        updateAddonVisibilityAndPrices();
        const activePreset = document.querySelector('.preset-btn.active');
        if (activePreset) {
          applyPreset(activePreset.dataset.preset);
        } else {
          recalculate();
        }
      });
    });

    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        clearPresetActive();
        btn.classList.add('active');
        applyPreset(btn.dataset.preset);
      });
    });

    [crewSelect, hoursSlider].forEach(control => {
      control.addEventListener('input', () => {
        clearPresetActive();
        recalculate();
      });
    });
    addonCheckboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        clearPresetActive();
        recalculate();
      });
    });

    bookBtn.addEventListener('click', () => {
      const calc = recalculate();
      interestSelect.value = currentMode === 'photo' ? 'book-photo' : 'book-video';
      const addonText = calc.addons.length
        ? calc.addons.map(a => ADDON_LABELS[a]).join(', ')
        : 'none';
      messageField.value =
        `Quote request: ${CREW_LABELS[currentMode][calc.crew]}, ${calc.hours}h coverage ` +
        `(${currentMode === 'photo' ? 'Photography' : 'Video / Production'}). ` +
        `Add-ons: ${addonText}. Estimated total: $${calc.total.toLocaleString()} TTD ` +
        `(from the pricing calculator — feel free to adjust).`;
    });

    updateAddonVisibilityAndPrices();
    applyPreset('basic');

  }

  // ----- Scroll reveal -----
  const revealEls = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  revealEls.forEach(el => observer.observe(el));

  if (document.getElementById('apply-form')) {
    // ----- Application form -----
    const form = document.getElementById('apply-form');
    const status = document.getElementById('form-status');

    // Pre-select "I'm interested in" when linked from another page, e.g. rentals.html?interest=rental#apply
    const interestSelect = document.getElementById('interest');
    const presetInterest = new URLSearchParams(window.location.search).get('interest');
    if (interestSelect && presetInterest && Array.from(interestSelect.options).some(o => o.value === presetInterest)) {
      interestSelect.value = presetInterest;
    }

    const submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) {
        status.textContent = 'Please fill out all required fields.';
        status.className = 'form-status error';
        return;
      }

      const formData = new FormData(form);
      const payload = {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone') || null,
        interest: formData.get('interest'),
        message: formData.get('message') || null,
        source_page: window.location.pathname.split('/').pop() || 'index.html',
      };

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/website_inquiries`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error(`Request failed: ${res.status}`);

        status.textContent = "Thanks! We've received your info and will be in touch soon.";
        status.className = 'form-status success';
        form.reset();
      } catch (err) {
        status.textContent = "Something went wrong sending that — please try again, or email us directly.";
        status.className = 'form-status error';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Application';
      }
    });

  }

  // ----- Footer year -----
  document.getElementById('year').textContent = new Date().getFullYear();
});
