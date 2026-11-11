const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const startOverlay = document.getElementById("start-overlay");
const draftOverlay = document.getElementById("draft-overlay");
const cardContainer = document.getElementById("card-container");
const titleText = document.getElementById("title-text");
const subtitleText = document.getElementById("subtitle-text");
const startBtn = document.getElementById("start-btn");

const waveEl = document.getElementById("wave-el");
const hpEl = document.getElementById("hp-el");
const maxHpEl = document.getElementById("maxhp-el");
const scoreEl = document.getElementById("score-el");
const scrapEl = document.getElementById("scrap-el");

let meta = JSON.parse(localStorage.getItem("cosmicRogueMeta")) || {
  scrap: 0,
  hpLv: 0,
  dmgLv: 0,
  spdLv: 0
};

// --- AUDIO SYSTEM ---
let audioCtx = null;
let musicInterval = null;
let currentBeat = 0;

const NOTES = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25
};

const BASS_LINE = [
  'A3', 'A3', 'C4', 'A3', 'G3', 'G3', 'B3', 'G3',
  'F3', 'F3', 'A3', 'F3', 'E3', 'G3', 'B3', 'E3'
];

const MELODY = [
  'A4', null, 'C5', 'B4', null, 'G4', 'A4', null,
  'F4', 'A4', 'C5', 'E5', 'D5', null, 'B4', null
];

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playTone(freq, type, duration, volume) {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch(e) {}
}

function startMusic() {
  initAudio();
  if (musicInterval) clearInterval(musicInterval);
  const stepDuration = 60 / 130 / 2; 
  musicInterval = setInterval(() => {
    if (gameState !== "PLAYING") return;
    const bassNote = BASS_LINE[currentBeat % BASS_LINE.length];
    if (bassNote && NOTES[bassNote]) {
      playTone(NOTES[bassNote], 'sawtooth', stepDuration * 0.9, 0.06);
    }
    const leadNote = MELODY[currentBeat % MELODY.length];
    if (leadNote && NOTES[leadNote]) {
      playTone(NOTES[leadNote], 'square', stepDuration * 1.5, 0.03);
    }
    currentBeat++;
  }, stepDuration * 1000);
}

function stopMusic() {
  if (musicInterval) {
    clearInterval(musicInterval);
    musicInterval = null;
  }
}

function saveMeta() {
  localStorage.setItem("cosmicRogueMeta", JSON.stringify(meta));
  updateMetaUI();
}

function updateMetaUI() {
  scrapEl.textContent = meta.scrap;
  document.getElementById("meta-hp-lv").textContent = meta.hpLv;
  document.getElementById("meta-dmg-lv").textContent = meta.dmgLv;
  document.getElementById("meta-spd-lv").textContent = meta.spdLv;

  const hpCost = 15 + meta.hpLv * 10;
  const dmgCost = 20 + meta.dmgLv * 15;
  const spdCost = 15 + meta.spdLv * 10;

  const buyHpBtn = document.getElementById("buy-hp-btn");
  const buyDmgBtn = document.getElementById("buy-dmg-btn");
  const buySpdBtn = document.getElementById("buy-spd-btn");

  buyHpBtn.textContent = `Upgrade (${hpCost} Scrap)`;
  buyDmgBtn.textContent = `Upgrade (${dmgCost} Scrap)`;
  buySpdBtn.textContent = `Upgrade (${spdCost} Scrap)`;

  buyHpBtn.disabled = meta.scrap < hpCost;
  buyDmgBtn.disabled = meta.scrap < dmgCost;
  buySpdBtn.disabled = meta.scrap < spdCost;
}

document.getElementById("buy-hp-btn").onclick = () => {
  const cost = 15 + meta.hpLv * 10;
  if (meta.scrap >= cost) { meta.scrap -= cost; meta.hpLv++; saveMeta(); }
};
document.getElementById("buy-dmg-btn").onclick = () => {
  const cost = 20 + meta.dmgLv * 15;
  if (meta.scrap >= cost) { meta.scrap -= cost; meta.dmgLv++; saveMeta(); }
};
document.getElementById("buy-spd-btn").onclick = () => {
  const cost = 15 + meta.spdLv * 10;
  if (meta.scrap >= cost) { meta.scrap -= cost; meta.spdLv++; saveMeta(); }
};

let gameState = "MENU";
let player, bullets, enemyBullets, enemies, pickups, particles, stars;
let wave, enemiesToSpawn, spawnCooldown, score, keys, lastShotTime;
let bossWarningActive = false;
let bossWarningTimer = 0;

