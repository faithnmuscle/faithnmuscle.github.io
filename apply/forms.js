// Faith n Muscle — Shared form handler
const RECAPTCHA_SITE_KEY = '6LdW5J0sAAAAAFwI7pNZOsvq_NrUoaqJeNpyxMOp';

document.addEventListener('DOMContentLoaded', function () {
  var form = document.querySelector('form[id]');
  var submitBtn = document.getElementById('submitBtn');
  var errEl = document.getElementById('formError');
  var successEl = document.getElementById('formSuccess');

  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errEl.style.display = 'none';

    // Clear previous error highlights
    form.querySelectorAll('.field-error').forEach(function (el) { el.classList.remove('field-error'); });

    var hasErrors = false;

    // Required radio groups — check each unique name
    var seenNames = {};
    form.querySelectorAll('input[type="radio"][required]').forEach(function (radio) {
      if (seenNames[radio.name]) return;
      seenNames[radio.name] = true;
      var checked = form.querySelector('input[type="radio"][name="' + radio.name + '"]:checked');
      if (!checked) {
        var group = radio.closest('.yn-group') || radio.closest('.radio-group') || radio.closest('.scale-group');
        if (group) { group.classList.add('field-error'); hasErrors = true; }
      }
    });

    // Required checkboxes
    form.querySelectorAll('input[type="checkbox"][required]').forEach(function (cb) {
      if (!cb.checked) {
        var group = cb.closest('.consent-box') || cb.closest('.field');
        if (group) { group.classList.add('field-error'); hasErrors = true; }
      }
    });

    // Required text/email/tel/number inputs
    form.querySelectorAll('input[required]:not([type="radio"]):not([type="checkbox"])').forEach(function (input) {
      if (!input.value.trim()) {
        var field = input.closest('.field');
        if (field) { field.classList.add('field-error'); hasErrors = true; }
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
      var data = new FormData(form);

      // Try reCAPTCHA — skip gracefully if it fails (e.g. unlisted domain in testing)
      try {
        var token = await grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: 'submit' });
        data.set('g-recaptcha-response', token);
      } catch (_) { /* reCAPTCHA unavailable — submit without token */ }

      var res = await fetch('https://api.web3forms.com/submit', { method: 'POST', body: data });
      var json = await res.json();

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
