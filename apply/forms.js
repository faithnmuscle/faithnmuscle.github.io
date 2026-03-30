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
    var firstError = null;

    function markError(el) {
      el.classList.add('field-error');
      hasErrors = true;
      if (!firstError) firstError = el;
    }

    // Required radio groups — add field-error directly to each label in the group
    var seenNames = {};
    form.querySelectorAll('input[type="radio"][required]').forEach(function (radio) {
      if (seenNames[radio.name]) return;
      seenNames[radio.name] = true;
      var checked = form.querySelector('input[type="radio"][name="' + radio.name + '"]:checked');
      if (!checked) {
        form.querySelectorAll('input[type="radio"][name="' + radio.name + '"]').forEach(function (r) {
          if (r.parentElement) markError(r.parentElement);
        });
      }
    });

    // Required checkboxes — mark their label or consent box
    form.querySelectorAll('input[type="checkbox"][required]').forEach(function (cb) {
      if (!cb.checked) {
        var target = cb.closest('.consent-box') || cb.parentElement;
        if (target) markError(target);
      }
    });

    // Required text / email / tel / number inputs — mark the .field wrapper
    form.querySelectorAll('input[required]:not([type="radio"]):not([type="checkbox"])').forEach(function (input) {
      if (!input.value.trim()) {
        var field = input.closest('.field');
        if (field) markError(field);
      }
    });

    if (hasErrors) {
      if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