const UPGRADES = [
  { id: "multishot", title: "Split Barrel", desc: "+1 Projectile per shot (adds spread).", apply: () => player.projectiles++ },
  { id: "firerate", title: "Overclocked Core", desc: "+25% Fire Rate.", apply: () => player.fireDelay *= 0.8 },
  { id: "damage", title: "Heavy Plasma", desc: "+35% Bullet Damage.", apply: () => player.damage *= 1.35 },
  { id: "pierce", title: "Railgun Rounds", desc: "Bullets pierce through +1 extra enemy.", apply: () => player.pierce++ },
  { id: "heal", title: "Nano-Repair", desc: "Restore 40 Hull HP and gain +15 Max HP.", apply: () => { player.maxHp += 15; player.hp = Math.min(player.maxHp, player.hp + 40); } },
  { id: "drone", title: "Auto-Turret Drone", desc: "Adds an orbiting drone that shoots automatically.", apply: () => player.drones++ },
  { id: "magnet", title: "Tractor Beam", desc: "Doubles Scrap pickup range and +15% Move Speed.", apply: () => { player.magnetRange *= 2; player.speed *= 1.15; } },
  { id: "crit", title: "Targeting Matrix", desc: "+20% Chance for 2.5x Critical Hits.", apply: () => player.critChance += 0.20 },
  { 
    id: "chrono_drive", 
    title: "Chrono-Warp Drive", 
    desc: "Defeating an enemy grants a 12% speed and fire rate boost for 2.5s (Stacks up to 3x).", 
    apply: () => {
      player.chronoDrive = (player.chronoDrive || 0) + 1;
      player.chronoStacks = 0;
      player.chronoTimer = 0;
    } 
  },
  { 
    id: "shield_generator", 
    title: "Aegis Energy Shield", 
    desc: "Generates a shield that absorbs 35 damage. Recharges completely at start of each wave.", 
    apply: () => {
      player.hasShield = true;
      player.maxShield = (player.maxShield || 0) + 35;
      player.shield = player.maxShield;
    } 
  },
  { 
    id: "tesla_coil", 
    title: "Tesla Discharge Coil", 
    desc: "Every 4 seconds, fires an electric arc at the nearest enemy dealing 2x damage.", 
    apply: () => {
      player.teslaCoil = (player.teslaCoil || 0) + 1;
      player.teslaTimer = 0;
    } 
  },
  { 
    id: "singularity", 
    title: "Singularity Core", 
    desc: "Destroying a BRUISER or BOSS creates a black hole that pulls enemies in and burns them.", 
    apply: () => {
      player.singularityCore = (player.singularityCore || 0) + 1;
      player.blackHoles = player.blackHoles || [];
    } 
  }
];

function initStars() {
  stars = [];
  for (let i = 0; i < 60; i++) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 2 + 0.5,
      speed: Math.random() * 1.5 + 0.5
    });
  }
}

function startRun() {
  initAudio();
  startMusic();
  
  const baseHp = 100 + meta.hpLv * 20;
  player = {
    x: canvas.width / 2 - 18,
    y: canvas.height - 65,
    width: 36,
    height: 28,
    hp: baseHp,
    maxHp: baseHp,
    speed: 5.5 * (1 + meta.spdLv * 0.1),
    damage: 12 * (1 + meta.dmgLv * 0.15),
    fireDelay: 240,
    projectiles: 1,
    pierce: 0,
    drones: 0,
    magnetRange: 65,
    critChance: 0.05,
    droneAngle: 0,
    chronoDrive: 0,
    chronoStacks: 0,
    chronoTimer: 0,
    hasShield: false,
    shield: 0,
    maxShield: 0,
    teslaCoil: 0,
    teslaTimer: 0,
    singularityCore: 0,
    blackHoles: []
  };

  bullets = [];
  enemyBullets = [];
  enemies = [];
  pickups = [];
  particles = [];
  keys = {};
  lastShotTime = 0;
  wave = 0;
  score = 0;

  startOverlay.classList.add("hidden");
  draftOverlay.classList.add("hidden");
  gameState = "PLAYING";
  nextWave();
  updateHUD();
}

function nextWave() {
  wave++;
  if (player && player.hasShield) {
    player.shield = player.maxShield;
  }
  
  if (wave % 5 === 0) {
    bossWarningActive = true;
    bossWarningTimer = 150;
    enemiesToSpawn = 0;
    spawnCooldown = 9999;
  } else {
    bossWarningActive = false;
    enemiesToSpawn = 5 + wave * 3;
    spawnCooldown = 30;
  }
  updateHUD();
}

