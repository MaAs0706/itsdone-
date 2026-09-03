const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.gain.value = 0.15;

    switch (type) {
        case 'hit':
            osc.frequency.value = 150;
            osc.type = 'sawtooth';
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
            osc.start(); osc.stop(audioCtx.currentTime + 0.2);
            break;
        case 'missile':
            osc.frequency.value = 800;
            osc.type = 'sine';
            osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.3);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
            osc.start(); osc.stop(audioCtx.currentTime + 0.3);
            break;
        case 'explode':
            osc.frequency.value = 60;
            osc.type = 'sawtooth';
            gain.gain.value = 0.25;
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
            osc.start(); osc.stop(audioCtx.currentTime + 0.5);
            break;
        case 'launch':
            osc.frequency.value = 200;
            osc.type = 'square';
            osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.5);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
            osc.start(); osc.stop(audioCtx.currentTime + 0.5);
            break;
        case 'nearmiss':
            osc.frequency.value = 1200;
            osc.type = 'sine';
            gain.gain.value = 0.1;
            osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.15);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
            osc.start(); osc.stop(audioCtx.currentTime + 0.15);
            break;
        case 'troll':
            osc.frequency.value = 400;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(400, audioCtx.currentTime);
            osc.frequency.setValueAtTime(600, audioCtx.currentTime + 0.1);
            osc.frequency.setValueAtTime(300, audioCtx.currentTime + 0.2);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
            osc.start(); osc.stop(audioCtx.currentTime + 0.3);
            break;
        case 'checkpoint':
            osc.frequency.value = 523;
            osc.type = 'sine';
            gain.gain.value = 0.2;
            const notes = [523, 659, 784, 1047];
            notes.forEach((freq, i) => {
                osc.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.1);
            });
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
            osc.start(); osc.stop(audioCtx.currentTime + 0.5);
            break;
    }
}

const TOTAL_DISTANCE = 5000;

let gameState = 'menu';
let deaths = 0;
let attempts = 0;
let distanceTraveled = 0;
let scrollSpeed = 1.5;
let gameTimer = 0;
let obstacleTimer = 0;
let nextObstacleTime = 120;
let screenShake = { x: 0, y: 0, intensity: 0 };
let nearMissTriggered = false;
let nearMissDistance = TOTAL_DISTANCE * 0.85;
let fakeWinTriggered = false;
let sabotageMessages = [];
let sabotageTimer = 0;

const keys = {};

const rocket = {
    x: 150,
    y: canvas.height / 2,
    width: 50,
    height: 20,
    vx: 0,
    vy: 0,
    thrust: 0.25,
    maxSpeed: 5,
    drag: 0.97,
    alive: true,
    flameFrame: 0,
    tilt: 0,
};

let obstacles = [];
let particles = [];
let fragments = [];
let stars = [];

function initStars() {
    stars = [];
    for (let i = 0; i < 200; i++) {
        stars.push({
            x: Math.random() * canvas.width * 3,
            y: Math.random() * canvas.height,
            size: Math.random() * 2 + 0.5,
            speed: Math.random() * 2 + 0.5,
            brightness: Math.random(),
        });
    }
}

function resetGame() {
    gameState = 'playing';
    distanceTraveled = 0;
    scrollSpeed = 1.5;
    gameTimer = 0;
    obstacleTimer = 0;
    nextObstacleTime = 100;
    nearMissTriggered = false;
    fakeWinTriggered = false;
    sabotageMessages = [];
    sabotageTimer = 0;
    obstacles = [];
    particles = [];
    fragments = [];
    rocket.x = 150;
    rocket.y = canvas.height / 2;
    rocket.vx = 0;
    rocket.vy = 0;
    rocket.alive = true;
    rocket.tilt = 0;
    screenShake = { x: 0, y: 0, intensity: 0 };
    initStars();
    playSound('launch');
    document.getElementById('fail-screen').classList.add('hidden');
    document.getElementById('win-screen').classList.add('hidden');
    document.getElementById('near-miss-screen').classList.add('hidden');
    document.getElementById('sabotage-overlay').classList.add('hidden');
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('hud').style.display = 'flex';
}

