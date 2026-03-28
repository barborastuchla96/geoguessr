/* ============================================================
   WHERE WAS THIS?! — app.js
   Modules: Store | App (router) | Home | Admin | Game
   ============================================================ */

'use strict';

/* ────────────────────────────────────────────────────────────
   STORE — localStorage wrapper
   ──────────────────────────────────────────────────────────── */
const Store = (() => {
  const KEY = 'wherewasthis_v1';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function save(photos) {
    try {
      localStorage.setItem(KEY, JSON.stringify(photos));
      return true;
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        alert('Storage full! Your browser\'s localStorage quota has been exceeded. Try deleting some photos first.');
      } else {
        alert('Could not save photo: ' + e.message);
      }
      return false;
    }
  }

  function addPhoto(photo) {
    const photos = load();
    photos.push(photo);
    return save(photos);
  }

  function deletePhoto(id) {
    const photos = load().filter(p => p.id !== id);
    save(photos);
  }

  function count() {
    return load().length;
  }

  return { load, save, addPhoto, deletePhoto, count };
})();

/* ────────────────────────────────────────────────────────────
   UTILS
   ──────────────────────────────────────────────────────────── */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcScore(distKm) {
  return Math.round(5000 * Math.exp(-distKm / 2000));
}

function quip(distKm) {
  if (distKm < 1)    return 'Are you cheating?! That\'s incredible.';
  if (distKm < 10)   return 'Basically perfect. You know your stuff!';
  if (distKm < 50)   return 'Very close! You were paying attention.';
  if (distKm < 200)  return 'Not bad, not bad at all!';
  if (distKm < 600)  return 'In the right neighbourhood. Kind of.';
  if (distKm < 2000) return 'Mmm. Ballpark. Ish.';
  if (distKm < 6000) return 'Wrong continent? Bold strategy.';
  return 'Were you even trying? 😂';
}

function emoji(distKm) {
  if (distKm < 10)   return '🎯';
  if (distKm < 50)   return '🔥';
  if (distKm < 200)  return '😮';
  if (distKm < 600)  return '🤔';
  if (distKm < 2000) return '😬';
  return '💀';
}

function grade(pct) {
  if (pct > 0.9)  return '🏆 Suspiciously good. Have you been spying on me?';
  if (pct > 0.75) return '⭐ Legit impressive. You actually pay attention!';
  if (pct > 0.55) return '👍 Solid. You remember more than you think.';
  if (pct > 0.35) return '😅 Okay... you were there, technically.';
  return '🗺️ Maybe look at your own photos more often lol';
}

