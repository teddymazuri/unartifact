/* ============================================================
   UnArtifact — App Shell (SPA router, UI wiring)
   ============================================================ */

(function () {
  'use strict';

  /* ---------- SPA Router ---------- */
  const VIEWS = ['landing', 'app', 'contact', 'privacy', 'terms'];
  const DEFAULT_VIEW = 'landing';

  function route() {
    let hash = (location.hash || '#/').replace(/^#\/?/, '').trim();
    if (hash === '' || hash === '/') hash = DEFAULT_VIEW;
    const view = VIEWS.includes(hash) ? hash : DEFAULT_VIEW;

    VIEWS.forEach(v => {
      const el = document.getElementById('view-' + v);
      if (el) el.classList.toggle('hidden', v !== view);
    });
    document.querySelectorAll('[data-nav]').forEach(a => {
      const target = a.getAttribute('href').replace('#/', '') || DEFAULT_VIEW;
      a.classList.toggle('bg-indigo-50', target === view);
      a.classList.toggle('text-indigo-700', target === view);
    });
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('year').textContent = new Date().getFullYear();
    route();
    initAppView();
    initContactForm();
  });

  /* ---------- Progress log hook used by cleaner.js ---------- */
  const logEl = () => document.getElementById('progress-log');
  window.__unartifactLog = function (msg) {
    const ul = logEl();
    if (!ul) return;
    const li = document.createElement('li');
    li.textContent = '› ' + msg;
    ul.appendChild(li);
    ul.scrollTop = ul.scrollHeight;
  };

  /* ============================================================
     App view: drag & drop, toggles, cleaning, download
     ============================================================ */
  function initAppView() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const progressWrap = document.getElementById('progress-wrap');
    const progressBar = document.getElementById('progress-bar');
    const progressPct = document.getElementById('progress-pct');
    const progressLabel = document.getElementById('progress-label');
    const progressLog = document.getElementById('progress-log');
    const resultWrap = document.getElementById('result-wrap');
    const resultSummary = document.getElementById('result-summary');
    const downloadBtn = document.getElementById('download-btn');

    let currentResult = null; // { blob, outName }

    function resetUI() {
      progressWrap.classList.add('hidden');
      resultWrap.classList.add('hidden');
      progressBar.style.width = '0%';
      progressPct.textContent = '0%';
      progressLog.innerHTML = '';
      currentResult = null;
    }

    function setProgress(pct, label) {
      progressWrap.classList.remove('hidden');
      progressBar.style.width = pct + '%';
      progressPct.textContent = Math.round(pct) + '%';
      if (label) progressLabel.textContent = label;
    }

    function readOptions() {
      const opts = { metadata: false, formatting: false, boilerplate: false };
      document.querySelectorAll('[data-routine]').forEach(cb => {
        opts[cb.getAttribute('data-routine')] = cb.checked;
      });
      return opts;
    }

    async function handleFile(file) {
      resetUI();
      if (!file) return;
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!['doc', 'docx'].includes(ext)) {
        alert('UnArtifact only accepts .doc and .docx files. You provided: .' + ext);
        return;
      }
      setProgress(5, 'Reading file…');
      window.__unartifactLog('file: ' + file.name + ' (' + file.size + ' bytes)');

      const options = readOptions();
      window.__unartifactLog('routines: ' + Object.entries(options).filter(([, v]) => v).map(([k]) => k).join(', '));

      try {
        const result = await window.UnArtifactCleaner.cleanFile(file, options, (pct, label) => {
          setProgress(pct, label);
        });
        currentResult = { blob: result.blob, outName: result.outName };

        const r = result.report;
        resultSummary.textContent =
          `Metadata parts: ${r.metadata} · Formatting fixes: ${r.formatting} · Boilerplate passages: ${r.boilerplate} · Revisions: ${r.revisions} · Comments: ${r.comments}`;
        resultWrap.classList.remove('hidden');
        progressWrap.classList.add('hidden');
        window.__unartifactLog('output: ' + result.outName + ' (' + result.blob.size + ' bytes)');
      } catch (err) {
        console.error(err);
        progressLabel.textContent = 'Error: ' + err.message;
        window.__unartifactLog('ERROR: ' + err.message);
      }
    }

    /* Drag & drop */
    ['dragenter', 'dragover'].forEach(evt => {
      dropZone.addEventListener(evt, e => {
        e.preventDefault(); e.stopPropagation();
        dropZone.classList.add('border-indigo-500', 'bg-indigo-50');
      });
    });
    ['dragleave', 'drop'].forEach(evt => {
      dropZone.addEventListener(evt, e => {
        e.preventDefault(); e.stopPropagation();
        dropZone.classList.remove('border-indigo-500', 'bg-indigo-50');
      });
    });
    dropZone.addEventListener('drop', e => {
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      handleFile(file);
    });
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      handleFile(file);
      fileInput.value = '';
    });

    /* Download */
    downloadBtn.addEventListener('click', () => {
      if (!currentResult) return;
      saveAs(currentResult.blob, currentResult.outName);
      window.__unartifactLog('download triggered: ' + currentResult.outName);
    });
  }

  /* ============================================================
     Contact form: client-side validation only (no network)
     ============================================================ */
  function initContactForm() {
    const form = document.getElementById('contact-form');
    if (!form) return;
    const success = document.getElementById('contact-success');

    function showError(input, msg) {
      const err = input.parentElement.querySelector('.err');
      if (err) { err.textContent = msg; err.classList.toggle('hidden', !msg); }
      input.classList.toggle('border-rose-500', !!msg);
    }

    function validate() {
      let ok = true;
      const name = form.querySelector('#c-name');
      const email = form.querySelector('#c-email');
      const msg = form.querySelector('#c-msg');

      if (!name.value.trim() || name.value.trim().length < 2) {
        showError(name, 'Please enter your name (2+ characters).'); ok = false;
      } else showError(name, '');

      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      if (!emailRe.test(email.value.trim())) {
        showError(email, 'Please enter a valid email address.'); ok = false;
      } else showError(email, '');

      if (!msg.value.trim() || msg.value.trim().length < 10) {
        showError(msg, 'Message must be at least 10 characters.'); ok = false;
      } else showError(msg, '');

      return ok;
    }

    form.addEventListener('submit', e => {
      e.preventDefault();
      success.classList.add('hidden');
      if (!validate()) return;
      // No network request — purely local confirmation.
      success.classList.remove('hidden');
      form.reset();
    });

    ['input', 'blur'].forEach(evt => {
      form.addEventListener(evt, e => {
        if (e.target.matches('input, textarea')) validate();
      }, true);
    });
  }
})();