function resetToMenu() {
    gameState = 'menu';
    document.getElementById('fail-screen').classList.add('hidden');
    document.getElementById('win-screen').classList.add('hidden');
    document.getElementById('near-miss-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
    document.getElementById('hud').style.display = 'none';
    document.getElementById('death-count').textContent = deaths;
}

function spawnObstacle() {
    const diff = attempts + 1;
    const progress = distanceTraveled / TOTAL_DISTANCE;

    if (progress > 0.85 && !nearMissTriggered) {
        triggerNearMiss();
        return;
    }

    if (progress > 0.93 && !fakeWinTriggered && diff > 2) {
        triggerFakeWin();
        return;
    }

    if (progress > 0.98 && diff > 5) {
        triggerTrollExplosion();
        return;
    }

    const availableTypes = ['missile_right', 'missile_left', 'asteroid', 'debris_top', 'debris_bottom'];

    if (diff > 1 && Math.random() < 0.18) {
        spawnWave();
        return;
    }

    if (diff > 3) availableTypes.push('laser', 'bullet_swarm');
    if (diff > 5) availableTypes.push('black_hole', 'gravity_flip');
    if (diff > 7) availableTypes.push('wall', 'reverse_missile');
    if (diff > 10) availableTypes.push('screen_glitch', 'rocket_betrayal');

    const weightedTypes = [...availableTypes];
    if (progress > 0.5) {
        weightedTypes.push('missile_right', 'missile_right', 'bullet_swarm');
    }
    if (progress > 0.7) {
        weightedTypes.push('wall', 'laser', 'reverse_missile');
    }
    if (progress > 0.8) {
        weightedTypes.push('bullet_swarm', 'bullet_swarm', 'rocket_betrayal');
    }

    const type = weightedTypes[Math.floor(Math.random() * weightedTypes.length)];

    const obs = { type, active: true, timer: 0 };

    switch (type) {
        case 'missile_right':
            obs.x = canvas.width + 50;
            obs.y = Math.random() * canvas.height;
            obs.mode = Math.random() < 0.55 ? 'straight' : 'chaser';
            obs.baseSpeed = 5 + Math.random() * 2 + diff * 0.2;
            obs.speed = obs.baseSpeed;
            obs.width = 30;
            obs.height = 10;
            obs.trail = [];
            obs.vy = 0;
            if (obs.mode === 'straight') {
                obs.homing = 0;
            } else {
                obs.homing = 0.05 + Math.random() * 0.07;
                obs.followTime = 150 + Math.random() * 300;
                obs.followed = 0;
            }
            break;

        case 'missile_left':
            obs.x = -50;
            obs.y = Math.random() * canvas.height;
            obs.mode = Math.random() < 0.55 ? 'straight' : 'chaser';
            obs.baseSpeed = 5 + Math.random() * 2 + diff * 0.2;
            obs.speed = obs.baseSpeed;
            obs.width = 30;
            obs.height = 10;
            obs.trail = [];
            obs.vy = 0;
            if (obs.mode === 'straight') {
                obs.homing = 0;
            } else {
                obs.homing = 0.05 + Math.random() * 0.07;
                obs.followTime = 150 + Math.random() * 300;
                obs.followed = 0;
            }
            break;

        case 'asteroid':
            obs.x = canvas.width + 50;
            obs.y = Math.random() * canvas.height;
            obs.speed = 2.5 + Math.random() * 2.5 + diff * 0.1;
            obs.vy = (Math.random() - 0.5) * 3;
            obs.wobble = Math.random() * 0.1 + 0.03;
            obs.wobblePhase = Math.random() * Math.PI * 2;
            obs.radius = 15 + Math.random() * 25;
            obs.rotation = 0;
            obs.rotSpeed = (Math.random() - 0.5) * 0.1;
            break;

        case 'debris_top':
            obs.x = rocket.x + 200 + Math.random() * 600;
            obs.y = -30 - Math.random() * 100;
            obs.speed = 3 + Math.random() * 4 + diff * 0.2;
            obs.vx = (Math.random() - 0.5) * 2;
            obs.rotateSettle = Math.random() * 2;
            obs.width = 10 + Math.random() * 25;
            obs.height = 10 + Math.random() * 25;
            obs.rotation = Math.random() * Math.PI;
            break;

        case 'debris_bottom':
            obs.x = rocket.x + 200 + Math.random() * 600;
            obs.y = canvas.height + 30 + Math.random() * 100;
            obs.speed = -(3 + Math.random() * 4 + diff * 0.2);
            obs.vx = (Math.random() - 0.5) * 2;
            obs.rotateSettle = Math.random() * 2;
            obs.width = 10 + Math.random() * 25;
            obs.height = 10 + Math.random() * 25;
            obs.rotation = Math.random() * Math.PI;
            break;

        case 'laser':
            obs.x = canvas.width + 20;
            obs.y = rocket.y + (Math.random() - 0.5) * 300;
            obs.speed = 8;
            obs.width = 300;
            obs.height = 4;
            obs.chargeTime = 40;
            break;

        case 'bullet_swarm':
            obs.bullets = [];
            const count = 5 + Math.floor(diff * 0.5);
            for (let i = 0; i < count; i++) {
                obs.bullets.push({
                    x: canvas.width + 50 + i * 40,
                    y: rocket.y + (Math.random() - 0.5) * 400,
                    speed: 4 + Math.random() * 2,
                    size: 5,
                });
            }
            break;

        case 'black_hole':
            obs.x = canvas.width / 2 + Math.random() * 200;
            obs.y = canvas.height / 2 + (Math.random() - 0.5) * 200;
            obs.radius = 40;
            obs.pullStrength = 0.08;
            obs.lifetime = 180;
            break;

        case 'gravity_flip':
            obs.x = rocket.x + 300;
            obs.y = 0;
            obs.width = canvas.width;
            obs.height = canvas.height;
            obs.duration = 120;
            obs.active = true;
            break;

        case 'wall':
            obs.x = canvas.width + 20;
            obs.y = 0;
            obs.width = 30;
            obs.gapY = Math.random() * (canvas.height - 200) + 100;
            obs.gapSize = 100 - diff * 2;
            if (obs.gapSize < 50) obs.gapSize = 50;
            obs.speed = 2.5;
            break;

        case 'reverse_missile':
            obs.x = rocket.x - 50;
            obs.y = rocket.y + (Math.random() - 0.5) * 100;
            obs.speed = 4 + diff * 0.2;
            obs.width = 30;
            obs.height = 10;
            obs.trail = [];
            obs.reversed = true;
            break;

        case 'screen_glitch':
            obs.x = 0;
            obs.y = 0;
            obs.width = canvas.width;
            obs.height = canvas.height;
            obs.duration = 60;
            obs.glitchBars = [];
            for (let i = 0; i < 15; i++) {
                obs.glitchBars.push({
                    y: Math.random() * canvas.height,
                    h: Math.random() * 30 + 5,
                    offset: (Math.random() - 0.5) * 50,
                });
            }
            obs.active = true;
            break;

        case 'rocket_betrayal':
            obs.x = rocket.x;
            obs.y = rocket.y;
            obs.delay = 60;
            obs.exploded = false;
            break;
    }

    obstacles.push(obs);
}

function spawnWave() {
    showSabotage('⚠ INCOMING WAVE ⚠');
    playSound('troll');
    const diff = attempts + 1;

    const nMissiles = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < nMissiles; i++) {
        const obs = { type: 'missile_right', active: true, timer: 0 };
        obs.x = canvas.width + 50 + i * 60;
        obs.y = Math.random() * canvas.height;
        obs.mode = 'chaser';
        obs.baseSpeed = 5 + Math.random() * 2 + diff * 0.3;
        obs.speed = obs.baseSpeed;
        obs.width = 30;
        obs.height = 10;
        obs.trail = [];
        obs.vy = 0;
        obs.homing = 0.06 + Math.random() * 0.08;
        obs.followTime = 200 + Math.random() * 250;
        obs.followed = 0;
        obstacles.push(obs);
    }

    const nDebris = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < nDebris; i++) {
        const fromTop = Math.random() < 0.5;
        const obs = { type: fromTop ? 'debris_top' : 'debris_bottom', active: true, timer: 0 };
        obs.x = canvas.width + 100 + i * 40 + Math.random() * 100;
        obs.y = fromTop ? -30 - Math.random() * 80 : canvas.height + 30 + Math.random() * 80;
        const dir = fromTop ? 1 : -1;
        obs.speed = (3 + Math.random() * 3 + diff * 0.2) * dir;
        obs.vx = (Math.random() - 0.5) * 3;
        obs.rotateSettle = Math.random() * 2;
        obs.width = 12 + Math.random() * 22;
        obs.height = 12 + Math.random() * 22;
        obs.rotation = Math.random() * Math.PI;
        obstacles.push(obs);
    }
}

function spawnParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * speed,
            vy: (Math.random() - 0.5) * speed,
            life: 1,
            decay: 0.01 + Math.random() * 0.03,
            size: Math.random() * 4 + 1,
            color,
        });
    }
}

function spawnExplosion(x, y) {
    spawnParticles(x, y, '#ff6b35', 30, 8);
    spawnParticles(x, y, '#feca57', 20, 6);
    spawnParticles(x, y, '#ff4757', 15, 10);
    spawnParticles(x, y, '#ffffff', 10, 4);
}

function spawnFragments(x, y) {
    const pieceShapes = [
        { w: 18, h: 8, color: '#e0e0e0' },
        { w: 12, h: 6, color: '#54a0ff' },
        { w: 10, h: 10, color: '#ff4757' },
        { w: 14, h: 5, color: '#feca57' },
        { w: 8, h: 12, color: '#b0b0b0' },
        { w: 16, h: 4, color: '#ffffff' },
    ];
    for (const shape of pieceShapes) {
        fragments.push({
            x: x + (Math.random() - 0.5) * 20,
            y: y + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 7,
            vy: (Math.random() - 0.5) * 7 - 2,
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.4,
            w: shape.w,
            h: shape.h,
            color: shape.color,
            life: 1,
            decay: 0.006 + Math.random() * 0.01,
            spin: true,
        });
    }
}

function triggerNearMiss() {
    nearMissTriggered = true;
    gameState = 'near_miss_troll';
    playSound('nearmiss');

    const messages = [
        "You were SO close... just kidding.",
        "Almost! But not really.",
        "The checkpoint saw you coming.",
        "Nice try. The checkpoint moved.",
        "1 pixel away? That's a missile.",
        "Plot twist: the checkpoint was a missile.",
    ];

    document.getElementById('near-miss-message').textContent =
        messages[Math.floor(Math.random() * messages.length)];

    spawnParticles(canvas.width * 0.85, rocket.y, '#feca57', 40, 5);

    setTimeout(() => {
        killRocket('near_miss');
    }, 1500);
}

function triggerFakeWin() {
    fakeWinTriggered = true;
    gameState = 'fake_win';
    playSound('checkpoint');

    setTimeout(() => {
        document.getElementById('win-screen').classList.remove('hidden');
    }, 500);

    setTimeout(() => {
        document.getElementById('win-screen').classList.add('hidden');
        killRocket('fake_win');
    }, 3000);
}

function triggerTrollExplosion() {
    const msgs = [
        "Your rocket chose violence.",
        "The fuel was fake. Like this checkpoint.",
        "Self-destruct activated. Oops.",
        "The rocket quit. Can't blame it.",
        "Internal combustion (not the good kind).",
    ];
    showSabotage(msgs[Math.floor(Math.random() * msgs.length)]);
    playSound('explode');
    spawnExplosion(rocket.x, rocket.y);
    spawnFragments(rocket.x, rocket.y);
    screenShake.intensity = 15;

    setTimeout(() => {
        killRocket('self_destruct');
    }, 300);
}

function showSabotage(text) {
    const el = document.getElementById('sabotage-overlay');
    const textEl = document.getElementById('sabotage-text');
    textEl.textContent = text;
    el.classList.remove('hidden');
    sabotageTimer = 90;
}

