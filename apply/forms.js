// Faith n Muscle — Shared form handler
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

    // Validate: iterate form controls, mark invalid ones
    var seenRadioNames = {};
    var hasErrors = false;

    Array.from(form.elements).forEach(function (el) {
      if (!el.willValidate || el.disabled) return;

      // For radio buttons, check the group by name once
      if (el.type === 'radio') {
        if (seenRadioNames[el.name] !== undefined) return; // already processed this group
        seenRadioNames[el.name] = true;
        var groupChecked = form.querySelector('input[type="radio"][name="' + el.name + '"]:checked');
        var isRequired = form.querySelector('input[type="radio"][name="' + el.name + '"][required]');
        if (isRequired && !groupChecked) {
          var container = el.closest('.yn-group, .radio-group, .scale-group');
          if (container) { container.classList.add('field-error'); hasErrors = true; }
        }
        return;
      }

      if (!el.validity.valid) {
        var container = el.closest('.check-group, .consent-box, .field');
        if (container) { container.classList.add('field-error'); hasErrors = true; }
      }
    });

    if (hasErrors) {
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
