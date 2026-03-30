// Faith n Muscle — Shared form handler


document.addEventListener('DOMContentLoaded', function () {

  var form = document.querySelector('form[id]');
  var submitBtn = document.getElementById('submitBtn');
  var errEl = document.getElementById('formError');
  var successEl = document.getElementById('formSuccess');

  if (!form) return;

  function clearFieldError(el) {
    el.classList.remove('field-error');
    el.style.removeProperty('border-color');
    el.style.removeProperty('background');
  }

  // Clear error highlight as soon as the field is filled
  form.addEventListener('input', function (e) {
    var input = e.target;
    var field = input.closest('.field');
    if (field && field.classList.contains('field-error') && input.value.trim()) {
      clearFieldError(field);
    }
  });

  form.addEventListener('change', function (e) {
    var input = e.target;
    // Radio group — clear all siblings once one is picked
    if (input.type === 'radio' || input.type === 'checkbox') {
      form.querySelectorAll('input[name="' + input.name + '"]').forEach(function (r) {
        var parent = r.parentElement;
        if (parent && parent.classList.contains('field-error')) clearFieldError(parent);
        var box = r.closest('.consent-box');
        if (box && box.classList.contains('field-error') && input.checked) clearFieldError(box);
      });
    }
    // Auto-select "No" for pregnant when Male is chosen; clear it for Female/Other
    if (input.name === 'sex') {
      if (input.value === 'Male') {
        ['pregnant', 'parq_pregnant'].forEach(function (fieldName) {
          var na = form.querySelector('input[name="' + fieldName + '"][value="Not applicable"]');
          if (na && !na.checked) {
            na.checked = true;
            na.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      } else {
        ['pregnant', 'parq_pregnant'].forEach(function (fieldName) {
          form.querySelectorAll('input[name="' + fieldName + '"]').forEach(function (r) { r.checked = false; });
        });
      }
    }
  });

  function markError(el) {
    el.classList.add('field-error');
    el.style.setProperty('border-color', '#e05555', 'important');
    el.style.setProperty('background', 'rgba(224,85,85,0.15)', 'important');
  }

  function clearErrors() {
    form.querySelectorAll('.field-error').forEach(function (el) {
      el.classList.remove('field-error');
      el.style.removeProperty('border-color');
      el.style.removeProperty('background');
    });
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errEl.style.display = 'none';
    clearErrors();

    var hasErrors = false;
    var firstError = null;

    function addError(el) {
      markError(el);
      hasErrors = true;
      if (!firstError) firstError = el;
    }

    // Required radio groups — at least one must be selected
    var seenRadioNames = {};
    form.querySelectorAll('input[type="radio"][required]').forEach(function (radio) {
      if (seenRadioNames[radio.name]) return;
      seenRadioNames[radio.name] = true;
      if (!form.querySelector('input[type="radio"][name="' + radio.name + '"]:checked')) {
        form.querySelectorAll('input[type="radio"][name="' + radio.name + '"]').forEach(function (r) {
          if (r.parentElement) addError(r.parentElement);
        });
      }
    });

    // Required checkboxes — groups need at least one; single (consent) must be checked
    var seenCbNames = {};
    form.querySelectorAll('input[type="checkbox"][required]').forEach(function (cb) {
      if (cb.name === 'botcheck') return;
      if (seenCbNames[cb.name]) return;
      seenCbNames[cb.name] = true;
      var allInGroup = form.querySelectorAll('input[type="checkbox"][name="' + cb.name + '"]');
      var anyChecked = form.querySelector('input[type="checkbox"][name="' + cb.name + '"]:checked');
      if (!anyChecked) {
        if (allInGroup.length > 1) {
          allInGroup.forEach(function (c) { if (c.parentElement) addError(c.parentElement); });
        } else {
          var target = cb.closest('.consent-box') || cb.parentElement;
          if (target) addError(target);
        }
      }
    });

    // Required text / email / tel / number / textarea inputs
    form.querySelectorAll('input[required]:not([type="radio"]):not([type="checkbox"]), textarea[required]').forEach(function (input) {
      var val = input.value.trim();
      var field = input.closest('.field');
      if (!val) {
        if (field) addError(field);
      } else if (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        if (field) addError(field);
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