function killRocket(reason) {
    if (!rocket.alive) return;
    rocket.alive = false;
    deaths++;
    attempts++;

    document.getElementById('hud-deaths').textContent = deaths;
    document.getElementById('attempt-num').textContent = attempts + 1;

    let title = 'DESTROYED';
    let message = '';
    let extra = '';

    switch (reason) {
        case 'missile':
            title = 'MISSILE STRIKE';
            message = getMissileMessage();
            extra = 'A missile found you. How tragic.';
            break;
        case 'asteroid':
            title = 'ASTEROID IMPACT';
            message = getAsteroidMessage();
            extra = 'Space is dangerous. Who knew?';
            break;
        case 'debris':
            title = 'DEBRIS HIT';
            message = getDebrisMessage();
            extra = 'Something random killed you.';
            break;
        case 'laser':
            title = 'LASER BEAM';
            message = getLaserMessage();
            extra = 'Cut in half. Metaphorically.';
            break;
        case 'wall':
            title = 'WALL OF DOOM';
            message = getWallMessage();
            extra = 'There was a wall. Now there isn\'t.';
            break;
        case 'black_hole':
            title = 'BLACK HOLE';
            message = 'Spaghettified.';
            extra = 'The universe said no.';
            break;
        case 'self_destruct':
            title = 'SELF DESTRUCT';
            message = getSelfDestructMessage();
            extra = 'Your own rocket betrayed you.';
            break;
        case 'fake_win':
            title = 'WAIT...';
            message = 'You thought you won? Adorable.';
            extra = 'The checkpoint was a lie.';
            break;
        case 'near_miss':
            title = 'SO CLOSE!';
            message = document.getElementById('near-miss-message').textContent;
            extra = 'But not close enough.';
            break;
        case 'bullet':
            title = 'PEPPERED';
            message = getBulletMessage();
            extra = 'Riddled with holes.';
            break;
        case 'gravity':
            title = 'GRAVITY REVERSAL';
            message = 'Splat.';
            extra = 'The floor is no longer your friend.';
            break;
        case 'rocket_betrayal':
            title = 'BETRAYAL';
            message = 'Your rocket blew itself up.';
            extra = 'It had enough.';
            break;
        case 'glitch':
            title = 'SYSTEM ERROR';
            message = 'The game crashed. Just kidding. Or am I?';
            extra = '';
            break;
    }

    document.getElementById('fail-title').textContent = title;
    document.getElementById('fail-message').textContent = message;
    document.getElementById('fail-reason').textContent = extra;
    document.getElementById('fail-screen').classList.remove('hidden');

    const retryBtn = document.getElementById('retry-btn');
    const retryTexts = [
        'TRY AGAIN (it won\'t help)',
        'CLICK IF YOU ENJOY PAIN',
        'ONE MORE? REALLY?',
        'THIS WON\'T END WELL',
        'FALL AGAIN',
        'RETURN TO SUFFERING',
        'YES, I HATE MYSELF',
        'LAUNCH INTO FAILURE',
    ];
    retryBtn.textContent = retryTexts[Math.floor(Math.random() * retryTexts.length)];
}