function fmtDist(km) {
  if (km < 1)    return Math.round(km * 1000) + ' m';
  if (km < 10)   return km.toFixed(1) + ' km';
  return Math.round(km) + ' km';
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ────────────────────────────────────────────────────────────
   APP — screen router
   ──────────────────────────────────────────────────────────── */
const App = (() => {
  const screens = {
    home:   document.getElementById('screen-home'),
    admin:  document.getElementById('screen-admin'),
    game:   document.getElementById('screen-game'),
    result: document.getElementById('screen-result'),
    final:  document.getElementById('screen-final'),
  };

  let current = 'home';

  function show(name) {
    if (screens[current]) {
      screens[current].classList.remove('active');
    }
    current = name;
    if (screens[current]) {
      screens[current].classList.add('active');
    }
  }

  return { show };
})();

/* ────────────────────────────────────────────────────────────
   HOME MODULE
   ──────────────────────────────────────────────────────────── */
const Home = (() => {
  function init() {
    updateStats();
    renderTicker();

    document.getElementById('btn-play').addEventListener('click', () => {
      const photos = Store.load();
      if (photos.length === 0) {
        alert('No photos yet! Check back soon.');
        return;
      }
      PasswordGate.request('play', () => Game.start());
    });
  }

  function updateStats() {
    const n = Store.count();
    const el = document.getElementById('home-stats');
    if (n === 0) {
      el.textContent = 'No photos loaded yet.';
    } else {
      el.textContent = n + ' photo' + (n === 1 ? '' : 's') + ' ready to play.';
    }
  }

  function renderTicker() {
    const inner = document.getElementById('ticker-inner');
    const photos = Store.load();
    if (photos.length === 0) {
      inner.innerHTML = '';
      return;
    }
    // Duplicate for infinite scroll effect
    const items = [...photos, ...photos, ...photos];
    inner.innerHTML = items.map(p =>
      `<img src="${p.dataUrl}" alt="" loading="lazy"/>`
    ).join('');
  }

  return { init, updateStats, renderTicker };
})();

/* ────────────────────────────────────────────────────────────
   ADMIN MODULE
   ──────────────────────────────────────────────────────────── */
const Admin = (() => {
  let pinMap = null;
  let pinMarker = null;
  let pendingPhotos = [];
  let activePendingIdx = null;
  let pendingPinLatLng = null;
  let _dropZoneInit = false;

  function init() {
    renderPhotoGrid();
    updateCount();

    // Back button
    document.getElementById('btn-admin-back').onclick = () => {
      App.show('home');
      Home.updateStats();
      Home.renderTicker();
    };

    // Drop zone — only attach once to avoid duplicate listeners
    if (!_dropZoneInit) {
      _dropZoneInit = true;
      setupDropZone();
    }

    // Confirm pin button
    document.getElementById('btn-confirm-pin').onclick = confirmPin;
  }

  function setupDropZone() {
    const zone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('dragover');
      handleFiles(Array.from(e.dataTransfer.files));
    });
    zone.addEventListener('click', (e) => {
      if (e.target.tagName !== 'LABEL' && e.target.tagName !== 'INPUT') {
        fileInput.click();
      }
    });
    fileInput.addEventListener('change', () => {
      handleFiles(Array.from(fileInput.files));
      fileInput.value = '';
    });
  }

  async function handleFiles(files) {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    for (const file of imageFiles) {
      // Extract GPS from original file BEFORE compression (canvas strips EXIF)
      let gps = null;
      try {
        gps = await exifr.gps(file);
      } catch (err) {
        // no GPS — will go to pending
      }

      // Compress: read original → canvas resize → JPEG
      const raw = await readFileAsDataUrl(file);
      const dataUrl = await compressImage(raw);

      if (gps && gps.latitude != null && gps.longitude != null) {
        const photo = {
          id: uid(),
          dataUrl,
          lat: gps.latitude,
          lng: gps.longitude,
          name: file.name,
        };
        Store.addPhoto(photo);
        renderPhotoGrid();
        updateCount();
      } else {
        pendingPhotos.push({ dataUrl, name: file.name, id: uid() });
        renderPendingSection();
      }
    }
  }

  function compressImage(dataUrl, maxPx = 1200, quality = 0.78) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          if (width >= height) { height = Math.round(height * maxPx / width); width = maxPx; }
          else                 { width = Math.round(width * maxPx / height);  height = maxPx; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = dataUrl;
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function renderPendingSection() {
    const section = document.getElementById('pending-section');
    if (pendingPhotos.length === 0) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';

    const grid = document.getElementById('pending-grid');
    grid.innerHTML = pendingPhotos.map((p, i) => {
      const cls = i === activePendingIdx
        ? 'pending-thumb active'
        : (p.pinned ? 'pending-thumb pinned' : 'pending-thumb');
      return `<img class="${cls}" src="${p.dataUrl}" data-idx="${i}" title="${p.name}" />`;
    }).join('');

    grid.querySelectorAll('.pending-thumb').forEach(img => {
      img.addEventListener('click', () => activatePending(parseInt(img.dataset.idx)));
    });

    // Init or refresh pin map
    initPinMap();
  }

  function activatePending(idx) {
    activePendingIdx = idx;
    pendingPinLatLng = null;
    document.getElementById('btn-confirm-pin').disabled = true;
    renderPendingSection();

    // Reset pin marker
    if (pinMarker) {
      pinMap.removeLayer(pinMarker);
      pinMarker = null;
    }
    document.getElementById('pin-map-hint').style.opacity = '1';
  }

  function initPinMap() {
    if (!pinMap) {
      setTimeout(() => {
        pinMap = L.map('pin-map', { zoomControl: true }).setView([20, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 18,
        }).addTo(pinMap);

        pinMap.on('click', onPinMapClick);
        pinMap.invalidateSize();
      }, 60);
    } else {
      setTimeout(() => pinMap.invalidateSize(), 60);
    }
  }

  function onPinMapClick(e) {
    if (activePendingIdx === null) return;

    pendingPinLatLng = e.latlng;

    if (pinMarker) pinMap.removeLayer(pinMarker);
    pinMarker = L.marker(e.latlng, {
      icon: L.divIcon({
        className: '',
        html: '<div style="width:16px;height:16px;border-radius:50%;background:#FFE135;border:3px solid #1A1A2E;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>',
        iconAnchor: [8, 8],
      })
    }).addTo(pinMap);

    document.getElementById('btn-confirm-pin').disabled = false;
    document.getElementById('pin-map-hint').style.opacity = '0';
  }

  function confirmPin() {
    if (activePendingIdx === null || !pendingPinLatLng) return;

    const p = pendingPhotos[activePendingIdx];
    const photo = {
      id: p.id,
      dataUrl: p.dataUrl,
      lat: pendingPinLatLng.lat,
      lng: pendingPinLatLng.lng,
      name: p.name,
    };

    if (!Store.addPhoto(photo)) return; // quota exceeded

    // Mark as pinned
    pendingPhotos[activePendingIdx].pinned = true;

    // Remove after short delay so user sees the green border
    setTimeout(() => {
      pendingPhotos.splice(activePendingIdx, 1);
      activePendingIdx = null;
      pendingPinLatLng = null;
      if (pinMarker) {
        if (pinMap) pinMap.removeLayer(pinMarker);
        pinMarker = null;
      }
      document.getElementById('btn-confirm-pin').disabled = true;
      renderPendingSection();
      renderPhotoGrid();
      updateCount();
    }, 600);

    renderPendingSection(); // re-render to show pinned state
    renderPhotoGrid();
    updateCount();
  }

  function renderPhotoGrid() {
    const photos = Store.load();
    const grid = document.getElementById('photo-grid');
    const empty = document.getElementById('empty-msg');

    if (photos.length === 0) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    grid.innerHTML = photos.map(p => `
      <div class="photo-card">
        <img src="${p.dataUrl}" alt="${p.name || ''}" loading="lazy"/>
        <div class="photo-overlay">
          <span class="photo-coord">${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}</span>
          <button class="btn-delete" data-id="${p.id}">✕ Delete</button>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (confirm('Delete this photo?')) {
          Store.deletePhoto(btn.dataset.id);
          renderPhotoGrid();
          updateCount();
        }
      });
    });
  }

  function updateCount() {
    const n = Store.count();
    document.getElementById('admin-count').textContent = n + ' photo' + (n === 1 ? '' : 's');
  }

  return { init };
})();

/* ────────────────────────────────────────────────────────────
   GAME MODULE
   ──────────────────────────────────────────────────────────── */
const Game = (() => {
  const ROUNDS = 5;
  let queue = [];
  let currentRound = 0;
  let totalScore = 0;
  let roundResults = [];
  let guessLatLng = null;

  // Guess map state
  let guessMap = null;
  let guessMarker = null;
  let _mapExpanded = false;

  function start() {
    const all = Store.load();
    if (all.length === 0) return;
    queue = shuffleArray(all).slice(0, ROUNDS);
    currentRound = 0;
    totalScore = 0;
    roundResults = [];

    App.show('game');
    initGuessMap();
    loadRound();
  }

  function loadRound() {
    const photo = queue[currentRound];

    // Update HUD
    document.getElementById('hud-round').textContent =
      'Round ' + (currentRound + 1) + ' / ' + queue.length;
    document.getElementById('hud-score').textContent = totalScore.toLocaleString() + ' pts';

    // Set photo
    const img = document.getElementById('game-photo');
    img.src = photo.dataUrl;

    // Reset guess state
    guessLatLng = null;
    const btn = document.getElementById('btn-submit-guess');
    btn.disabled = true;
    btn.textContent = 'Submit Guess →';

    // Collapse map panel
    collapseMap();
  }

  function initGuessMap() {
    const container = document.getElementById('guess-map');

    // Destroy old map if exists
    if (guessMap) {
      guessMap.remove();
      guessMap = null;
      guessMarker = null;
    }

    container.innerHTML = '';

    // Re-attach click on panel
    const panel = document.getElementById('map-panel');
    panel.replaceWith(panel.cloneNode(true)); // clone to wipe listeners

    const newPanel = document.getElementById('map-panel');
    newPanel.addEventListener('click', onPanelClick);

    // Submit button
    document.getElementById('btn-submit-guess').addEventListener('click', e => {
      e.stopPropagation();
      submitGuess();
    });

    // Create map after DOM settles
    setTimeout(() => {
      guessMap = L.map('guess-map', {
        zoomControl: true,
        attributionControl: false,
      }).setView([20, 0], 2);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
      }).addTo(guessMap);

      guessMap.on('click', onMapClick);
      guessMap.invalidateSize();
    }, 120);
  }

  function onPanelClick(e) {
    if (_mapExpanded) return; // clicks go to Leaflet, not here
    expandMap();
  }

  function expandMap() {
    _mapExpanded = true;
    const panel = document.getElementById('map-panel');
    panel.classList.add('expanded');
    setTimeout(() => {
      if (guessMap) guessMap.invalidateSize();
    }, 200);
  }

  function collapseMap() {
    _mapExpanded = false;
    guessLatLng = null;
    if (guessMarker && guessMap) {
      guessMap.removeLayer(guessMarker);
      guessMarker = null;
    }
    const panel = document.getElementById('map-panel');
    panel.classList.remove('expanded');
    document.getElementById('btn-submit-guess').disabled = true;
  }

  function onMapClick(e) {
    if (!_mapExpanded) return;

    guessLatLng = e.latlng;

    if (guessMarker) guessMap.removeLayer(guessMarker);
    guessMarker = L.marker(e.latlng, {
      icon: L.divIcon({
        className: '',
        html: '<div style="width:20px;height:20px;border-radius:50%;background:#FFE135;border:3px solid #1A1A2E;box-shadow:0 2px 12px rgba(0,0,0,0.6)"></div>',
        iconAnchor: [10, 10],
      })
    }).addTo(guessMap);

    document.getElementById('btn-submit-guess').disabled = false;
  }

  function submitGuess() {
    if (!guessLatLng) return;

    const photo = queue[currentRound];
    const distKm = haversineKm(guessLatLng.lat, guessLatLng.lng, photo.lat, photo.lng);
    const pts = calcScore(distKm);
    totalScore += pts;

    roundResults.push({
      round: currentRound + 1,
      distKm,
      score: pts,
    });

    showResult(photo, distKm, pts);
  }

  function showResult(photo, distKm, pts) {
    App.show('result');

    // Build result map fresh each round
    const container = document.getElementById('result-map');
    container.innerHTML = '';

    setTimeout(() => {
      const map = L.map('result-map', { zoomControl: false, attributionControl: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);

      const actualLatLng = [photo.lat, photo.lng];
      const guessLL = [guessLatLng.lat, guessLatLng.lng];

      // Actual location marker (green)
      L.marker(actualLatLng, {
        icon: L.divIcon({
          className: '',
          html: '<div style="width:20px;height:20px;border-radius:50%;background:#2ECC71;border:3px solid #fff;box-shadow:0 2px 12px rgba(0,0,0,0.5)"></div>',
          iconAnchor: [10, 10],
        })
      }).addTo(map).bindPopup('📍 Actual location');

      // Guess marker (yellow)
      L.marker(guessLL, {
        icon: L.divIcon({
          className: '',
          html: '<div style="width:20px;height:20px;border-radius:50%;background:#FFE135;border:3px solid #1A1A2E;box-shadow:0 2px 12px rgba(0,0,0,0.5)"></div>',
          iconAnchor: [10, 10],
        })
      }).addTo(map).bindPopup('Your guess');

      // Dashed line
      L.polyline([actualLatLng, guessLL], {
        color: '#FFE135',
        weight: 3,
        dashArray: '8 6',
        opacity: 0.9,
      }).addTo(map);

      // Fit bounds
      const bounds = L.latLngBounds([actualLatLng, guessLL]);
      map.fitBounds(bounds, { padding: [60, 60] });
      map.invalidateSize();

      // Slide up score card
      const card = document.getElementById('result-card');
      card.classList.remove('visible');
      setTimeout(() => card.classList.add('visible'), 80);

      // Populate card
      document.getElementById('result-emoji').textContent = emoji(distKm);
      document.getElementById('result-score').textContent = pts.toLocaleString();
      document.getElementById('result-distance').textContent = fmtDist(distKm) + ' away';
      document.getElementById('result-quip').textContent = quip(distKm);

      // Next / Finish button
      const btnNext = document.getElementById('btn-next');
      const isLast = currentRound >= queue.length - 1;
      btnNext.textContent = isLast ? 'See Final Score →' : 'Next Round →';

      btnNext.onclick = () => {
        card.classList.remove('visible');
        if (isLast) {
          showFinal();
        } else {
          currentRound++;
          App.show('game');
          loadRound();
        }
      };
    }, 60);
  }

  function showFinal() {
    App.show('final');

    const maxScore = queue.length * 5000;
    const pct = totalScore / maxScore;

    document.getElementById('final-score').textContent = totalScore.toLocaleString();
    document.getElementById('final-score-max').textContent = '/ ' + maxScore.toLocaleString();
    document.getElementById('final-grade').textContent = grade(pct);

    const tbody = document.getElementById('rounds-tbody');
    tbody.innerHTML = roundResults.map(r => `
      <tr>
        <td>${r.round}</td>
        <td>${fmtDist(r.distKm)}</td>
        <td>${r.score.toLocaleString()}</td>
      </tr>
    `).join('');

    document.getElementById('btn-play-again').onclick = () => {
      start();
    };
    document.getElementById('btn-home').onclick = () => {
      App.show('home');
      Home.updateStats();
      Home.renderTicker();
    };
  }

  return { start };
})();

/* ────────────────────────────────────────────────────────────
   PASSWORD GATE — handles both play + admin access
   ──────────────────────────────────────────────────────────── */
const PasswordGate = (() => {
  // ↓ Change these passwords to whatever you like
  const PASSWORDS = {
    play:  'letmeplay',
    admin: 'wherewasthis2024',
  };
  const SESSION_KEYS = {
    play:  'wwt_play_auth',
    admin: 'wwt_admin_auth',
  };
  const TITLES = {
    play:  '🎮 Enter to Play',
    admin: '🔐 Admin Access',
  };

  function isAuthed(mode) {
    return sessionStorage.getItem(SESSION_KEYS[mode]) === '1';
  }

  function show(mode, onSuccess) {
    const gate     = document.getElementById('pw-gate');
    const title    = document.getElementById('pw-gate-title');
    const input    = document.getElementById('pw-gate-input');
    const submitBtn= document.getElementById('pw-gate-submit');
    const error    = document.getElementById('pw-gate-error');

    title.textContent = TITLES[mode];
    gate.style.display = 'flex';
    error.style.display = 'none';
    input.value = '';
    setTimeout(() => input.focus(), 80);

    function attempt() {
      if (input.value === PASSWORDS[mode]) {
        sessionStorage.setItem(SESSION_KEYS[mode], '1');
        gate.style.display = 'none';
        onSuccess();
      } else {
        error.style.display = 'block';
        input.value = '';
        input.focus();
      }
    }

    // Replace handlers each time to avoid stacking old callbacks
    submitBtn.onclick = attempt;
    input.onkeydown = e => { if (e.key === 'Enter') attempt(); };
    gate.onclick = e => { if (e.target === gate) gate.style.display = 'none'; };
  }

  function request(mode, onSuccess) {
    if (isAuthed(mode)) {
      onSuccess();
    } else {
      show(mode, onSuccess);
    }
  }

  return { request };
})();

/* ────────────────────────────────────────────────────────────
   BOOT
   ──────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  Home.init();
  App.show('home');

  // Hidden admin lock button
  document.getElementById('btn-admin-secret').addEventListener('click', () => {
    PasswordGate.request('admin', () => {
      App.show('admin');
      Admin.init();
    });
  });
});