function spawnBoss() {
  let bossType = "CORRUPT_CORE";
  let name = "Nexus Core Destroyer";
  let maxHp = 300 + wave * 90;
  let color = "#e63946";
  let width = 110;
  let height = 75;

  if (wave === 10) {
    bossType = "VOID_STALKER";
    name = "Void Stalker: Phase Mirage";
    maxHp = 1400;
    color = "#7209b7";
    width = 90;
    height = 90;
  } else if (wave >= 15) {
    bossType = "STAR_DEVOURER";
    name = "Goliath Star-Devourer";
    maxHp = 2500 + (wave - 15) * 200;
    color = "#ffb703";
    width = 150;
    height = 95;
  }

  enemies.push({
    type: "BOSS",
    bossType: bossType,
    name: name,
    x: canvas.width / 2 - width / 2,
    y: -height - 20,
    width: width,
    height: height,
    hp: maxHp,
    maxHp: maxHp,
    speed: 0.8,
    vx: 1.8,
    shootTimer: 0,
    stateTimer: 0,
    phase: 1,
    scrapValue: 20 + wave * 3,
    scoreValue: 1000 + wave * 200
  });
}

function spawnEnemy() {
  const roll = Math.random();
  let type = "BASIC";
  let width = 30, height = 28, hp = 18 + wave * 5, speed = 1.8 + Math.random(), scrapValue = 1, scoreValue = 20;

  if (wave >= 2 && roll < 0.25) {
    type = "SWARMER";
    width = 20; height = 20; hp = 10 + wave * 2; speed = 3.5; scrapValue = 1; scoreValue = 15;
  } else if (wave >= 3 && roll > 0.78) {
    type = "BRUISER";
    width = 44; height = 40; hp = 55 + wave * 14; speed = 1.0; scrapValue = 3; scoreValue = 50;
  } else if (wave >= 4 && roll >= 0.25 && roll <= 0.42) {
    type = "SNIPER";
    width = 28; height = 32; hp = 24 + wave * 6; speed = 1.3; scrapValue = 2; scoreValue = 35;
  }

  enemies.push({
    type,
    x: Math.random() * (canvas.width - width),
    y: -height,
    width,
    height,
    hp,
    maxHp: hp,
    speed,
    vx: 0,
    shootTimer: Math.floor(Math.random() * 60),
    scrapValue,
    scoreValue
  });
}

function firePlayerWeapon(now) {
  if (now - lastShotTime < player.fireDelay) return;
  lastShotTime = now;

  const count = player.projectiles;
  const spread = 0.14;
  const startAngle = -Math.PI / 2 - ((count - 1) * spread) / 2;

  for (let i = 0; i < count; i++) {
    const angle = startAngle + i * spread;
    const isCrit = Math.random() < player.critChance;
    bullets.push({
      x: player.x + player.width / 2,
      y: player.y,
      vx: Math.cos(angle) * 9,
      vy: Math.sin(angle) * 9,
      radius: isCrit ? 5 : 3.5,
      damage: isCrit ? player.damage * 2.5 : player.damage,
      pierceLeft: player.pierce,
      hitList: [],
      isCrit
    });
  }
}

function createExplosion(x, y, color, count = 10) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = Math.random() * 3 + 1;
    particles.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      life: 25 + Math.random() * 15,
      color
    });
  }
}

function openDraft() {
  gameState = "DRAFT";
  cardContainer.innerHTML = "";
  const shuffled = [...UPGRADES].sort(() => 0.5 - Math.random()).slice(0, 3);

  shuffled.forEach(upg => {
    const card = document.createElement("div");
    card.className = "upgrade-card";
    card.innerHTML = `<div class="card-title">${upg.title}</div><div class="card-desc">${upg.desc}</div>`;
    card.onclick = () => {
      upg.apply();
      draftOverlay.classList.add("hidden");
      gameState = "PLAYING";
      nextWave();
    };
    cardContainer.appendChild(card);
  });

  draftOverlay.classList.remove("hidden");
}

function updateHUD() {
  waveEl.textContent = wave;
  hpEl.textContent = Math.max(0, Math.ceil(player.hp));
  maxHpEl.textContent = Math.ceil(player.maxHp);
  scoreEl.textContent = score;
  scrapEl.textContent = meta.scrap;
}

function gameOver() {
  gameState = "MENU";
  stopMusic();
  saveMeta();
  titleText.textContent = "SHIP DESTROYED";
  subtitleText.textContent = `Reached Sector ${wave} | Final Score: ${score}`;
  startBtn.textContent = "LAUNCH NEW RUN";
  startOverlay.classList.remove("hidden");
}

