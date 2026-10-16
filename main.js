(() => {
  'use strict';

  const LEVELS = [
    { id: 'lol', name: 'LEAGUE OF LEGENDS', short: 'LEAGUE', letter: 'R', image: 'R.png', preview: 'Rammus.png', previewName: 'RAMMUS', icon: 'L', accent: '#d2ad65', hint: 'Acepta la partida y encuentra a Rammus.' },
    { id: 'valorant', name: 'VALORANT', short: 'VALORANT', letter: 'I', image: 'I.png', preview: 'Iso.png', previewName: 'ISO', icon: 'V', accent: '#f05b5e', hint: 'Apunta con el cursor y acierta 6 objetivos.' },
    { id: 'lor', name: 'LEGENDS OF RUNETERRA', short: 'RUNETERRA', letter: 'O', image: 'O.png', preview: 'Ornn.png', previewName: 'CARTA DE ORNN', icon: 'O', accent: '#d4a85c', hint: 'Revela cartas y elige a Ornn.' },
    { id: 'twoxko', name: '2XKO', short: '2XKO', letter: 'T', image: 'T.png', preview: 'Thresh.png', previewName: 'THRESH', icon: '2X', accent: '#be70ed', hint: 'Vence a Warwick con movimiento y ataques.' }
  ];
  const STORAGE_KEY = 'riot-unlock-progress-v1';
  const W = 1000, H = 600;
  const $ = selector => document.querySelector(selector);
  const home = $('#home-view'), gameView = $('#game-view'), scene = $('#game-scene');
  const canvas = $('#scene-canvas'), ctx = canvas.getContext('2d');
  const ui = $('#scene-ui'), toast = $('#toast'), overlay = $('#completion-overlay');
  let MatterApi = window.Matter;
  const characterImages = Object.fromEntries(Object.entries({
    iso: 'Iso.png', ornn: 'Ornn.png', rammus: 'Rammus.png', thresh: 'Thresh.png', warwick: 'Warwick.png'
  }).map(([name, path]) => {
    const image = new Image();
    image.src = path;
    return [name, image];
  }));
  const characterImageCache = new Map();

  function imageReady(image) { return image.complete && image.naturalWidth > 0; }
  function drawCharacterImage(name, ...destination) {
    const image = characterImages[name];
    if (!imageReady(image)) return false;
    let cachedImage = characterImageCache.get(name);
    if (!cachedImage) {
      const scale = Math.min(1, 768 / Math.max(image.naturalWidth, image.naturalHeight));
      cachedImage = document.createElement('canvas');
      cachedImage.width = Math.round(image.naturalWidth * scale);
      cachedImage.height = Math.round(image.naturalHeight * scale);
      cachedImage.getContext('2d').drawImage(image, 0, 0, cachedImage.width, cachedImage.height);
      characterImageCache.set(name, cachedImage);
    }
    ctx.drawImage(cachedImage, ...destination);
    return true;
  }

  function readSave() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return { unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked.filter(letter => 'RIOT'.includes(letter)) : [], completed: parsed.completed || {} };
    } catch { return { unlocked: [], completed: {} }; }
  }
  const state = { ...readSave(), active: null, scenes: {}, lastTime: 0, particles: [], matter: null, keys: new Set(), toastTimer: 0 };

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ unlocked: state.unlocked, completed: state.completed })); } catch { showToast('EL PROGRESO SE CONSERVA DURANTE ESTA SESIÓN'); }
  }
  function count() { return state.unlocked.length; }
  function updateCounters() {
    $('#progress-count').textContent = `${String(count()).padStart(2, '0')} / 04`;
    $('#progress-caption').textContent = count() === 4 ? 'LOGO COMPLETO · MISIÓN CUMPLIDA' : `${4 - count()} RETO${count() === 3 ? '' : 'S'} PARA COMPLETAR EL LOGO`;
    $('#game-progress-count').textContent = `${String(count()).padStart(2, '0')} / 04`;
    $('#reset-button').hidden = count() === 0;
  }
  function renderHome() {
    $('#logo-letters').innerHTML = LEVELS.map(level => {
      const unlocked = state.unlocked.includes(level.letter);
      const tip = `${level.letter} · ${level.previewName} · ${unlocked ? 'LETRA DESBLOQUEADA' : 'COMPLETA EL RETO'}`;
      return `<button class="logo-letter ${unlocked ? 'unlocked' : 'locked'}" type="button" aria-label="${tip}" data-letter="${level.letter}"><img class="logo-glyph" src="${level.image}" alt="" aria-hidden="true"><span class="letter-tooltip" aria-hidden="true"><img src="${level.preview}" alt=""><b>${level.previewName}</b><small>${unlocked ? 'RETO COMPLETADO' : 'RETO PENDIENTE'}</small></span></button>`;
    }).join('');
    $('#level-grid').innerHTML = LEVELS.map((level, index) => {
      const complete = !!state.completed[level.id];
      return `<button class="level-card ${complete ? 'completed' : ''}" type="button" style="--accent:${level.accent}" data-id="${level.id}" aria-label="${level.name}, ${complete ? 'completado' : 'jugar'}"><span class="card-top"><span class="game-symbol">${level.icon}</span><span class="card-status">${complete ? '✓ COMPLETADO' : `0${index + 1} · DISPONIBLE`}</span></span><h3>${level.name}</h3><p>${level.letter} · ${complete ? 'LETRA CONQUISTADA' : level.hint.toUpperCase()}</p><span class="card-arrow" aria-hidden="true">↗</span></button>`;
    }).join('');
    updateCounters();
  }
  function showToast(message) {
    toast.textContent = message; toast.classList.add('show'); clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove('show'), 2100);
  }
  function newMatterWorld() {
    if (!MatterApi) return null;
    const engine = MatterApi.Engine.create({ enableSleeping: false });
    engine.gravity.x = 0; engine.gravity.y = 0;
    return { engine, bodies: [], walls: [] };
  }
  function clearPhysics() {
    if (state.matter && MatterApi) MatterApi.Engine.clear(state.matter.engine);
    state.matter = null; state.particles = [];
  }
  function setupPhysics(gameId) {
    clearPhysics(); state.matter = newMatterWorld();
    if (!state.matter) return;
    if (gameId === 'lor') {
      const Matter = MatterApi, { engine } = state.matter;
      const walls = [Matter.Bodies.rectangle(W / 2, -30, W, 60, { isStatic: true }), Matter.Bodies.rectangle(W / 2, H + 30, W, 60, { isStatic: true }), Matter.Bodies.rectangle(-30, H / 2, 60, H, { isStatic: true }), Matter.Bodies.rectangle(W + 30, H / 2, 60, H, { isStatic: true })];
      Matter.Composite.add(engine.world, walls);
      state.matter.cards = [260, 420, 580, 740].map((x, index) => Matter.Bodies.rectangle(x, 365 + (index % 2) * 12, 126, 180, { restitution: .35, frictionAir: .09, angle: (index - 1.5) * .018 }));
      Matter.Composite.add(engine.world, state.matter.cards);
    }
  }
  function emit(x, y, color, amount = 14, power = 4) {
    for (let i = 0; i < amount; i++) {
      const angle = Math.random() * Math.PI * 2, speed = .002 + Math.random() * .003;
      const life = 50 + Math.random() * 45;
      if (MatterApi && state.matter) {
        const body = MatterApi.Bodies.circle(x, y, 2 + Math.random() * 3, { restitution: .78, frictionAir: .018, density: .001 });
        MatterApi.Body.setVelocity(body, { x: Math.cos(angle) * power * speed * 100, y: Math.sin(angle) * power * speed * 100 });
        MatterApi.Composite.add(state.matter.engine.world, body);
        state.particles.push({ body, life, max: life, color });
      } else state.particles.push({ x, y, vx: Math.cos(angle) * power * speed * 100, vy: Math.sin(angle) * power * speed * 100, life, max: life, color, radius: 2 + Math.random() * 3 });
    }
  }
  function updateParticles(delta) {
    const factor = Math.min(delta / 16.67, 2);
    if (state.matter && MatterApi) {
      MatterApi.Engine.update(state.matter.engine, delta);
      state.particles.forEach(p => { p.life -= factor; });
      state.particles = state.particles.filter(p => {
        if (p.life > 0) return true;
        MatterApi.Composite.remove(state.matter.engine.world, p.body); return false;
      });
    } else {
      state.particles.forEach(p => { p.x += p.vx * factor; p.y += p.vy * factor; p.vx *= .985; p.vy = p.vy * .985 + .035; p.life -= factor; });
      state.particles = state.particles.filter(p => p.life > 0);
    }
  }
  function drawParticles() {
    state.particles.forEach(p => {
      const x = p.body ? p.body.position.x : p.x, y = p.body ? p.body.position.y : p.y;
      const alpha = Math.max(0, p.life / p.max);
      ctx.globalAlpha = alpha; ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(x, y, p.body ? p.body.circleRadius : p.radius, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  }
  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width * W, y: (event.clientY - rect.top) / rect.height * H };
  }
  function enterLevel(id) {
    const level = LEVELS.find(item => item.id === id); if (!level) return;
    state.active = id; home.hidden = true; gameView.hidden = false; overlay.hidden = true;
    scene.dataset.game = id; gameView.dataset.game = id; $('#game-index').textContent = `0${LEVELS.indexOf(level) + 1}`;
    $('#game-title').textContent = level.name; $('#game-subtitle').textContent = level.hint.toUpperCase();
    $('#game-instruction').textContent = level.hint;
    setupPhysics(id); resizeCanvas(); prepareLevel(id); renderUI();
  }
  function returnHome() {
    state.active = null; gameView.hidden = true; home.hidden = false; overlay.hidden = true; clearPhysics(); renderHome();
  }
  function prepareLevel(id) {
    if (id === 'lol') {
      if (!state.scenes.lol) state.scenes.lol = { phase: 'search', started: performance.now(), selected: false, revealedAt: 0 };
      const s = state.scenes.lol;
      if (s.phase === 'search' && performance.now() - s.started > 1450) s.phase = 'found';
    } else if (id === 'valorant') {
      if (!state.scenes.valorant) state.scenes.valorant = { hits: 0, started: performance.now(), targets: Array.from({ length: 3 }, (_, i) => ({ x: 250 + i * 250, y: 260 + (i % 2) * 75, phase: i * 2.05, radius: 26 })) };
    } else if (id === 'lor') {
      if (!state.scenes.lor) state.scenes.lor = { revealed: [], chosen: false, forgedAt: 0, correct: 1, bodies: [] };
      syncCards();
    } else if (id === 'twoxko') {
      if (!state.scenes.twoxko) state.scenes.twoxko = { started: false, won: false, player: { x: 280, y: 470, vx: 0, vy: 0, facing: 1, grounded: true, action: '', actionUntil: 0, lastAttack: 0 }, enemy: { x: 690, y: 470, vx: 0, hp: 100, flash: 0, stepAt: 0 }, lastTime: performance.now() };
    }
  }
  function syncCards() {
    const s = state.scenes.lor; if (!s || !state.matter || !state.matter.cards) return;
    s.bodies = state.matter.cards;
  }
  function renderUI() {
    if (!state.active) return;
    const id = state.active, s = state.scenes[id]; let html = '';
    if (id === 'lol') {
      if (s.phase === 'search' || s.phase === 'found') html = `<div class="scene-panel"><span class="scene-kicker">LEAGUE OF LEGENDS · COLA CLASIFICATORIA</span><h3>${s.phase === 'search' ? 'BUSCANDO PARTIDA' : 'PARTIDA ENCONTRADA'}</h3><p>${s.phase === 'search' ? 'Conectando con la Grieta del Invocador…' : 'Tu equipo está listo. Acepta para entrar a selección.'}</p>${s.phase === 'search' ? '<div class="search-pulse" aria-label="Buscando"></div>' : '<button class="action-button" data-action="accept">ACEPTAR PARTIDA</button>'}</div><div class="scene-badge">COLA <strong>5v5</strong></div>`;
      else if (s.phase === 'champions') html = `<div class="scene-panel"><span class="scene-kicker">SELECCIÓN DE CAMPEÓN · TOP</span><h3>ELIGE A TU CAMPEÓN</h3><p>Encuentra a Rammus entre los campeones disponibles.</p></div><div class="champion-list">${[['GAREN','EL PODER DE DEMACIA'],['RAMMUS','EL ARMORDILLO'],['ASHE','LA ARQUERA DE HIELO']].map(([name, role]) => `<button class="choice-button ${s.selected && name === 'RAMMUS' ? 'selected' : ''}" data-champion="${name}" type="button"><b>${name}</b><small>${role}</small></button>`).join('')}</div>`;
      else html = `<div class="scene-center-readout"><strong>¡OK!</strong> RAMMUS ENTRÓ A LA GRIETA</div><div class="scene-badge">CAMPEÓN <strong>CONFIRMADO</strong></div>`;
    }
    if (id === 'valorant') html = `<div class="scene-center-readout">CAMPO DE PRUEBAS · ISO<strong>${s.hits} / 6 IMPACTOS</strong></div><div class="scene-badge">ARMAS <strong>ACTIVAS</strong></div><div class="scene-bottom-hint">MUEVE EL CURSOR · CLIC SOBRE LOS NÚCLEOS</div>${s.hits >= 6 ? '<div class="scene-panel center"><span class="scene-kicker">PRUEBA SUPERADA</span><h3>BLANCO NEUTRALIZADO</h3><p>La energía converge y forma tu siguiente letra.</p></div>' : ''}`;
    if (id === 'lor') html = `<div class="scene-panel"><span class="scene-kicker">LEGENDS OF RUNETERRA · FORJA</span><h3>${s.chosen ? 'EL FUEGO DE ORNN' : '¿QUIÉN FORJÓ LA LEYENDA?'}</h3><p>${s.chosen ? 'La forja despierta. Confirma a Ornn para reclamar la letra.' : 'Revela las cartas. Ornn es el maestro forjador.'}</p>${s.chosen ? '<button class="action-button" data-action="forge">FORJAR LA LETRA O</button>' : ''}</div><div class="card-actions">${['JINX','ORNN','LUX','YASUO'].map((name, i) => `<button class="choice-button ${s.revealed.includes(i) ? 'selected' : ''}" type="button" data-card="${i}" aria-label="${s.revealed.includes(i) ? name : `Revelar carta ${i + 1}`}"><b>${s.revealed.includes(i) ? name : `CARTA 0${i + 1}`}</b><small>${s.revealed.includes(i) ? (name === 'ORNN' ? 'EL MAESTRO FORJADOR' : 'CAMPEÓN REVELADO') : 'TOCA PARA REVELAR'}</small></button>`).join('')}</div><div class="scene-badge">MAZO <strong>${4 - s.revealed.length} CARTAS</strong></div>`;
    if (id === 'twoxko') {
      const e = s.enemy;
      html = `<div class="scene-center-readout">DUELO DE LEYENDAS<strong>${s.started ? 'THRESH  VS  WARWICK' : 'PREPÁRATE PARA LUCHAR'}</strong></div><div class="fight-hud"><div class="health-block"><span>THRESH</span><div class="health-track"><i style="width:100%"></i></div></div><div class="round-label">ROUND 01</div><div class="health-block enemy-health"><span>WARWICK</span><div class="health-track"><i style="width:${Math.max(0, e.hp)}%"></i></div></div></div>${!s.started ? '<div class="scene-panel center"><span class="scene-kicker">2XKO · COMBATE 1v1</span><h3>LA ARENA TE ESPERA</h3><p>A / D moverse · W saltar · J ataque · K especial</p><button class="action-button" data-action="fight-start">ENTRAR AL COMBATE</button></div>' : ''}${s.won ? '<div class="scene-panel center"><span class="scene-kicker">VICTORIA · WARWICK DERROTADO</span><h3>¡GOLPE FINAL!</h3><p>Thresh domina la arena. La última letra ya es tuya.</p></div>' : ''}<div class="fight-controls"><button data-key="a" aria-label="Mover a la izquierda">◀</button><button data-key="d" aria-label="Mover a la derecha">▶</button><button data-key="w" aria-label="Saltar">↑</button><button data-key="j" aria-label="Ataque básico">J</button><button data-key="k" aria-label="Ataque especial">K</button></div>`;
    }
    ui.innerHTML = html;
  }
  function unlock(id) {
    const level = LEVELS.find(item => item.id === id); if (!level || state.completed[id]) return;
    state.completed[id] = true;
    if (!state.unlocked.includes(level.letter)) state.unlocked.push(level.letter);
    save(); updateCounters(); renderHome(); renderUI();
    showToast(`LETRA ${level.letter} DESBLOQUEADA`);
    if (count() === 4) setTimeout(() => { returnHome(); overlay.hidden = false; }, 1700);
  }
  function drawBackground(id, time) {
    const colors = { lol: ['#111517', '#24302d', '#7a4a24'], valorant: ['#10171a', '#232e31', '#e45457'], lor: ['#17150f', '#30291b', '#d8a44c'], twoxko: ['#150f1c', '#2b1833', '#b954e8'] }[id];
    const grad = ctx.createLinearGradient(0, 0, W, H); grad.addColorStop(0, colors[0]); grad.addColorStop(.5, colors[1]); grad.addColorStop(1, colors[0]); ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.045)'; ctx.lineWidth = 1;
    for (let x = -H; x < W + H; x += 48) { ctx.beginPath(); ctx.moveTo(x + (time * .008 % 48), 0); ctx.lineTo(x - H + (time * .008 % 48), H); ctx.stroke(); }
    ctx.restore();
    const glow = ctx.createRadialGradient(W * .54, H * .48, 4, W * .54, H * .48, 400); glow.addColorStop(0, `${colors[2]}20`); glow.addColorStop(1, 'transparent'); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  }
  function drawLol(time) {
    const s = state.scenes.lol, t = (time - s.revealedAt) / 1000;
    ctx.fillStyle = '#131a18'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(217,190,126,.13)'; ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(i * 130 - 60, H); ctx.lineTo(W / 2 + (i - 4) * 19, 0); ctx.stroke(); }
    const floor = ctx.createLinearGradient(0, 430, 0, 600); floor.addColorStop(0, '#27302b'); floor.addColorStop(1, '#101311'); ctx.fillStyle = floor; ctx.fillRect(0, 430, W, 170);
    if (s.phase === 'champions') {
      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(235,221,177,.74)'; ctx.font = '500 12px monospace'; ctx.fillText('SUMMONER’S RIFT · CHAMPION SELECT', W / 2, 112);
      [280, 500, 720].forEach((x, i) => { ctx.fillStyle = ['#275d65', '#6e6a44', '#526485'][i]; ctx.beginPath(); ctx.arc(x, 295, 72, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.stroke(); ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(x, 335, 48, 30, 0, 0, Math.PI * 2); ctx.fill(); });
    }
    if (s.phase === 'reveal') {
      const scale = Math.min(1, Math.max(0, t / 1.05));
      const rammusImage = characterImages.rammus;
      if (imageReady(rammusImage)) {
        const imageHeight = 410 * (.25 + .75 * scale), imageWidth = imageHeight * rammusImage.naturalWidth / rammusImage.naturalHeight;
        ctx.save(); ctx.globalAlpha = scale; ctx.shadowColor = '#e5bb58'; ctx.shadowBlur = 24;
        drawCharacterImage('rammus', W / 2 - imageWidth / 2, 105, imageWidth, imageHeight); ctx.restore();
      } else {
      ctx.save(); ctx.translate(W / 2, 350); ctx.rotate(Math.sin(time * .002) * .04); ctx.scale(.25 + .75 * scale, .25 + .75 * scale);
      const aura = ctx.createRadialGradient(0, -40, 5, 0, -40, 190); aura.addColorStop(0, 'rgba(231,191,90,.54)'); aura.addColorStop(1, 'rgba(231,191,90,0)'); ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(0, -40, 190, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d5a64b'; ctx.strokeStyle = '#f4d07d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(0, 12, 100, 76, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#23231f'; ctx.beginPath(); ctx.ellipse(-16, 2, 8, 5, 0, 0, Math.PI * 2); ctx.ellipse(16, 2, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e8c268'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(-74, 25); ctx.quadraticCurveTo(-128, 38, -110, 90); ctx.moveTo(74, 25); ctx.quadraticCurveTo(128, 38, 110, 90); ctx.stroke();
      ctx.fillStyle = '#ded8c5'; ctx.font = '900 47px Barlow Condensed, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('RAMMUS', 0, 136); ctx.restore();
      }
      ctx.textAlign = 'center'; ctx.fillStyle = '#e4c572'; ctx.font = '900 120px Barlow Condensed, sans-serif'; ctx.globalAlpha = Math.max(0, Math.min(1, (t - .6) * 2)); ctx.shadowColor = '#e5bb58'; ctx.shadowBlur = 30; ctx.fillText('R', 820, 310); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      if (t > .35 && !s.emitted) { s.emitted = true; for (let i = 0; i < 24; i++) emit(500 + (Math.random() - .5) * 260, 360 + (Math.random() - .5) * 180, '#e7c26d', 1, 6); }
      if (t > 1.8 && !state.completed.lol) unlock('lol');
    }
  }
  function drawValorant(time) {
    const s = state.scenes.valorant;
    const floor = ctx.createLinearGradient(0, 410, 0, 600); floor.addColorStop(0, '#1b2427'); floor.addColorStop(1, '#111416'); ctx.fillStyle = floor; ctx.fillRect(0, 410, W, 190);
    ctx.strokeStyle = 'rgba(111,204,216,.22)'; ctx.lineWidth = 2; ctx.strokeRect(70, 90, 860, 410);
    [0,1,2,3,4,5,6,7,8].forEach(i => { const x = 100 + i * 100; ctx.strokeStyle = 'rgba(116,214,225,.08)'; ctx.beginPath(); ctx.moveTo(x, 95); ctx.lineTo(x, 500); ctx.stroke(); });
    const isoImage = characterImages.iso;
    if (imageReady(isoImage)) {
      ctx.save(); ctx.beginPath(); ctx.arc(125, 430, 75, 0, Math.PI * 2); ctx.clip();
      drawCharacterImage('iso', 50, 355, 150, 150); ctx.restore();
      ctx.strokeStyle = '#79e5ee'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(125, 430, 75, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#d8fbff'; ctx.font = '700 10px monospace'; ctx.textAlign = 'center'; ctx.fillText('ISO', 125, 526);
    }
    const elapsed = (time - s.started) / 1000;
    s.targets.forEach((target, i) => {
      const x = target.x + Math.sin(elapsed * (1.1 + i * .24) + target.phase) * 45;
      const y = target.y + Math.cos(elapsed * (1.35 + i * .12) + target.phase) * 35;
      target.liveX = x; target.liveY = y;
      ctx.save(); ctx.translate(x, y); ctx.rotate(elapsed * .45 * (i % 2 ? 1 : -1));
      ctx.shadowColor = '#6fe1ed'; ctx.shadowBlur = 22; ctx.fillStyle = 'rgba(47,192,211,.13)'; ctx.strokeStyle = '#79e5ee'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -target.radius); ctx.lineTo(target.radius, 0); ctx.lineTo(0, target.radius); ctx.lineTo(-target.radius, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fillStyle = '#efffff'; ctx.fill(); ctx.restore();
    });
    ctx.fillStyle = '#14181b'; ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(360, 500); ctx.lineTo(640, 500); ctx.lineTo(1000, H); ctx.fill();
    if (s.hits >= 6 && !s.emitted) { s.emitted = true; for (let i=0;i<6;i++) emit(500,300,'#87edf4',1,5); setTimeout(() => { if (state.active === 'valorant') unlock('valorant'); }, 950); }
  }
  function drawLor(time) {
    const s = state.scenes.lor;
    const glow = ctx.createRadialGradient(500, 320, 30, 500, 320, 460); glow.addColorStop(0, 'rgba(205,153,66,.13)'); glow.addColorStop(1, 'transparent'); ctx.fillStyle = glow; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#211c13'; ctx.fillRect(74, 110, 852, 390); ctx.strokeStyle = '#8e6935'; ctx.lineWidth = 2; ctx.strokeRect(74, 110, 852, 390);
    ctx.strokeStyle = 'rgba(226,188,122,.14)'; ctx.beginPath(); ctx.ellipse(500, 310, 340, 135, 0, 0, Math.PI * 2); ctx.stroke();
    if (!state.matter || !state.matter.cards) {
      [260, 420, 580, 740].forEach((x, index) => {
        const revealed = s.revealed.includes(index), ornn = index === s.correct, y = 365 + (index % 2) * 12 + Math.sin(time * .001 + index) * 4;
        ctx.save();ctx.translate(x,y);ctx.rotate((index-1.5)*.018);
        ctx.fillStyle=revealed?(ornn?'#563a22':'#28282a'):'#393123';ctx.strokeStyle=revealed&&ornn?'#f3c66c':'#b0925d';ctx.lineWidth=2;
        ctx.beginPath();ctx.roundRect(-63,-90,126,180,5);ctx.fill();ctx.stroke();
        if(revealed&&ornn&&imageReady(characterImages.ornn)){
          ctx.save();ctx.beginPath();ctx.roundRect(-63,-90,126,180,5);ctx.clip();drawCharacterImage('ornn',-63,-90,126,180);ctx.restore();
        }else{
          ctx.fillStyle=revealed?(ornn?'#db8941':'#566170'):'#211d17';ctx.beginPath();ctx.arc(0,-18,32,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='#f2e6ce';ctx.textAlign='center';ctx.font='700 18px Barlow Condensed, sans-serif';ctx.fillText(revealed?['JINX','ORNN','LUX','YASUO'][index]:`0${index+1}`,0,57);
        }
        ctx.restore();
      });
      return;
    }
    const timeFactor = Math.sin(time * .0015) * .0000007;
    state.matter.cards.forEach((body, index) => {
      const revealed = s.revealed.includes(index), isOrnn = index === s.correct;
      if (MatterApi) MatterApi.Body.applyForce(body, body.position, { x: (body.position.x < 500 ? 1 : -1) * .000006 + Math.sin(time * .001 + index) * .000004, y: -0.000012 + Math.cos(time * .0015 + index) * .000005 + timeFactor });
      const { x, y } = body.position;
      ctx.save(); ctx.translate(x, y); ctx.rotate(body.angle);
      ctx.fillStyle = revealed ? (isOrnn ? '#563a22' : '#28282a') : '#393123'; ctx.strokeStyle = revealed && isOrnn ? '#f3c66c' : '#b0925d'; ctx.lineWidth = revealed && isOrnn ? 3 : 1.6;
      ctx.shadowColor = isOrnn && revealed ? 'rgba(251,171,67,.5)' : 'rgba(0,0,0,.7)'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.roundRect(-63,-90,126,180,5); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
      if (revealed && isOrnn && imageReady(characterImages.ornn)) {
        ctx.save(); ctx.beginPath(); ctx.roundRect(-63,-90,126,180,5); ctx.clip(); drawCharacterImage('ornn',-63,-90,126,180); ctx.restore();
      } else if (revealed) {
        ctx.fillStyle = isOrnn ? '#db8941' : '#566170'; ctx.beginPath(); ctx.arc(0,-18,32,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#f2e6ce'; ctx.textAlign='center'; ctx.font='700 20px Barlow Condensed, sans-serif'; ctx.fillText(['JINX','ORNN','LUX','YASUO'][index],0,57);
        ctx.fillStyle = isOrnn ? '#f9cc73' : '#c1bdba'; ctx.font='8px monospace'; ctx.fillText(isOrnn ? 'MAESTRO FORJADOR' : 'CAMPEÓN',0,70);
        if (isOrnn) { ctx.strokeStyle='#f3ba56';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-22,-34);ctx.lineTo(-13,-51);ctx.lineTo(-5,-31);ctx.moveTo(22,-34);ctx.lineTo(13,-51);ctx.lineTo(5,-31);ctx.stroke(); }
      } else {
        ctx.strokeStyle='rgba(218,185,121,.6)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,-57);ctx.lineTo(36,0);ctx.lineTo(0,57);ctx.lineTo(-36,0);ctx.closePath();ctx.stroke();
        ctx.fillStyle='#dbc28c';ctx.textAlign='center';ctx.font='500 11px monospace';ctx.fillText(`0${index+1}`,0,5);
      }
      ctx.restore();
    });
    if (s.forgedAt) {
      const t=(time-s.forgedAt)/1000; ctx.save();ctx.globalAlpha=Math.max(0,1-t/1.8);ctx.font='900 128px Barlow Condensed, sans-serif';ctx.textAlign='center';ctx.fillStyle='#f4c36a';ctx.shadowColor='#f08b35';ctx.shadowBlur=40;ctx.fillText('O',500,350);ctx.restore();
      if (t < .1 && !s.forgeEmitted) { s.forgeEmitted=true;for(let i=0;i<36;i++)emit(500,310,'#f3a344',1,7); }
      if (t>1.5 && !state.completed.lor) unlock('lor');
    }
  }
  function drawFighter(x,y,kind,action,time,flash=0) {
    const fighterImage = characterImages[kind];
    if (imageReady(fighterImage)) {
      ctx.save(); ctx.translate(x,y);
      if (flash > time) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 28; ctx.filter = 'brightness(1.45)'; }
      drawCharacterImage(kind, -125, -285, 250, 285); ctx.restore();
      return;
    }
    ctx.save();ctx.translate(x,y); const isThresh=kind==='thresh'; if (!isThresh) ctx.scale(-1,1);
    if (flash>time) {ctx.shadowColor='#fff';ctx.shadowBlur=28;}
    const accent=isThresh?'#b75ae1':'#91d240', dark=isThresh?'#4c2262':'#344b25';
    ctx.fillStyle='rgba(0,0,0,.5)';ctx.beginPath();ctx.ellipse(0,0,45,9,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=dark;ctx.beginPath();ctx.moveTo(-24,-10);ctx.lineTo(-26,-84);ctx.lineTo(-12,-111);ctx.lineTo(20,-105);ctx.lineTo(31,-62);ctx.lineTo(27,-10);ctx.closePath();ctx.fill();
    ctx.fillStyle=accent;ctx.beginPath();ctx.arc(0,-122,24,0,Math.PI*2);ctx.fill();
    if(isThresh){ctx.strokeStyle='#d5c4dc';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-18,-139);ctx.lineTo(-42,-167);ctx.lineTo(-27,-143);ctx.moveTo(18,-139);ctx.lineTo(43,-166);ctx.lineTo(28,-143);ctx.stroke();ctx.fillStyle='#d9fb81';ctx.fillRect(7,-126,8,4);ctx.fillStyle='#b5dbe0';ctx.beginPath();ctx.arc(35,-68,9,0,Math.PI*2);ctx.fill();}
    else{ctx.strokeStyle='#bddc75';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-18,-133);ctx.lineTo(-34,-153);ctx.moveTo(18,-133);ctx.lineTo(36,-151);ctx.stroke();ctx.fillStyle='#e2eaa1';ctx.fillRect(7,-125,8,5);}
    const attacking=action==='attack'||action==='special';ctx.strokeStyle=accent;ctx.lineWidth=attacking?13:10;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(18,-74);ctx.lineTo(attacking?82:38,-(attacking?68:48));ctx.stroke();ctx.fillStyle='#28212e';ctx.fillRect(-20,-10,15,10);ctx.fillRect(10,-10,15,10);
    ctx.restore();
  }
  function drawFight(time,delta) {
    const s=state.scenes.twoxko,p=s.player,e=s.enemy;
    const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#22172a');bg.addColorStop(.56,'#251b2c');bg.addColorStop(1,'#100d14');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    for(let i=0;i<7;i++){ctx.fillStyle=`rgba(190,85,230,${.025+i*.005})`;ctx.fillRect(45+i*145,120,50,340);}
    ctx.strokeStyle='rgba(221,130,245,.18)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,470);ctx.lineTo(W,470);ctx.stroke();ctx.fillStyle='#1a151f';ctx.fillRect(0,470,W,130);
    for(let i=0;i<20;i++){const x=(i*83+time*.025)%W;ctx.fillStyle='rgba(237,181,255,.26)';ctx.fillRect(x,490+(i*37%95),2,2);}
    if(s.started&&!s.won){
      const f=Math.min(delta/16.67,2);if(state.keys.has('a')){p.vx=-5.5;p.facing=-1;}else if(state.keys.has('d')){p.vx=5.5;p.facing=1;}p.vy+=.65*f;p.y+=p.vy*f;p.x+=p.vx*f;if(!state.keys.has('a')&&!state.keys.has('d'))p.vx*=Math.pow(.86,f);
      if(p.y>=470){p.y=470;p.vy=0;p.grounded=true;} else p.grounded=false;
      p.x=Math.max(80,Math.min(510,p.x));
      const diff=p.x-e.x;
      if(Math.abs(diff)>96)e.vx+=Math.sign(diff)*.12*f;else e.vx*=Math.pow(.72,f);
      e.vx=Math.max(-1.6,Math.min(1.6,e.vx));e.x+=e.vx*f;e.x=Math.max(560,Math.min(880,e.x));
      if(p.actionUntil<time)p.action='';
    }
    drawFighter(p.x,p.y,'thresh',p.action,time);drawFighter(e.x,e.y,'warwick','',time,e.flash);
    ctx.fillStyle='#ece1e9';ctx.textAlign='center';ctx.font='700 14px Barlow Condensed, sans-serif';ctx.fillText('THRESH',p.x,340);ctx.fillText('WARWICK',e.x,340);
    if(p.action&&p.actionUntil>time){ctx.save();ctx.strokeStyle=p.action==='special'?'#db8aff':'#a9e361';ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=25;ctx.lineWidth=p.action==='special'?15:8;ctx.beginPath();ctx.arc(p.x+95,p.y-75,36,-.9,.9);ctx.stroke();ctx.restore();}
    if (e.hp<=0&&!s.won){s.won=true;emit(e.x,e.y-80,'#d984ff',34,8);setTimeout(()=>{if(state.active==='twoxko')unlock('twoxko');},1250);renderUI();}
  }
  function render(time) {
    if(!MatterApi&&window.Matter)MatterApi=window.Matter;
    const delta=state.lastTime?Math.min(time-state.lastTime,16.6):16.6;state.lastTime=time;
    if(!state.active){requestAnimationFrame(render);return;}
    if(state.active==='lol'){
      const match=state.scenes.lol;
      if(match.phase==='search'&&time-match.started>1450){match.phase='found';renderUI();}
    }
    ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);drawBackground(state.active,time);
    if(state.active==='lol')drawLol(time);
    if(state.active==='valorant')drawValorant(time);
    if(state.active==='lor')drawLor(time);
    if(state.active==='twoxko')drawFight(time,delta);
    updateParticles(delta);drawParticles();requestAnimationFrame(render);
  }
  function handleCard(index) {
    const s=state.scenes.lor; if(!s||s.forgedAt)return;
    if(!s.revealed.includes(index)){s.revealed.push(index);if(s.bodies[index]&&MatterApi)MatterApi.Body.applyForce(s.bodies[index],s.bodies[index].position,{x:(Math.random()-.5)*.03,y:-.018});if(index===s.correct){s.chosen=true;showToast('HAS ENCONTRADO A ORNN');}else showToast('CAMPEÓN REVELADO · SIGUE BUSCANDO');renderUI();return;}
    if(index===s.correct){s.chosen=true;renderUI();showToast('ORNN, MAESTRO FORJADOR');}
  }
  function attack(key) {
    const s=state.scenes.twoxko;if(!s||!s.started||s.won)return;
    const p=s.player,e=s.enemy,now=performance.now();if(now-p.lastAttack<430)return;p.lastAttack=now;
    p.action=key==='k'?'special':'attack';p.actionUntil=now+340;
    const range=key==='k'?185:132,damage=key==='k'?27:20;
    if(Math.abs(p.x-e.x)<range&&p.facing>0){e.hp=Math.max(0,e.hp-damage);e.flash=now+240;e.x=Math.min(880,e.x+34);e.vx=4;emit(e.x,e.y-75,key==='k'?'#d984ff':'#a7e46c',16,key==='k'?6:4);}
    else{emit(p.x+80,p.y-78,key==='k'?'#d984ff':'#a7e46c',5,2);}
    renderUI();
  }
  function keyAction(key) {
    const s=state.scenes.twoxko;if(!s||!s.started||s.won)return;
    const p=s.player;
    if(key==='a'||key==='d'){p.vx=key==='a'?-6:6;p.facing=key==='a'?-1:1;}
    if(key==='w'&&p.grounded){p.vy=-12.5;p.grounded=false;}
    if(key==='j'||key==='k')attack(key);
  }
  $('#level-grid').addEventListener('click',event=>{const button=event.target.closest('[data-id]');if(button)enterLevel(button.dataset.id);});
  $('#back-button').addEventListener('click',returnHome);
  $('#reset-button').addEventListener('click',()=>{state.unlocked=[];state.completed={};state.scenes={};save();returnHome();showToast('PROGRESO REINICIADO');});
  $('#complete-return').addEventListener('click',returnHome);
  $('#complete-reset').addEventListener('click',()=>{$('#reset-button').click();});
  ui.addEventListener('click',event=>{
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(action==='accept'){const s=state.scenes.lol;s.phase='champions';renderUI();$('#game-instruction').textContent='Selecciona a Rammus para completar el desafío.';}
    if(action==='forge'){const s=state.scenes.lor;if(s.chosen&&!s.forgedAt){s.forgedAt=performance.now();renderUI();}}
    if(action==='fight-start'){state.scenes.twoxko.started=true;renderUI();}
    const champion=event.target.closest('[data-champion]')?.dataset.champion;
    if(champion){if(champion==='RAMMUS'){const s=state.scenes.lol;s.selected=true;s.phase='reveal';s.revealedAt=performance.now();renderUI();$('#game-instruction').textContent='Rammus aparece en la Grieta…';}else showToast('ESE CAMPEÓN NO ES EL OBJETIVO');}
    const card=event.target.closest('[data-card]')?.dataset.card;if(card!==undefined)handleCard(Number(card));
    const fightKey=event.target.closest('[data-key]')?.dataset.key;if(fightKey)keyAction(fightKey);
  });
  canvas.addEventListener('click',event=>{
    const pos=pointerPosition(event),id=state.active;
    if(id==='valorant'){
      const s=state.scenes.valorant;if(s.hits>=6)return;
      const hit=s.targets.find(target=>Math.hypot(pos.x-target.liveX,pos.y-target.liveY)<target.radius+10);
      if(hit){s.hits++;emit(hit.liveX,hit.liveY,'#85eff5',18,5);hit.phase+=2.6;hit.x=120+Math.random()*760;hit.y=160+Math.random()*225;renderUI();$('#game-instruction').textContent=`Impactos confirmados: ${s.hits} de 6.`;}
      else emit(pos.x,pos.y,'#e65b5e',4,2);
    }
    if(id==='lor'&&state.matter?.cards){const s=state.scenes.lor;const index=state.matter.cards.findIndex(body=>Math.abs(pos.x-body.position.x)<64&&Math.abs(pos.y-body.position.y)<90);if(index>=0)handleCard(index);}
  });
  window.addEventListener('keydown',event=>{
    if(!state.active||state.active!=='twoxko')return;
    const key=event.key.toLowerCase();if(['a','d','w','j','k',' '].includes(key)){event.preventDefault();if(key==='a'||key==='d')state.keys.add(key);keyAction(key);}
  });
  window.addEventListener('keyup',event=>{const key=event.key.toLowerCase();if(['a','d'].includes(key)){state.keys.delete(key);if(state.active==='twoxko')state.scenes.twoxko.player.vx*=.35;}});
  ui.addEventListener('pointerdown',event=>{const key=event.target.closest('[data-key]')?.dataset.key;if(key==='a'||key==='d')state.keys.add(key);});
  window.addEventListener('pointerup',()=>{state.keys.delete('a');state.keys.delete('d');});
  window.addEventListener('resize',resizeCanvas);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)state.lastTime=performance.now();});
  renderHome();requestAnimationFrame(render);
})();