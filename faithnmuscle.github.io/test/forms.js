// Faith n Muscle - TEST form handler
// Emails go to fvid.pro@gmail.com (Web3Forms test key)
// Also saves to portal database via portal.faithnmuscle.com/api/apply

var PORTAL_API = 'https://portal.faithnmuscle.com/api/apply';

var SERVICE_TYPE_MAP = {
  'coachingForm': 'coaching',
  'workoutForm':  'workout',
  'mealForm':     'meal',
  'athletesForm': 'athletes',
  'rehabForm':    'rehab'
};

document.addEventListener('DOMContentLoaded', function () {

  var form      = document.querySelector('form[id]');
  var submitBtn = document.getElementById('submitBtn');
  var errEl     = document.getElementById('formError');
  var successEl = document.getElementById('formSuccess');

  if (!form) return;

  function clearFieldError(el) {
    el.classList.remove('field-error');
    el.style.removeProperty('border-color');
    el.style.removeProperty('background');
  }

  form.addEventListener('input', function (e) {
    var input = e.target;
    var field = input.closest('.field');
    if (field && field.classList.contains('field-error') && input.value.trim()) {
      clearFieldError(field);
    }
  });

  form.addEventListener('change', function (e) {
    var input = e.target;
    if (input.type === 'radio' || input.type === 'checkbox') {
      form.querySelectorAll('input[name="' + input.name + '"]').forEach(function (r) {
        var parent = r.parentElement;
        if (parent && parent.classList.contains('field-error')) clearFieldError(parent);
        var box = r.closest('.consent-box');
        if (box && box.classList.contains('field-error') && input.checked) clearFieldError(box);
      });
    }
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

    var hasErrors  = false;
    var firstError = null;

    function addError(el) {
      markError(el);
      hasErrors = true;
      if (!firstError) firstError = el;
    }

    // Required radio groups
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

    // Required checkboxes
    var seenCbNames = {};
    form.querySelectorAll('input[type="checkbox"][required]').forEach(function (cb) {
      if (cb.name === 'botcheck') return;
      if (seenCbNames[cb.name]) return;
      seenCbNames[cb.name] = true;
      var allInGroup  = form.querySelectorAll('input[type="checkbox"][name="' + cb.name + '"]');
      var anyChecked  = form.querySelector('input[type="checkbox"][name="' + cb.name + '"]:checked');
      if (!anyChecked) {
        if (allInGroup.length > 1) {
          allInGroup.forEach(function (c) { if (c.parentElement) addError(c.parentElement); });
        } else {
          var target = cb.closest('.consent-box') || cb.parentElement;
          if (target) addError(target);
        }
      }
    });

    // Required text/email/tel/number/textarea
    form.querySelectorAll('input[required]:not([type="radio"]):not([type="checkbox"]), textarea[required]').forEach(function (input) {
      var val   = input.value.trim();
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

    submitBtn.disabled      = true;
    submitBtn.textContent   = 'Submitting...';

    var data        = new FormData(form);
    var serviceType = SERVICE_TYPE_MAP[form.id] || 'coaching';
    data.set('service_type', serviceType);

    var web3Error   = null;
    var portalError = null;

    // 1. Submit to Web3Forms (email to fvid.pro@gmail.com)
    try {
      var w3Res  = await fetch('https://api.web3forms.com/submit', { method: 'POST', body: data });
      var w3Json = await w3Res.json();
      if (!w3Json.success) web3Error = w3Json.message || 'Web3Forms error';
    } catch (err) {
      web3Error = err.message || 'Network error';
    }

    // 2. Save to portal database (fire alongside, don't block on it)
    try {
      await fetch(PORTAL_API, { method: 'POST', body: data });
    } catch (err) {
      portalError = err.message;
    }

    if (web3Error) {
      errEl.textContent   = '[TEST] Error: ' + web3Error + (portalError ? ' | Portal: ' + portalError : '');
      errEl.style.display = 'block';
      submitBtn.disabled  = false;
      submitBtn.textContent = 'Submit Application';
    } else {
      // Success
      form.style.display    = 'none';
      successEl.style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (portalError) {
        console.warn('[TEST] Portal save failed:', portalError);
      }
    }
  });
});
