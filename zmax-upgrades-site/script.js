// ZMAX Upgrades — mobile nav toggle
(function () {
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (!toggle || !links) return;

  toggle.addEventListener('click', function () {
    var isOpen = links.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  links.addEventListener('click', function (event) {
    if (event.target.tagName === 'A' && links.classList.contains('is-open')) {
      links.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
})();

// ZMAX Upgrades — contact form submission (Formspree), progressive enhancement
(function () {
  var form = document.querySelector('.js-contact-form');
  if (!form) return;

  var status = form.querySelector('.form-status');
  var submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    if (form.querySelector('.honeypot-field input').value) {
      return; // bot caught by honeypot, silently drop
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' },
    })
      .then(function (response) {
        if (response.ok) {
          status.dataset.state = 'success';
          status.textContent = "Message sent — we'll get back to you as soon as we can.";
          form.reset();
        } else {
          throw new Error('Form submission failed');
        }
      })
      .catch(function () {
        status.dataset.state = 'error';
        status.textContent =
          "Something went wrong sending that. Please WhatsApp or call us directly instead — details above.";
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Message';
        status.focus();
      });
  });
})();
