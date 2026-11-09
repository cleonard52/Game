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

const UPGRADES = [
  { id: "multishot", title: "Split Barrel", desc: "+1 Projectile per shot (adds spread).", apply: () => player.projectiles++ },
  { id: "firerate", title: "Overclocked Core", desc: "+25% Fire Rate.", apply: () => player.fireDelay *= 0.8 },
  { id: "damage", title: "Heavy Plasma", desc: "+35% Bullet Damage.", apply: () => player.damage *= 1.35 },
  { id: "pierce", title: "Railgun Rounds", desc: "Bullets pierce through +1 extra enemy.", apply: () => player.pierce++ },
  { id: "heal", title: "Nano-Repair", desc: "Restore 40 Hull HP and gain +15 Max HP.", apply: () => { player.maxHp += 15; player.hp = Math.min(player.maxHp, player.hp + 40); } },
  { id: "drone", title: "Auto-Turret Drone", desc: "Adds an orbiting drone that shoots automatically.", apply: () => player.drones++ },
  { id: "magnet", title: "Tractor Beam", desc: "Doubles Scrap pickup range and +15% Move Speed.", apply: () => { player.magnetRange *= 2; player.speed *= 1.15; } },
  { id: "crit", title: "Targeting Matrix", desc: "+20% Chance for 2.5x Critical Hits.", apply: () => player.critChance += 0.20 }
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
    droneAngle: 0
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
  enemiesToSpawn = 5 + wave * 3;
  spawnCooldown = 30;
  if (wave % 5 === 0) {
    spawnBoss();
  }
  updateHUD();
}

function spawnBoss() {
  enemies.push({
    type: "BOSS",
    x: canvas.width / 2 - 55,
    y: -90,
    width: 110,
    height: 75,
    hp: 250 + wave * 80,
    maxHp: 250 + wave * 80,
    speed: 0.7,
    vx: 1.5,
    shootTimer: 0,
    scrapValue: 15 + wave * 2,
    scoreValue: 500
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

  firePlayerWeapon(now);

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
      player.hp -= eb.damage;
      createExplosion(eb.x, eb.y, "#ff4c4c", 6);
      enemyBullets.splice(i, 1);
      updateHUD();
      if (player.hp <= 0) { gameOver(); return; }
    }
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];

    if (e.type === "BOSS") {
      if (e.y < 45) e.y += e.speed;
      else {
        e.x += e.vx;
        if (e.x <= 10 || e.x + e.width >= canvas.width - 10) e.vx *= -1;
      }
      e.shootTimer++;
      if (e.shootTimer >= 75) {
        e.shootTimer = 0;
        for (let k = -1; k <= 1; k++) {
          enemyBullets.push({
            x: e.x + e.width / 2, y: e.y + e.height,
            vx: k * 1.6, vy: 3.8, damage: 15
          });
        }
      }
    } else {
      e.y += e.speed;
      if (e.type === "SNIPER") {
        e.shootTimer++;
        if (e.shootTimer >= 110) {
          e.shootTimer = 0;
          const angle = Math.atan2(player.y - e.y, player.x - e.x);
          enemyBullets.push({
            x: e.x + e.width / 2, y: e.y + e.height,
            vx: Math.cos(angle) * 3.5, vy: Math.sin(angle) * 3.5, damage: 12
          });
        }
      }
    }

    if (
      e.x < player.x + player.width && e.x + e.width > player.x &&
      e.y < player.y + player.height && e.y + e.height > player.y
    ) {
      player.hp -= 20;
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
        e.hp -= b.damage;
        b.hitList.push(e);
        createExplosion(b.x, b.y, b.isCrit ? "#ffd166" : "#66fcf1", 4);

        if (b.pierceLeft > 0) b.pierceLeft--;
        else bullets.splice(j, 1);

        if (e.hp <= 0) {
          score += e.scoreValue;
          createExplosion(e.x + e.width / 2, e.y + e.height / 2, "#ff9f1c", 16);
          for (let s = 0; s < e.scrapValue; s++) {
            pickups.push({
              x: e.x + e.width / 2 + (Math.random() - 0.5) * 20,
              y: e.y + e.height / 2,
              vy: 1.5
            });
          }
          enemies.splice(i, 1);
          updateHUD();
          break;
        }
      }
    }
  }

  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    const dx = (player.x + player.width / 2) - p.x;
    const dy = (player.y + player.height / 2) - p.y;
    const dist = Math.hypot(dx, dy);

    if (dist < player.magnetRange) {
      p.x += (dx / dist) * 6;
      p.y += (dy / dist) * 6;
    } else {
      p.y += p.vy;
    }

    if (dist < 24) {
      meta.scrap++;
      pickups.splice(i, 1);
      updateHUD();
    } else if (p.y > canvas.height + 20) {
      pickups.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.life--;
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

  ctx.fillStyle = "#ffd166";
  pickups.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#66fcf1";
  ctx.beginPath();
  ctx.moveTo(player.x + player.width / 2, player.y);
  ctx.lineTo(player.x + player.width, player.y + player.height);
  ctx.lineTo(player.x + player.width / 2, player.y + player.height - 6);
  ctx.lineTo(player.x, player.y + player.height);
  ctx.closePath();
  ctx.fill();

  for (let d = 0; d < player.drones; d++) {
    const a = player.droneAngle + (d * Math.PI * 2) / player.drones;
    const dx = player.x + player.width / 2 + Math.cos(a) * 38;
    const dy = player.y + player.height / 2 + Math.sin(a) * 38;
    ctx.fillStyle = "#00bbf9";
    ctx.beginPath();
    ctx.arc(dx, dy, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  bullets.forEach(b => {
    ctx.fillStyle = b.isCrit ? "#ffd166" : "#66fcf1";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#ff4c4c";
  enemyBullets.forEach(eb => {
    ctx.beginPath();
    ctx.arc(eb.x, eb.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  });

  enemies.forEach(e => {
    if (e.type === "SWARMER") ctx.fillStyle = "#f72585";
    else if (e.type === "BRUISER") ctx.fillStyle = "#b5179e";
    else if (e.type === "SNIPER") ctx.fillStyle = "#ff9f1c";
    else if (e.type === "BOSS") ctx.fillStyle = "#e63946";
    else ctx.fillStyle = "#ff4c4c";

    ctx.fillRect(e.x, e.y, e.width, e.height);

    if (e.type === "BRUISER" || e.type === "BOSS") {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(e.x, e.y - 8, e.width, 5);
      ctx.fillStyle = "#06d6a0";
      ctx.fillRect(e.x, e.y - 8, e.width * Math.max(0, e.hp / e.maxHp), 5);
    }
  });

  particles.forEach(pt => {
    ctx.fillStyle = pt.color;
    ctx.globalAlpha = pt.life / 40;
    ctx.fillRect(pt.x, pt.y, 3, 3);
  });
  ctx.globalAlpha = 1;
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
