// Faith n Muscle — Shared form handler
// Replace 6LdW5J0sAAAAAFwI7pNZOsvq_NrUoaqJeNpyxMOp with your key from google.com/recaptcha (v3)
const RECAPTCHA_SITE_KEY = '6LdW5J0sAAAAAFwI7pNZOsvq_NrUoaqJeNpyxMOp';

document.addEventListener('DOMContentLoaded', function () {
  const form = document.querySelector('form[id]');
  const submitBtn = document.getElementById('submitBtn');
  const errEl = document.getElementById('formError');
  const successEl = document.getElementById('formSuccess');

  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errEl.style.display = 'none';

    // Clear previous highlights
    form.querySelectorAll('.field-error').forEach(function (el) { el.classList.remove('field-error'); });

    // Highlight any invalid fields and stop
    if (!form.checkValidity()) {
      form.querySelectorAll(':invalid').forEach(function (input) {
        var container = input.closest('.yn-group, .radio-group, .check-group, .scale-group, .consent-box, .field');
        if (container) container.classList.add('field-error');
      });
      var first = form.querySelector('.field-error');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    try {
      const data = new FormData(form);

      // Try reCAPTCHA — skip gracefully if it fails (e.g. unlisted domain in testing)
      try {
        const token = await grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: 'submit' });
        data.set('g-recaptcha-response', token);
      } catch (_) { /* reCAPTCHA unavailable — submit without token */ }

      const res = await fetch('https://api.web3forms.com/submit', { method: 'POST', body: data });
      const json = await res.json();

      if (json.success) {
        form.style.display = 'none';
        successEl.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        throw new Error(json.message || 'Unknown error');
      }
    } catch (err) {
      errEl.textContent = 'Error: ' + (err.message || 'Something went wrong. Please try again or contact via WhatsApp.');
      errEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Application';
    }
  });
});