function update(now) {
  stars.forEach(s => {
    s.y += s.speed;
    if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width; }
  });

  if (gameState !== "PLAYING") return;

  if (keys["ArrowLeft"] || keys["a"] || keys["A"]) player.x -= player.speed;
  if (keys["ArrowRight"] || keys["d"] || keys["D"]) player.x += player.speed;
  if (keys["ArrowUp"] || keys["w"] || keys["W"]) player.y -= player.speed;
  if (keys["ArrowDown"] || keys["s"] || keys["S"]) player.y += player.speed;

  player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));
  player.y = Math.max(canvas.height * 0.35, Math.min(canvas.height - player.height, player.y));

  // Chrono-Warp Upgrades
  if (player.chronoStacks > 0) {
    player.chronoTimer--;
    if (player.chronoTimer <= 0) player.chronoStacks = 0;
  }

  // Tesla Discharge Auto Trigger
  if (player.teslaCoil > 0 && enemies.length > 0) {
    player.teslaTimer++;
    if (player.teslaTimer >= 240) {
      player.teslaTimer = 0;
      let closestEnemy = null;
      let minDist = Infinity;
      enemies.forEach(e => {
        let d = Math.hypot((e.x + e.width/2) - (player.x + player.width/2), (e.y + e.height/2) - (player.y + player.height/2));
        if (d < minDist) { minDist = d; closestEnemy = e; }
      });
      if (closestEnemy) {
        closestEnemy.hp -= player.damage * 2 * player.teslaCoil;
        createExplosion(closestEnemy.x + closestEnemy.width/2, closestEnemy.y + closestEnemy.height/2, "#00bbf9", 12);
      }
    }
  }

  // Shoot Modifier Calculation
  const originalFireDelay = player.fireDelay;
  if (player.chronoStacks > 0) {
    player.fireDelay *= (1 - (player.chronoStacks * 0.15)); 
  }
  firePlayerWeapon(now);
  player.fireDelay = originalFireDelay;

  if (player.drones > 0) {
    player.droneAngle += 0.05;
    if (Math.floor(now / 450) !== Math.floor((now - 16) / 450)) {
      for (let d = 0; d < player.drones; d++) {
        const a = player.droneAngle + (d * Math.PI * 2) / player.drones;
        const dx = player.x + player.width / 2 + Math.cos(a) * 38;
        const dy = player.y + player.height / 2 + Math.sin(a) * 38;
        bullets.push({
          x: dx, y: dy, vx: 0, vy: -8, radius: 2.5,
          damage: player.damage * 0.5, pierceLeft: 0, hitList: [], isCrit: false
        });
      }
    }
  }

  // Boss Warning Interceptor Execution
  if (bossWarningActive) {
    bossWarningTimer--;
    if (bossWarningTimer % 30 === 0 && bossWarningTimer > 0) {
      playTone(380, 'sawtooth', 0.2, 0.08);
      playTone(190, 'square', 0.25, 0.04);
    }
    if (bossWarningTimer <= 0) {
      bossWarningActive = false;
      spawnBoss();
    }
    return;
  }

  if (enemiesToSpawn > 0) {
    spawnCooldown--;
    if (spawnCooldown <= 0) {
      spawnEnemy();
      enemiesToSpawn--;
      spawnCooldown = Math.max(18, 52 - wave * 2);
    }
  } else if (enemies.length === 0) {
    openDraft();
    return;
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx;
    b.y += b.vy;
    if (b.y < -20 || b.x < -20 || b.x > canvas.width + 20) bullets.splice(i, 1);
  }

  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const eb = enemyBullets[i];
    eb.x += eb.vx;
    eb.y += eb.vy;
    if (eb.y > canvas.height + 20 || eb.x < -20 || eb.x > canvas.width + 20) {
      enemyBullets.splice(i, 1);
      continue;
    }
    if (
      eb.x > player.x && eb.x < player.x + player.width &&
      eb.y > player.y && eb.y < player.y + player.height
    ) {
      let dmg = eb.damage;
      if (player.hasShield && player.shield > 0) {
        if (player.shield >= dmg) { player.shield -= dmg; dmg = 0; }
        else { dmg -= player.shield; player.shield = 0; }
        createExplosion(player.x + player.width/2, player.y, "#cbd5e1", 8);
      }
      player.hp -= dmg;
      createExplosion(eb.x, eb.y, "#ff4c4c", 6);
      enemyBullets.splice(i, 1);
      updateHUD();
      if (player.hp <= 0) { gameOver(); return; }
    }
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];

    if (e.type === "BOSS") {
      if (e.y < 55) {
        e.y += e.speed;
      } else {
        e.x += e.vx;
        if (e.x <= 15 || e.x + e.width >= canvas.width - 15) e.vx *= -1;
      }

      e.shootTimer++;
      e.stateTimer++;

      if (e.bossType === "CORRUPT_CORE") {
        if (e.shootTimer >= 65) {
          e.shootTimer = 0;
          for (let k = -1; k <= 1; k++) {
            enemyBullets.push({ x: e.x + e.width / 2, y: e.y + e.height, vx: k * 1.8, vy: 4.2, damage: 15 });
          }
        }
      } else if (e.bossType === "VOID_STALKER") {
        e.isPhased = (e.stateTimer % 300 < 120);
        if (e.shootTimer >= 45) {
          e.shootTimer = 0;
          if (e.hp < e.maxHp * 0.5) {
            const angle = Math.atan2(player.y - (e.y + e.height), player.x - (e.x + e.width/2));
            enemyBullets.push({ x: e.x + e.width / 2, y: e.y + e.height, vx: Math.cos(angle) * 5.5, vy: Math.sin(angle) * 5.5, damage: 18 });
          } else {
            let angleOffset = (e.stateTimer * 0.1);
            enemyBullets.push({ x: e.x + e.width / 2, y: e.y + e.height, vx: Math.cos(angleOffset) * 3, vy: 4, damage: 12 });
          }
        }
      } else if (e.bossType === "STAR_DEVOURER") {
        let stance = Math.floor(e.stateTimer / 240) % 2;
        if (stance === 0 && e.shootTimer >= 20) {
          e.shootTimer = 0;
          enemyBullets.push({ x: e.x + Math.random() * e.width, y: e.y + e.height, vx: (Math.random() - 0.5) * 1, vy: 4.8, damage: 14 });
        } else if (stance === 1 && e.shootTimer >= 90) {
          e.shootTimer = 0;
          for (let deg = 0; deg < 8; deg++) {
            let rad = (deg * Math.PI) / 4;
            enemyBullets.push({ x: e.x + e.width / 2, y: e.y + e.height / 2, vx: Math.cos(rad) * 3.2, vy: Math.sin(rad) * 3.2, damage: 20 });
          }
        }
      }
    } else {
      e.y += e.speed;
      if (e.type === "SNIPER") {
        e.shootTimer++;
        if (e.shootTimer >= 110) {
          e.shootTimer = 0;
          const angle = Math.atan2(player.y - e.y, player.x - e.x);
          enemyBullets.push({ x: e.x + e.width / 2, y: e.y + e.height, vx: Math.cos(angle) * 3.5, vy: Math.sin(angle) * 3.5, damage: 12 });
        }
      }
    }

    if (
      e.x < player.x + player.width && e.x + e.width > player.x &&
      e.y < player.y + player.height && e.y + e.height > player.y
    ) {
      let crashDmg = 20;
      if (player.hasShield && player.shield > 0) {
        if (player.shield >= crashDmg) { player.shield -= crashDmg; crashDmg = 0; }
        else { crashDmg -= player.shield; player.shield = 0; }
      }
      player.hp -= crashDmg;
      createExplosion(e.x + e.width / 2, e.y + e.height / 2, "#ff4c4c", 12);
      if (e.type !== "BOSS") enemies.splice(i, 1);
      updateHUD();
      if (player.hp <= 0) { gameOver(); return; }
      continue;
    }

    if (e.y > canvas.height) {
      player.hp -= 10;
      enemies.splice(i, 1);
      updateHUD();
      if (player.hp <= 0) { gameOver(); return; }
      continue;
    }

    for (let j = bullets.length - 1; j >= 0; j--) {
      const b = bullets[j];
      if (b.hitList.includes(e)) continue;

      if (
        b.x + b.radius > e.x && b.x - b.radius < e.x + e.width &&
        b.y + b.radius > e.y && b.y - b.radius < e.y + e.height
      ) {
        if (e.type === "BOSS" && e.isPhased) continue;

        e.hp -= b.damage;
        b.hitList.push(e);
        createExplosion(b.x, b.y, b.isCrit ? "#ffd166" : "#66fcf1", 4);

        if (b.pierceLeft > 0) b.pierceLeft--;
        else bullets.splice(j, 1);

        if (e.hp <= 0) {
          if (player.chronoDrive > 0) {
            player.chronoStacks = Math.min(3, player.chronoStacks + 1);
            player.chronoTimer = 150;
          }
          if (player.singularityCore > 0 && (e.type === "BRUISER" || e.type === "BOSS")) {
            player.blackHoles.push({ x: e.x + e.width / 2, y: e.y + e.height / 2, radius: 90, duration: 180, damage: 1.5 * player.singularityCore });
          }

          score += e.scoreValue;
          createExplosion(e.x + e.width / 2, e.y + e.height / 2, "#ff9f1c", 16);
          for (let s = 0; s < e.scrapValue; s++) {
            pickups.push({ x: e.x + e.width / 2 + (Math.random() - 0.5) * 20, y: e.y + e.height / 2, vy: 1.5 });
          }
          enemies.splice(i, 1);
          updateHUD();
          break;
        }
      }
    }
  }

  // Black Hole Pull Loop
  if (player.blackHoles && player.blackHoles.length > 0) {
    for (let bIdx = player.blackHoles.length - 1; bIdx >= 0; bIdx--) {
      let bh = player.blackHoles[bIdx];
      bh.duration--;
      enemies.forEach(e => {
        let dx = bh.x - (e.x + e.width/2);
        let dy = bh.y - (e.y + e.height/2);
        let dist = Math.hypot(dx, dy);
        if (dist < bh.radius) {
          e.x += (dx / dist) * 2.2; e.y += (dy / dist) * 2.2;
          e.hp -= bh.damage;
        }
      });
      for (let eIdx = enemies.length - 1; eIdx >= 0; eIdx--) {
        if (enemies[eIdx].hp <= 0) {
          score += enemies[eIdx].scoreValue;
          createExplosion(enemies[eIdx].x + enemies[eIdx].width/2, enemies[eIdx].y + enemies[eIdx].height/2, "#ff9f1c", 10);
          enemies.splice(eIdx, 1);
        }
      }
      if (bh.duration <= 0) player.blackHoles.splice(bIdx, 1);
    }
  }

  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    const dx = (player.x + player.width / 2) - p.x;
    const dy = (player.y + player.height / 2) - p.y;
    const dist = Math.hypot(dx, dy);

    if (dist < player.magnetRange) {
      p.x += (dx / dist) * 6; p.y += (dy / dist) * 6;
    } else {
      p.y += p.vy;
    }

    if (dist < 24) {
      meta.scrap++; pickups.splice(i, 1); updateHUD();
    } else if (p.y > canvas.height + 20) {
      pickups.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.x += pt.vx; pt.y += pt.vy; pt.life--;
    if (pt.life <= 0) particles.splice(i, 1);
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";
  stars.forEach(s => {
    ctx.globalAlpha = s.speed / 2.5;
    ctx.fillRect(s.x, s.y, s.size, s.size);
  });
  ctx.globalAlpha = 1;

  if (gameState === "MENU") return;

  // Render Singularity Core Black Holes
  if (player.blackHoles) {
    player.blackHoles.forEach(bh => {
      ctx.strokeStyle = "rgba(114, 9, 183, 0.4)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(bh.x, bh.y, bh.radius * (0.5 + Math.random()*0.5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#7209b7";
      ctx.beginPath(); ctx.arc(bh.x, bh.y, 8, 0, Math.PI * 2); ctx.fill();
    });
  }

  // Render Loot Shards (Crystal Gradients)
  pickups.forEach(p => {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((Date.now() / 250) % (Math.PI * 2));
    let scrapGrad = ctx.createLinearGradient(-5, -5, 5, 5);
    scrapGrad.addColorStop(0, "#fff3b0"); scrapGrad.addColorStop(0.5, "#ffd166"); scrapGrad.addColorStop(1, "#e3a857");
    ctx.fillStyle = scrapGrad;
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(5, 0); ctx.lineTo(0, 6); ctx.lineTo(-5, 0); ctx.closePath();
    ctx.shadowColor = "#ffd166"; ctx.shadowBlur = 5; ctx.fill();
    ctx.restore();
  });

  // Render Player Ship (Procedural Texture & Flame)
  const cx = player.x + player.width / 2;
  let thrusterGlow = ctx.createLinearGradient(cx, player.y + player.height, cx, player.y + player.height + 15);
  thrusterGlow.addColorStop(0, "rgba(255, 114, 0, 0.9)"); thrusterGlow.addColorStop(0.5, "rgba(255, 209, 102, 0.6)"); thrusterGlow.addColorStop(1, "rgba(255, 0, 0, 0)");
  ctx.fillStyle = thrusterGlow;
  ctx.beginPath(); ctx.moveTo(cx - 6, player.y + player.height - 2); ctx.lineTo(cx, player.y + player.height + 8 + Math.random() * 8); ctx.lineTo(cx + 6, player.y + player.height - 2); ctx.closePath(); ctx.fill();

  let shipGradient = ctx.createLinearGradient(player.x, player.y, player.x + player.width, player.y);
  shipGradient.addColorStop(0, "#1f283d"); shipGradient.addColorStop(0.3, "#45a29e"); shipGradient.addColorStop(0.5, "#66fcf1"); shipGradient.addColorStop(0.7, "#45a29e"); shipGradient.addColorStop(1, "#1f283d");
  ctx.fillStyle = shipGradient;
  ctx.beginPath(); ctx.moveTo(cx, player.y); ctx.lineTo(player.x + player.width, player.y + player.height); ctx.lineTo(cx, player.y + player.height - 5); ctx.lineTo(player.x, player.y + player.height); ctx.closePath();
  ctx.shadowColor = "#66fcf1"; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx, player.y); ctx.lineTo(cx, player.y + player.height - 5); ctx.moveTo(player.x + 8, player.y + player.height - 2); ctx.lineTo(cx, player.y + player.height - 8); ctx.lineTo(player.x + player.width - 8, player.y + player.height - 2); ctx.stroke();

  // Aegis Energy Shield Arc Bubble
  if (player.hasShield && player.shield > 0) {
    ctx.strokeStyle = "rgba(102, 252, 241, " + (player.shield / player.maxShield) + ")";
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(player.x + player.width / 2, player.y + player.height / 2, player.width, 0, Math.PI * 2); ctx.stroke();
  }

  for (let d = 0; d < player.drones; d++) {
    const a = player.droneAngle + (d * Math.PI * 2) / player.drones;
    const dx = player.x + player.width / 2 + Math.cos(a) * 38;
    const dy = player.y + player.height / 2 + Math.sin(a) * 38;
    ctx.fillStyle = "#00bbf9"; ctx.beginPath(); ctx.arc(dx, dy, 5, 0, Math.PI * 2); ctx.fill();
  }

  // Player Bullets
  bullets.forEach(b => {
    let bGrad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
    if (b.isCrit) { bGrad.addColorStop(0, "#ffffff"); bGrad.addColorStop(0.3, "#ffd166"); bGrad.addColorStop(1, "rgba(247, 37, 133, 0)"); }
    else { bGrad.addColorStop(0, "#ffffff"); bGrad.addColorStop(0.4, "#66fcf1"); bGrad.addColorStop(1, "rgba(69, 162, 158, 0)"); }
    ctx.fillStyle = bGrad; ctx.beginPath(); ctx.arc(b.x, b.y, b.radius * 2, 0, Math.PI * 2); ctx.fill();
  });

  // Enemy Bullets
  enemyBullets.forEach(eb => {
    let ebGrad = ctx.createRadialGradient(eb.x, eb.y, 0, eb.x, eb.y, 4.5);
    ebGrad.addColorStop(0, "#ffffff"); ebGrad.addColorStop(0.4, "#ff4c4c"); ebGrad.addColorStop(1, "rgba(230, 57, 70, 0)");
    ctx.fillStyle = ebGrad; ctx.beginPath(); ctx.arc(eb.x, eb.y, 9, 0, Math.PI * 2); ctx.fill();
  });

  // Render Layered Enemies
  enemies.forEach(e => {
    ctx.save();
    let textGlow = "#ff4c4c";
    let grad = ctx.createLinearGradient(e.x, e.y, e.x + e.width, e.y + e.height);

    if (e.type === "SWARMER") { textGlow = "#f72585"; grad.addColorStop(0, "#7209b7"); grad.addColorStop(0.5, "#f72585"); grad.addColorStop(1, "#4cc9f0"); }
    else if (e.type === "BRUISER") { textGlow = "#b5179e"; grad.addColorStop(0, "#3a0ca3"); grad.addColorStop(0.3, "#7209b7"); grad.addColorStop(1, "#b5179e"); }
    else if (e.type === "SNIPER") { textGlow = "#ff9f1c"; grad.addColorStop(0, "#d90429"); grad.addColorStop(0.6, "#ff9f1c"); grad.addColorStop(1, "#ffeedb"); }
    else if (e.type === "BOSS") {
      if (e.bossType === "VOID_STALKER") { textGlow = "#7209b7"; ctx.globalAlpha = e.isPhased ? 0.20 : 0.9; grad.addColorStop(0, "#10002b"); grad.addColorStop(0.5, "#5a189a"); grad.addColorStop(1, "#e0aaff"); }
      else if (e.bossType === "STAR_DEVOURER") { textGlow = "#ffb703"; grad.addColorStop(0, "#ffb703"); grad.addColorStop(0.5, "#fb8500"); grad.addColorStop(1, "#d00000"); }
      else { textGlow = "#e63946"; grad.addColorStop(0, "#1d3557"); grad.addColorStop(0.5, "#e63946"); grad.addColorStop(1, "#f1faee"); }
    } else { grad.addColorStop(0, "#2b2d42"); grad.addColorStop(0.5, "#ef233c"); grad.addColorStop(1, "#d90429"); }

    ctx.fillStyle = grad; ctx.shadowColor = textGlow; ctx.shadowBlur = e.type === "BOSS" ? 18 : 6;
    ctx.fillRect(e.x, e.y, e.width, e.height); ctx.shadowBlur = 0;

    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)"; ctx.lineWidth = 2; ctx.strokeRect(e.x + 2, e.y + 2, e.width - 4, e.height - 4);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)"; ctx.lineWidth = 1; ctx.beginPath();
    for (let lY = e.y + 6; lY < e.y + e.height - 4; lY += 8) { ctx.moveTo(e.x + 4, lY); ctx.lineTo(e.x + e.width - 4, lY); }
    ctx.stroke();

    ctx.fillStyle = "#ffffff"; ctx.fillRect(e.x + e.width * 0.25, e.y + e.height * 0.2, e.width * 0.5, e.type === "BOSS" ? 6 : 3);
    ctx.restore();

    if (e.type === "BRUISER" || e.type === "BOSS") {
      ctx.fillStyle = "#1e293b"; ctx.fillRect(e.x, e.y - 12, e.width, 6);
      ctx.fillStyle = e.type === "BOSS" ? "#e63946" : "#06d6a0";
      ctx.fillRect(e.x, e.y - 12, e.width * Math.max(0, e.hp / e.maxHp), 6);
      if (e.type === "BOSS") {
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 11px 'Segoe UI', sans-serif"; ctx.textAlign = "center";
        ctx.fillText(e.name || "BOSS", e.x + e.width / 2, e.y - 18); ctx.textAlign = "left";
      }
    }
  });

  particles.forEach(pt => {
    ctx.fillStyle = pt.color; ctx.globalAlpha = pt.life / 40; ctx.fillRect(pt.x, pt.y, 3, 3);
  });
  ctx.globalAlpha = 1;

  // Boss Flash Warning Display
  if (bossWarningActive && gameState === "PLAYING") {
    let pulse = Math.abs(Math.sin(bossWarningTimer * 0.15));
    ctx.fillStyle = `rgba(230, 57, 70, ${pulse * 0.25})`; ctx.fillRect(0, canvas.height / 2 - 50, canvas.width, 90);
    ctx.strokeStyle = `rgba(230, 57, 70, ${pulse})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, canvas.height / 2 - 50); ctx.lineTo(canvas.width, canvas.height / 2 - 50); ctx.moveTo(0, canvas.height / 2 + 40); ctx.lineTo(canvas.width, canvas.height / 2 + 40); ctx.stroke();
    ctx.fillStyle = `rgba(255, 255, 255, ${pulse})`; ctx.font = "bold 24px 'Segoe UI', sans-serif"; ctx.textAlign = "center";
    ctx.fillText("! WARNING: BOSSCRAFT DETECTED !", canvas.width / 2, canvas.height / 2 - 12);
    ctx.font = "14px 'Segoe UI', sans-serif"; ctx.fillStyle = "#a8b2d1";
    ctx.fillText("HOSTILE CAPITAL VESSEL WARPING INTO SECTOR", canvas.width / 2, canvas.height / 2 + 18);
    ctx.textAlign = "left";
  }
}

function loop(now) {
  update(now);
  draw();
  requestAnimationFrame(loop);
}

startBtn.addEventListener("click", startRun);

window.addEventListener("keydown", e => {
  keys[e.key] = true;
  if (e.code === "Space") e.preventDefault();
});

window.addEventListener("keyup", e => {
  keys[e.key] = false;
});

canvas.addEventListener("mousemove", e => {
  if (gameState !== "PLAYING") return;
  const rect = canvas.getBoundingClientRect();
  player.x = (e.clientX - rect.left) - player.width / 2;
  player.y = (e.clientY - rect.top) - player.height / 2;
});

initStars();
updateMetaUI();
requestAnimationFrame(loop);
