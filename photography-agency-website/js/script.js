document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const themeToggle = document.getElementById('theme-toggle');
  const navToggle = document.getElementById('nav-toggle');
  const mainNav = document.getElementById('main-nav');

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

  // ----- Pricing toggle (Photography / Video) -----
  const toggleBtns = document.querySelectorAll('.toggle-btn');
  const pricingPanels = {
    photo: document.getElementById('pricing-photo'),
    video: document.getElementById('pricing-video'),
  };
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      toggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      Object.entries(pricingPanels).forEach(([key, panel]) => {
        panel.classList.toggle('hidden', key !== mode);
      });
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

  // ----- Application form -----
  const form = document.getElementById('apply-form');
  const status = document.getElementById('form-status');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      status.textContent = 'Please fill out all required fields.';
      status.className = 'form-status error';
      return;
    }
    // No backend is connected yet — this simulates a successful submission.
    // Wire this up to a real endpoint (Formspree, Netlify Forms, Supabase, etc.) when ready.
    status.textContent = "Thanks! We've received your info and will be in touch soon.";
    status.className = 'form-status success';
    form.reset();
  });

  // ----- Footer year -----
  document.getElementById('year').textContent = new Date().getFullYear();
});
