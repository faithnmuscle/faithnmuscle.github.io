// Faith n Muscle — Shared form handler
// Replace YOUR_RECAPTCHA_SITE_KEY with your key from google.com/recaptcha (v3)
const RECAPTCHA_SITE_KEY = 'YOUR_RECAPTCHA_SITE_KEY';

document.addEventListener('DOMContentLoaded', function () {
  const form = document.querySelector('form[id]');
  const submitBtn = document.getElementById('submitBtn');
  const errEl = document.getElementById('formError');
  const successEl = document.getElementById('formSuccess');

  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errEl.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    try {
      const token = await grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: 'submit' });
      const data = new FormData(form);
      data.set('g-recaptcha-response', token);

      const res = await fetch('https://api.web3forms.com/submit', { method: 'POST', body: data });
      const json = await res.json();

      if (json.success) {
        form.style.display = 'none';
        successEl.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        throw new Error(json.message);
      }
    } catch {
      errEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Application';
    }
  });
});