function getMissileMessage() {
    const msgs = [
        'A missile detected your hope and destroyed it.',
        'Missile says hi. Missile says goodbye.',
        'You dodged nothing. The missile found you anyway.',
        'The missile had GPS. Your hope was the destination.',
        'Missile: 1. You: 0. Story of your life.',
        'That missile was personal.',
        'You can\'t dodge what the universe wants to hit.',
        'Missile trajectory: directly into your dreams.',
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
}

function getAsteroidMessage() {
    const msgs = [
        'An asteroid! In SPACE! Who would have thought!',
        'Rock beats scissors. Rock beats you.',
        'The asteroid didn\'t even slow down.',
        'NASA warned you. Well, they didn\'t. But they would have.',
        'That rock had more momentum than your life.',
        'Asteroid: just doing asteroid things. You: dead.',
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
}

function getDebrisMessage() {
    const msgs = [
        'Random space junk. Just like your plans.',
        'Debris doesn\'t care about your feelings.',
        'Something fell from the sky. It was your dignity.',
        'Space trash took out the trash.',
        'The universe littered. You paid the price.',
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
}

function getLaserMessage() {
    const msgs = [
        'Laser beam! Very sci-fi. Very deadly.',
        'You\'ve been lasered. How futuristic.',
        'The laser had better aim than you had luck.',
        ' pew pew. You\'re dead.',
        'That laser was in beta testing. You were the test.',
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
}

function getWallMessage() {
    const msgs = [
        'A wall appeared. Because fairness is optional.',
        'The wall was there the whole time. Just kidding. It wasn\'t.',
        'Wall: 1. Your face: 0.',
        'Brick by brick, your hopes crumble.',
        'The wall sends its regards.',
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
}

function getSelfDestructMessage() {
    const msgs = [
        'Your rocket looked at the checkpoint and gave up.',
        'Internal morale was too low. Rocket self-destructed.',
        'The rocket\'s therapist recommended quitting.',
        'Fuel leak? No. Hope leak.',
        'Your rocket filed for divorce from your hands.',
        'The rocket chose death over continuing this game.',
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
}

function getBulletMessage() {
    const msgs = [
        'Swarm of bullets. You are now Swiss cheese.',
        'Many small problems. Just like real life.',
        'Bullet hell? More like bullet YOU.',
        'Riddled with holes. Emotionally and physically.',
        'The swarm had a meeting. The verdict: you die.',
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
}

function checkCollision(obs) {
    const rx = rocket.x - rocket.width / 2;
    const ry = rocket.y - rocket.height / 2;
    const rw = rocket.width;
    const rh = rocket.height;

    switch (obs.type) {
        case 'missile_right':
        case 'missile_left':
            if (obs.mode === 'precipitous') return false;
            return (
                rx < obs.x + obs.width &&
                rx + rw > obs.x &&
                ry < obs.y + obs.height &&
                ry + rh > obs.y
            );

        case 'reverse_missile':
            return (
                rx < obs.x + obs.width &&
                rx + rw > obs.x &&
                ry < obs.y + obs.height &&
                ry + rh > obs.y
            );

        case 'asteroid':
            const dx = rocket.x - obs.x;
            const dy = rocket.y - obs.y;
            return Math.sqrt(dx * dx + dy * dy) < obs.radius + 15;

        case 'debris_top':
        case 'debris_bottom':
            return (
                rx < obs.x + obs.width &&
                rx + rw > obs.x &&
                ry < obs.y + obs.height &&
                ry + rh > obs.y
            );

        case 'laser':
            if (obs.timer < obs.chargeTime) return false;
            return (
                rx < obs.x + obs.width &&
                rx + rw > obs.x &&
                ry < obs.y + obs.height &&
                ry + rh > obs.y
            );

        case 'bullet_swarm':
            for (const b of obs.bullets) {
                const bdx = rocket.x - b.x;
                const bdy = rocket.y - b.y;
                if (Math.sqrt(bdx * bdx + bdy * bdy) < b.size + 12) return true;
            }
            return false;

        case 'black_hole':
            const bhdx = rocket.x - obs.x;
            const bhdy = rocket.y - obs.y;
            return Math.sqrt(bhdx * bhdx + bhdy * bhdy) < obs.radius;

        case 'wall':
            return (
                rx < obs.x + obs.width &&
                rx + rw > obs.x &&
                (ry < obs.gapY - obs.gapSize / 2 || ry + rh > obs.gapY + obs.gapSize / 2)
            );

        default:
            return false;
    }
}

function update() {
    if (gameState !== 'playing') return;

    gameTimer++;

    const progress = distanceTraveled / TOTAL_DISTANCE;
    scrollSpeed = 1.5 + progress * 1.5 + attempts * 0.05;

    distanceTraveled += scrollSpeed;
    if (distanceTraveled >= TOTAL_DISTANCE) {
        distanceTraveled = TOTAL_DISTANCE;
    }

    const gravityFlipActive = obstacles.some(o => o.type === 'gravity_flip' && o.active !== false && o.timer < o.duration);

    if (gravityFlipActive) {
        rocket.vy -= rocket.thrust * 1.5;
    } else {
        if (keys['w'] || keys['ArrowUp']) rocket.vy -= rocket.thrust;
        if (keys['s'] || keys['ArrowDown']) rocket.vy += rocket.thrust;
        if (keys['a'] || keys['ArrowLeft']) rocket.vx -= rocket.thrust * 0.5;
        if (keys['d'] || keys['ArrowRight']) rocket.vx += rocket.thrust * 0.5;
    }

    rocket.vx *= rocket.drag;
    rocket.vy *= rocket.drag;

    rocket.vx = Math.max(-rocket.maxSpeed, Math.min(rocket.maxSpeed, rocket.vx));
    rocket.vy = Math.max(-rocket.maxSpeed, Math.min(rocket.maxSpeed, rocket.vy));

    rocket.x += rocket.vx;
    rocket.y += rocket.vy;

    rocket.x = Math.max(60, Math.min(canvas.width - 60, rocket.x));
    rocket.y = Math.max(40, Math.min(canvas.height - 40, rocket.y));

    rocket.tilt = rocket.vy * 0.05;
    rocket.flameFrame++;

    obstacleTimer++;
    if (obstacleTimer >= nextObstacleTime) {
        obstacleTimer = 0;
        const baseInterval = Math.max(40, 120 - attempts * 5 - progress * 30);
        nextObstacleTime = baseInterval + Math.random() * 60;
        spawnObstacle();
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.timer++;

        switch (obs.type) {
            case 'missile_right':
                obs.x -= obs.speed;
                if (obs.mode === 'chaser') {
                    obs.followed++;
                    const jetSpeed = Math.abs(rocket.vx) + scrollSpeed;
                    const desiredSpeed = Math.max(obs.baseSpeed, Math.min(13, jetSpeed + 1.5));
                    obs.speed += (desiredSpeed - obs.speed) * 0.06;
                    if (obs.followed >= obs.followTime) {
                        obs.mode = 'precipitous';
                        obs.vy = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 3);
                    }
                    obs.y += obs.vy;
                    if (rocket.y > obs.y + obs.height / 2) obs.vy += obs.homing;
                    else if (rocket.y < obs.y + obs.height / 2) obs.vy -= obs.homing;
                    obs.vy = Math.max(-4, Math.min(4, obs.vy));
                } else {
                    obs.y += obs.vy;
                    if (rocket.y > obs.y + obs.height / 2) obs.vy += obs.homing;
                    else if (rocket.y < obs.y + obs.height / 2) obs.vy -= obs.homing;
                    obs.vy = Math.max(-4, Math.min(4, obs.vy));
                }
                obs.trail.push({ x: obs.x + obs.width / 2, y: obs.y + obs.height / 2 });
                if (obs.trail.length > 20) obs.trail.shift();
                break;

            case 'missile_left':
                obs.x += Math.abs(obs.speed);
                if (obs.mode === 'chaser') {
                    obs.followed++;
                    const jetSpeed = Math.abs(rocket.vx) + scrollSpeed;
                    const desiredSpeed = Math.max(obs.baseSpeed, Math.min(13, jetSpeed + 1.5));
                    obs.speed += (desiredSpeed - obs.speed) * 0.06;
                    if (obs.followed >= obs.followTime) {
                        obs.mode = 'precipitous';
                        obs.vy = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 3);
                    }
                    obs.y += obs.vy;
                    if (rocket.y > obs.y + obs.height / 2) obs.vy += obs.homing;
                    else if (rocket.y < obs.y + obs.height / 2) obs.vy -= obs.homing;
                    obs.vy = Math.max(-4, Math.min(4, obs.vy));
                } else {
                    obs.y += obs.vy;
                    if (rocket.y > obs.y + obs.height / 2) obs.vy += obs.homing;
                    else if (rocket.y < obs.y + obs.height / 2) obs.vy -= obs.homing;
                    obs.vy = Math.max(-4, Math.min(4, obs.vy));
                }
                obs.trail.push({ x: obs.x + obs.width / 2, y: obs.y + obs.height / 2 });
                if (obs.trail.length > 20) obs.trail.shift();
                break;

            case 'reverse_missile':
                obs.x += Math.abs(obs.speed);
                obs.y += Math.sin(obs.timer * 0.1) * (1 + diff * 0.1);
                obs.trail.push({ x: obs.x + obs.width / 2, y: obs.y + obs.height / 2 });
                if (obs.trail.length > 20) obs.trail.shift();
                break;

            case 'asteroid':
                obs.x -= obs.speed;
                obs.y += obs.vy + Math.sin(obs.timer * obs.wobble + obs.wobblePhase) * 1.5;
                obs.rotation += obs.rotSpeed;
                break;

            case 'debris_top':
                obs.y += obs.speed;
                obs.x += obs.vx;
                obs.rotation += obs.rotateSettle;
                break;

            case 'debris_bottom':
                obs.y += obs.speed;
                obs.x += obs.vx;
                obs.rotation -= obs.rotateSettle;
                break;

            case 'laser':
                if (obs.timer >= obs.chargeTime) {
                    obs.x -= obs.speed;
                }
                break;

            case 'bullet_swarm':
                for (const b of obs.bullets) {
                    b.x -= b.speed;
                }
                break;

            case 'black_hole':
                const bhdx = rocket.x - obs.x;
                const bhdy = rocket.y - obs.y;
                const dist = Math.sqrt(bhdx * bhdx + bhdy * bhdy);
                if (dist > 0) {
                    rocket.vx -= (bhdx / dist) * obs.pullStrength;
                    rocket.vy -= (bhdy / dist) * obs.pullStrength;
                }
                if (obs.timer > obs.lifetime) {
                    obs.active = false;
                }
                break;

            case 'wall':
                obs.x -= obs.speed;
                break;

            case 'screen_glitch':
                if (obs.timer > obs.duration) {
                    obs.active = false;
                }
                break;

            case 'rocket_betrayal':
                if (obs.timer >= obs.delay && !obs.exploded) {
                    obs.exploded = true;
                    spawnExplosion(rocket.x, rocket.y);
                    spawnFragments(rocket.x, rocket.y);
                    screenShake.intensity = 20;
                    playSound('explode');
                    setTimeout(() => killRocket('rocket_betrayal'), 500);
                }
                break;

            case 'gravity_flip':
                if (obs.timer > obs.duration) {
                    obs.active = false;
                }
                break;
        }

        if (obs.active !== false && checkCollision(obs)) {
            spawnExplosion(rocket.x, rocket.y);
            spawnFragments(rocket.x, rocket.y);
            screenShake.intensity = 12;
            playSound('explode');

            let reason = 'missile';
            if (obs.type === 'asteroid') reason = 'asteroid';
            else if (obs.type.startsWith('debris')) reason = 'debris';
            else if (obs.type === 'laser') reason = 'laser';
            else if (obs.type === 'wall') reason = 'wall';
            else if (obs.type === 'black_hole') reason = 'black_hole';
            else if (obs.type === 'bullet_swarm') reason = 'bullet';
            else if (obs.type === 'screen_glitch') reason = 'glitch';
            else if (obs.type === 'gravity_flip') reason = 'gravity';

            setTimeout(() => killRocket(reason), 200);
        }

        if (
            obs.x < -200 || obs.x > canvas.width + 400 ||
            obs.y < -200 || obs.y > canvas.height + 200
        ) {
            if (obs.type !== 'screen_glitch' && obs.type !== 'rocket_betrayal' && obs.type !== 'gravity_flip') {
                obstacles.splice(i, 1);
            }
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = fragments.length - 1; i >= 0; i--) {
        const f = fragments[i];
        f.x += f.vx;
        f.y += f.vy;
        f.vy += 0.08;
        f.rotation += f.rotSpeed;
        f.life -= f.decay;
        if (f.life <= 0) fragments.splice(i, 1);
    }

    if (screenShake.intensity > 0) {
        screenShake.x = (Math.random() - 0.5) * screenShake.intensity;
        screenShake.y = (Math.random() - 0.5) * screenShake.intensity;
        screenShake.intensity *= 0.9;
        if (screenShake.intensity < 0.5) screenShake.intensity = 0;
    }

    if (sabotageTimer > 0) {
        sabotageTimer--;
        if (sabotageTimer <= 0) {
            document.getElementById('sabotage-overlay').classList.add('hidden');
        }
    }

    const fillPercent = (distanceTraveled / TOTAL_DISTANCE) * 100;
    document.getElementById('distance-fill').style.width = fillPercent + '%';
    document.getElementById('rocket-icon').style.left = fillPercent + '%';
}

function draw() {
    ctx.save();
    ctx.translate(screenShake.x, screenShake.y);

    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const star of stars) {
        star.x -= star.speed * scrollSpeed * 0.3;
        if (star.x < -5) {
            star.x = canvas.width + 5;
            star.y = Math.random() * canvas.height;
        }
        const alpha = 0.3 + star.brightness * 0.7;
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
    }

    const groundY = canvas.height - 30;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, groundY, canvas.width, 30);
    ctx.strokeStyle = '#2d2d44';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(canvas.width, groundY);
    ctx.stroke();

    for (let i = 0; i < canvas.width; i += 80) {
        const offset = (distanceTraveled * 2 + i) % 80;
        ctx.fillStyle = '#2d2d44';
        ctx.fillRect(i - offset, groundY + 5, 40, 20);
    }

    drawCheckpoint();
    drawRocket();
    drawObstacles();
    drawParticles();

    const gravityDrawActive = obstacles.some(o => o.type === 'gravity_flip' && o.active !== false && o.timer < o.duration);
    if (gravityDrawActive) {
        ctx.fillStyle = 'rgba(255, 0, 100, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ff0064';
        ctx.font = 'bold 24px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText('⚠ GRAVITY REVERSED ⚠', canvas.width / 2, 80);
    }

    const glitchObs = obstacles.find(o => o.type === 'screen_glitch' && o.active !== false);
    if (glitchObs) {
        for (const bar of glitchObs.glitchBars) {
            ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,0,100' : '0,255,200'}, 0.3)`;
            ctx.fillRect(
                bar.offset + (Math.random() - 0.5) * 20,
                bar.y,
                canvas.width,
                bar.h
            );
        }
    }

    if (gameState === 'near_miss_troll') {
        const pulse = Math.sin(gameTimer * 0.1) * 0.3 + 0.5;
        ctx.fillStyle = `rgba(255, 200, 0, ${pulse * 0.15})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const drawProgress = distanceTraveled / TOTAL_DISTANCE;
    if (drawProgress > 0.9 && rocket.alive && gameState === 'playing') {
        const pulse = Math.sin(gameTimer * 0.15) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255, 100, 100, ${pulse * 0.1})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.restore();
}

function drawCheckpoint() {
    const progress = distanceTraveled / TOTAL_DISTANCE;
    if (progress < 0.6) return;

    const worldX = rocket.x + (TOTAL_DISTANCE - distanceTraveled);
    if (worldX > canvas.width + 300 || worldX < -300) {
        if (progress < 1 && !nearMissTriggered && !fakeWinTriggered) return;
    }

    const py = 40 + Math.sin(gameTimer * 0.05) * 5;

    const pulse = Math.sin(gameTimer * 0.08) * 0.4 + 0.6;

    ctx.save();
    ctx.translate(worldX, py);

    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 40;

    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 45 + pulse * 10, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 60;
    ctx.fillStyle = '#00ff88';
    ctx.globalAlpha = 0.25 + pulse * 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, 30 + pulse * 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Orbitron';
    ctx.textAlign = 'center';
    ctx.fillText('CHECKPOINT', 0, -60);

    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 10px Orbitron';
    ctx.fillText('1000m', 0, 80);

    ctx.restore();

    const beamAlpha = 0.06 + pulse * 0.08;
    ctx.fillStyle = `rgba(0, 255, 136, ${beamAlpha})`;
    ctx.fillRect(worldX - 60, py - 300, 120, 600);
}

function drawRocket() {
    if (!rocket.alive) return;

    ctx.save();
    ctx.translate(rocket.x, rocket.y);
    ctx.rotate(rocket.tilt);

    const flameLen = 15 + Math.sin(rocket.flameFrame * 0.5) * 8;

    ctx.fillStyle = '#ff6b35';
    ctx.beginPath();
    ctx.moveTo(-rocket.width / 2 - 5, -5);
    ctx.lineTo(-rocket.width / 2 - flameLen - 10, 0);
    ctx.lineTo(-rocket.width / 2 - 5, 5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#feca57';
    ctx.beginPath();
    ctx.moveTo(-rocket.width / 2 - 5, -3);
    ctx.lineTo(-rocket.width / 2 - flameLen - 5, 0);
    ctx.lineTo(-rocket.width / 2 - 5, 3);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#e0e0e0';
    ctx.beginPath();
    ctx.moveTo(rocket.width / 2, 0);
    ctx.lineTo(rocket.width / 2 - 10, -rocket.height / 2);
    ctx.lineTo(-rocket.width / 2 + 5, -rocket.height / 2);
    ctx.lineTo(-rocket.width / 2 + 5, rocket.height / 2);
    ctx.lineTo(rocket.width / 2 - 10, rocket.height / 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ff4757';
    ctx.beginPath();
    ctx.moveTo(rocket.width / 2, 0);
    ctx.lineTo(rocket.width / 2 - 8, -rocket.height / 2 + 2);
    ctx.lineTo(rocket.width / 2 - 3, 0);
    ctx.lineTo(rocket.width / 2 - 8, rocket.height / 2 - 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#54a0ff';
    ctx.beginPath();
    ctx.arc(rocket.width / 2 - 15, -3, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawObstacles() {
    for (const obs of obstacles) {
        if (obs.active === false) continue;

        ctx.save();

        switch (obs.type) {
            case 'missile_right':
            case 'missile_left':
            case 'reverse_missile':
                for (let i = 0; i < obs.trail.length; i++) {
                    const t = obs.trail[i];
                    const alpha = i / obs.trail.length * 0.5;
                    ctx.fillStyle = `rgba(255, 100, 50, ${alpha})`;
                    ctx.beginPath();
                    ctx.arc(t.x, t.y, 3, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.fillStyle = '#ff4757';
                ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
                ctx.fillStyle = '#ff6b6b';
                ctx.fillRect(obs.x + obs.width * 0.6, obs.y + 2, obs.width * 0.3, obs.height - 4);

                const dir = obs.speed > 0 ? -1 : 1;
                ctx.fillStyle = '#feca57';
                ctx.beginPath();
                ctx.moveTo(obs.x + (dir > 0 ? obs.width : 0), obs.y + obs.height / 2);
                ctx.lineTo(obs.x + (dir > 0 ? obs.width + 8 : -8), obs.y + obs.height / 2);
                ctx.lineTo(obs.x + (dir > 0 ? obs.width : 0), obs.y + obs.height / 2 - 4);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(obs.x + (dir > 0 ? obs.width : 0), obs.y + obs.height / 2);
                ctx.lineTo(obs.x + (dir > 0 ? obs.width + 8 : -8), obs.y + obs.height / 2);
                ctx.lineTo(obs.x + (dir > 0 ? obs.width : 0), obs.y + obs.height / 2 + 4);
                ctx.closePath();
                ctx.fill();
                break;

            case 'asteroid':
                ctx.translate(obs.x, obs.y);
                ctx.rotate(obs.rotation);
                ctx.fillStyle = '#555';
                ctx.beginPath();
                for (let i = 0; i < 8; i++) {
                    const angle = (i / 8) * Math.PI * 2;
                    const r = obs.radius * (0.7 + Math.sin(i * 2.5) * 0.3);
                    if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
                    else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
                }
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#444';
                ctx.beginPath();
                ctx.arc(-5, -5, obs.radius * 0.3, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'debris_top':
            case 'debris_bottom':
                ctx.translate(obs.x, obs.y);
                ctx.rotate(obs.rotation);
                ctx.fillStyle = '#888';
                ctx.fillRect(-obs.width / 2, -obs.height / 2, obs.width, obs.height);
                ctx.fillStyle = '#666';
                ctx.fillRect(-obs.width / 2 + 2, -obs.height / 2 + 2, obs.width - 4, obs.height - 4);
                break;

            case 'laser':
                if (obs.timer < obs.chargeTime) {
                    const charge = obs.timer / obs.chargeTime;
                    ctx.strokeStyle = `rgba(255, 0, 100, ${charge})`;
                    ctx.lineWidth = 2;
                    ctx.setLineDash([5, 5]);
                    ctx.beginPath();
                    ctx.moveTo(obs.x, obs.y + obs.height / 2);
                    ctx.lineTo(canvas.width, obs.y + obs.height / 2);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    ctx.fillStyle = '#ff0064';
                    ctx.beginPath();
                    ctx.arc(obs.x, obs.y + obs.height / 2, 8 + charge * 8, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    const glow = Math.sin(gameTimer * 0.3) * 0.3 + 0.7;
                    ctx.shadowColor = '#ff0064';
                    ctx.shadowBlur = 20;
                    ctx.fillStyle = `rgba(255, 0, 100, ${glow})`;
                    ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(obs.x, obs.y + 1, obs.width, obs.height - 2);
                    ctx.shadowBlur = 0;
                }
                break;

            case 'bullet_swarm':
                for (const b of obs.bullets) {
                    ctx.fillStyle = '#feca57';
                    ctx.shadowColor = '#feca57';
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
                break;

            case 'black_hole':
                const bhPulse = Math.sin(obs.timer * 0.05) * 5;
                for (let r = obs.radius + bhPulse; r > 0; r -= 5) {
                    const alpha = (1 - r / (obs.radius + bhPulse)) * 0.3;
                    ctx.fillStyle = `rgba(100, 0, 255, ${alpha})`;
                    ctx.beginPath();
                    ctx.arc(obs.x, obs.y, r, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.arc(obs.x, obs.y, obs.radius * 0.4, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'wall':
                const wallColor = '#333';
                ctx.fillStyle = wallColor;
                ctx.fillRect(obs.x, obs.y, obs.width, obs.gapY - obs.gapSize / 2);
                ctx.fillRect(obs.x, obs.gapY + obs.gapSize / 2, obs.width, canvas.height);

                ctx.fillStyle = '#ff4757';
                ctx.fillRect(obs.x, obs.gapY - obs.gapSize / 2 - 3, obs.width, 3);
                ctx.fillRect(obs.x, obs.gapY + obs.gapSize / 2, obs.width, 3);

                ctx.fillStyle = 'rgba(255, 71, 87, 0.1)';
                ctx.fillRect(obs.x - 10, obs.gapY - obs.gapSize / 2 - 20, obs.width + 20, obs.gapSize + 40);
                break;
        }

        ctx.restore();
    }
}

function drawParticles() {
    for (const p of particles) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
    }
    for (const f of fragments) {
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.rotation);
        ctx.globalAlpha = Math.max(0, f.life);
        ctx.fillStyle = f.color;
        ctx.fillRect(-f.w / 2, -f.h / 2, f.w, f.h);
        ctx.restore();
    }
    ctx.globalAlpha = 1;
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

document.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

document.getElementById('start-btn').addEventListener('click', () => {
    audioCtx.resume();
    resetGame();
});

document.getElementById('retry-btn').addEventListener('click', () => {
    resetGame();
});

document.getElementById('real-retry-btn').addEventListener('click', () => {
    resetGame();
});

document.getElementById('near-miss-retry-btn').addEventListener('click', () => {
    document.getElementById('near-miss-screen').classList.add('hidden');
    resetGame();
});

initStars();
document.getElementById('hud').style.display = 'none';
gameLoop();
