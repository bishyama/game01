const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const UI = {
    start: document.getElementById('start-screen'),
    gameOver: document.getElementById('game-over-screen'),
    clear: document.getElementById('clear-screen'),
    ringCount: document.getElementById('ring-count'),
    photoOverlay: document.getElementById('photo-overlay'),
    timeCounter: document.getElementById('time-left'),
    hpIcons: document.getElementById('hp-icons'),
    angryBrideContainer: document.getElementById('angry-bride-container'),
    gameOverReason: document.getElementById('game-over-reason'),
    gameOverTitle: document.getElementById('game-over-title'),
    goldRankText: document.getElementById('gold-rank-text'),
    soundToggle: document.getElementById('sound-toggle'),
    creditsContainer: document.getElementById('credits-container'),
    stageIndicator: document.getElementById('stage-indicator'),
    stageClearScreen: document.getElementById('stage-clear-screen'),
    nextStageBtn: document.getElementById('next-stage-btn')
};

let animationId = null;

let currentStage = 1;
const MAX_STAGES = 3;

// --- AudioManager (Web Audio API) ---
const AudioManager = {
    ctx: null,
    masterGain: null,
    enabled: false,
    bgmInterval: null,
    currentBGM: null, // 'main', 'invincible', 'clear'
    
    init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.masterGain.gain.value = 0.4; 
    },
    
    toggle() {
        this.init();
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        this.enabled = !this.enabled;
        UI.soundToggle.textContent = this.enabled ? "🔊 ON" : "🔈 OFF";
        if (this.enabled) {
            if (currentState === STATE.PLAYING) this.playBGM(this.currentBGM || 'main');
            else if (currentState === STATE.CLEAR) this.playBGM('clear');
        } else {
            this.stopBGM();
        }
    },
    
    playNote(freq, dur, type = 'triangle', gain = 1) {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        g.gain.setValueAtTime(gain * 0.3, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + dur);
    },
    
    playBGM(type = 'main') {
        if (!this.enabled) { this.currentBGM = type; return; }
        if (this.currentBGM === type && this.bgmInterval) return;
        
        this.stopBGM();
        this.currentBGM = type;
        
        let notes = [];
        let tempo = 1.0;
        let oscType = 'triangle';

        if (type === 'main') {
            notes = [
                [349.23, 0.4], [349.23, 0.2], [349.23, 0.2], [349.23, 0.8], 
                [349.23, 0.4], [466.16, 0.4], [466.16, 0.4], [466.16, 0.8],
                [466.16, 0.4], [349.23, 0.4], [466.16, 0.4], [587.33, 0.4], [523.25, 0.4], [466.16, 0.4],
                [440.00, 0.4], [466.16, 0.4], [523.25, 0.8]
            ];
            tempo = 1.0;
        } else if (type === 'invincible') {
            notes = [
                [523.25, 0.15], [659.25, 0.15], [783.99, 0.15], [1046.50, 0.15],
                [783.99, 0.15], [659.25, 0.15], [523.25, 0.15], [392.00, 0.15]
            ];
            tempo = 0.8;
            oscType = 'square';
        } else if (type === 'clear') {
            notes = [
                [523.25, 0.6], [523.25, 0.3], [523.25, 0.3], [523.25, 1.2],
                [659.25, 0.6], [659.25, 0.3], [659.25, 0.3], [659.25, 1.2],
                [783.99, 0.6], [880.00, 0.6], [987.77, 0.6], [1046.50, 2.0]
            ];
            tempo = 1.2;
        }

        let idx = 0;
        const playNext = () => {
            if (!this.enabled || this.currentBGM !== type) return;
            const [f, d] = notes[idx];
            this.playNote(f, d * tempo, oscType, type === 'main' ? 0.8 : 0.6);
            idx = (idx + 1) % notes.length;
            this.bgmInterval = setTimeout(playNext, d * tempo * 1000);
        };
        playNext();
    },
    
    stopBGM() {
        if (this.bgmInterval) {
            clearTimeout(this.bgmInterval);
            this.bgmInterval = null;
        }
    },
    
    sfx: {
        jump: () => AudioManager.playNote(400, 0.15, 'sine'),
        item: () => {
            AudioManager.playNote(880, 0.1, 'sine');
            setTimeout(() => AudioManager.playNote(1320, 0.2, 'sine'), 80);
        },
        hit: () => AudioManager.playNote(80, 0.3, 'sawtooth', 0.6),
        powerup: () => {
            AudioManager.playBGM('invincible');
            const steps = 6;
            for(let i=0; i<steps; i++) {
                setTimeout(() => AudioManager.playNote(400 + i*200, 0.08, 'sine'), i*40);
            }
        },
        clear: () => {
            AudioManager.playBGM('clear');
        },
        gameOver: () => {
            AudioManager.stopBGM();
            AudioManager.playNote(261.63, 0.3, 'sawtooth'); 
            setTimeout(() => AudioManager.playNote(196.00, 0.3, 'sawtooth'), 200); 
            setTimeout(() => AudioManager.playNote(164.81, 0.6, 'sawtooth'), 400); 
        }
    }
};

UI.soundToggle.addEventListener('click', (e) => {
    AudioManager.toggle();
    e.target.blur(); // Prevent Space key from triggering the button again
});

const GAME_WIDTH = canvas.width; // 600
const GAME_HEIGHT = canvas.height; // 600

const STATE = { START: 0, PLAYING: 1, GAME_OVER: 2, CLEAR: 3 };
let currentState = STATE.START;

const keys = { ArrowLeft: false, ArrowRight: false, Space: false };
let ringsCollected = 0;
let timeRemaining = 30.0;
let currentDifficulty = 'normal';

const diffConfig = {
    easy: { hp: 5, time: 120, speedMult: 0.7 },
    normal: { hp: 3, time: 60, speedMult: 1.0 },
    hard: { hp: 1, time: 40, speedMult: 1.5 }
};

function handleInteractionStart() {
    if (currentState === STATE.CLEAR || currentState === STATE.GAME_OVER) {
        currentStage = 1; // Reset to stage 1 on game over or final clear restart
        currentState = STATE.START;
        UI.clear.classList.add('hidden');
        UI.gameOver.classList.add('hidden');
        UI.stageClearScreen.classList.add('hidden');
        UI.start.classList.remove('hidden');
        UI.photoOverlay.classList.remove('photo-visible');
        UI.angryBrideContainer.classList.remove('photo-visible');
        UI.goldRankText.classList.add('hidden');
        AudioManager.stopBGM();
        AudioManager.currentBGM = null;
    }
}

UI.nextStageBtn.addEventListener('click', () => {
    if (currentState === STATE.CLEAR && currentStage < MAX_STAGES) {
        currentStage++;
        UI.stageClearScreen.classList.add('hidden');
        startGame();
    }
});

document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (currentState === STATE.START) {
            currentDifficulty = e.target.dataset.diff;
            AudioManager.init(); 
            startGame();
        }
    });
});

window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
    }
    if(e.code === 'ArrowLeft') keys.ArrowLeft = true;
    if(e.code === 'ArrowRight') keys.ArrowRight = true;
    if(e.code === 'Space'){ keys.Space = true; handleInteractionStart(); }
});
window.addEventListener('keyup', (e) => {
    if(e.code === 'ArrowLeft') keys.ArrowLeft = false;
    if(e.code === 'ArrowRight') keys.ArrowRight = false;
    if(e.code === 'Space') keys.Space = false;
});

window.addEventListener('touchstart', (e) => {
    if ((currentState === STATE.GAME_OVER || currentState === STATE.CLEAR) && e.target.tagName !== 'BUTTON') {
        handleInteractionStart();
    }
}, {passive: false});

const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');
const btnJump = document.getElementById('btn-jump');
const bindTouch = (btn, key) => {
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); keys[key] = true; handleInteractionStart(); });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); keys[key] = false; });
    btn.addEventListener('touchcancel', (e) => { e.preventDefault(); keys[key] = false; });
};
bindTouch(btnLeft, 'ArrowLeft'); bindTouch(btnRight, 'ArrowRight'); bindTouch(btnJump, 'Space');

const GRAVITY = 1500;
const BASE_PLAYER_SPEED = 250;
const JUMP_POWER = -600;

let player = {
    x: 100, y: 100, width: 32, height: 32, vx: 0, vy: 0, 
    onGround: false, facingLeft: false,
    frameName: 'groomStand', walkTimer: 0,
    scaleX: 1.0, scaleY: 1.0, hp: 3, 
    invincibleTimer: 0, knockbackTimer: 0, powerUpTimer: 0
};

let camera = { x: 0, shakeTimer: 0 };
let particles = [];
let time = 0;

let level = {
    endX: 3600, platforms: [], items: [], enemies: [], decoration: [],
    goal: { x: 3450, y: GAME_HEIGHT - 40 - 32, width: 32, height: 32, type: 'bride' }
};

function initLevel(stage) {
    UI.stageIndicator.textContent = `Stage: ${stage} / ${MAX_STAGES}`;
    level.decoration = [];
    
    if (stage === 1) { // Stage 1: Encounter (Day)
        level.endX = 4000;
        level.platforms = [
            { x: 0, y: GAME_HEIGHT - 40, width: 1200, height: 40, type: 'ground' },
            { x: 1350, y: GAME_HEIGHT - 40, width: 700, height: 40, type: 'ground' },
            { x: 2200, y: GAME_HEIGHT - 40, width: 800, height: 40, type: 'ground' },
            { x: 3150, y: GAME_HEIGHT - 40, width: 900, height: 40, type: 'ground' },
            { x: 400, y: GAME_HEIGHT - 120, width: 120, height: 40, type: 'block' },
            { x: 650, y: GAME_HEIGHT - 160, width: 120, height: 40, type: 'block' },
            { x: 900, y: GAME_HEIGHT - 120, width: 120, height: 40, type: 'block' },
            { x: 1600, y: GAME_HEIGHT - 120, width: 120, height: 40, type: 'block' },
            { x: 1850, y: GAME_HEIGHT - 160, width: 120, height: 40, type: 'block' },
            { x: 2400, y: GAME_HEIGHT - 140, width: 120, height: 40, type: 'block' },
            { x: 2700, y: GAME_HEIGHT - 180, width: 120, height: 40, type: 'block' },
            { x: 3400, y: GAME_HEIGHT - 120, width: 120, height: 40, type: 'block' }
        ];
        level.items = [
            { x: 440, y: GAME_HEIGHT - 160, width: 32, height: 32, type: 'ring', collected: false },
            { x: 1700, y: GAME_HEIGHT - 160, width: 32, height: 32, type: 'ring', collected: false },
            { x: 2800, y: GAME_HEIGHT - 220, width: 32, height: 32, type: 'ring', collected: false }
        ];
        level.enemies = [
            { x: 700, y: GAME_HEIGHT - 40 - 32, width: 32, height: 32, type: 'clock', startX: 700, range: 100, speed: 1.5 },
            { x: 1500, y: GAME_HEIGHT - 40 - 32, width: 32, height: 32, type: 'clock', startX: 1500, range: 120, speed: 2 },
            { x: 2500, y: GAME_HEIGHT - 40 - 32, width: 32, height: 32, type: 'clock', startX: 2500, range: 100, speed: 2.5 },
            { x: 3500, y: GAME_HEIGHT - 40 - 32, width: 32, height: 32, type: 'clock', startX: 3500, range: 150, speed: 1.8 }
        ];
        level.decoration = [ { x: 300, y: GAME_HEIGHT - 200, type: 'photoFrame' }, { x: 1800, y: GAME_HEIGHT - 220, type: 'photoFrame' }, { x: 3200, y: GAME_HEIGHT - 200, type: 'photoFrame' } ];
    } 
    else if (stage === 2) { // Stage 2: Memories (Evening)
        level.endX = 5000;
        level.platforms = [
            { x: 0, y: GAME_HEIGHT - 40, width: 750, height: 40, type: 'ground' },
            { x: 1050, y: GAME_HEIGHT - 40, width: 750, height: 40, type: 'ground' },
            { x: 2000, y: GAME_HEIGHT - 40, width: 800, height: 40, type: 'ground' },
            { x: 3100, y: GAME_HEIGHT - 40, width: 800, height: 40, type: 'ground' },
            { x: 4100, y: GAME_HEIGHT - 40, width: 1000, height: 40, type: 'ground' },
            { centerX: 900, centerY: GAME_HEIGHT - 80, radius: 60, angle: 0, width: 100, height: 30, type: 'ferrisWheel', speed: 1.0 },
            { centerX: 900, centerY: GAME_HEIGHT - 80, radius: 60, angle: Math.PI, width: 100, height: 30, type: 'ferrisWheel', speed: 1.0 },
            { centerX: 1900, centerY: GAME_HEIGHT - 180, radius: 80, angle: 0, width: 80, height: 40, type: 'ferrisWheel', speed: 1.2 },
            { centerX: 2950, centerY: GAME_HEIGHT - 150, radius: 100, angle: 0, width: 100, height: 30, type: 'ferrisWheel', speed: 1.0 },
            { centerX: 4000, centerY: GAME_HEIGHT - 120, radius: 80, angle: Math.PI/2, width: 80, height: 40, type: 'ferrisWheel', speed: 1.8 }
        ];
        level.items = [
            { x: 400, y: GAME_HEIGHT - 100, width: 32, height: 32, type: 'champagne', collected: false },
            { x: 1400, y: GAME_HEIGHT - 200, width: 32, height: 32, type: 'itemCake', collected: false },
            { x: 2500, y: GAME_HEIGHT - 250, width: 32, height: 32, type: 'champagne', collected: false },
            { x: 3500, y: GAME_HEIGHT - 220, width: 32, height: 32, type: 'itemCake', collected: false }
        ];
        level.enemies = [
            { x: 300, y: GAME_HEIGHT - 40 - 32, width: 32, height: 32, type: 'bottle', startX: 300, range: 150, speed: 2.5 },
            { x: 1500, y: GAME_HEIGHT - 40 - 32, width: 32, height: 32, type: 'clock', startX: 1500, range: 100, speed: 2 },
            { x: 2600, y: GAME_HEIGHT - 40 - 32, width: 32, height: 32, type: 'bottle', startX: 2600, range: 120, speed: 3 },
            { x: 3600, y: GAME_HEIGHT - 40 - 32, width: 32, height: 32, type: 'clock', startX: 3600, range: 150, speed: 2.2 },
            { x: 4500, y: GAME_HEIGHT - 40 - 32, width: 32, height: 32, type: 'bottle', startX: 4500, range: 100, speed: 3.5 }
        ];
        level.decoration = [ { x: 700, y: GAME_HEIGHT - 180, type: 'photoFrame' }, { x: 2200, y: GAME_HEIGHT - 200, type: 'photoFrame' }, { x: 3800, y: GAME_HEIGHT - 180, type: 'photoFrame' } ];
    }
    else if (stage === 3) { // Stage 3: Wedding Day (Night)
        level.endX = 7000;
        level.platforms = [
            { x: 0, y: GAME_HEIGHT - 40, width: 400, height: 40, type: 'ground' },
            { x: 500, y: GAME_HEIGHT - 100, width: 80, height: 40, type: 'block' },
            { x: 700, y: GAME_HEIGHT - 150, width: 80, height: 40, type: 'block' },
            { x: 950, y: GAME_HEIGHT - 100, width: 120, height: 40, type: 'liftHorizontal', startX: 950, range: 200, speed: 2, prevX: 950 },
            { x: 1400, y: GAME_HEIGHT - 120, width: 300, height: 40, type: 'block' },
            { x: 1800, y: GAME_HEIGHT - 80, width: 80, height: 120, type: 'block' },
            { x: 2000, y: GAME_HEIGHT - 150, width: 100, height: 40, type: 'liftVertical', startY: GAME_HEIGHT - 150, range: 100, speed: 2.5 },
            { x: 2300, y: GAME_HEIGHT - 40, width: 1300, height: 40, type: 'ground' },
            { x: 3800, y: GAME_HEIGHT - 120, width: 120, height: 40, type: 'liftHorizontal', startX: 3800, range: 300, speed: 3, prevX: 3800 },
            { x: 4400, y: GAME_HEIGHT - 40, width: 800, height: 40, type: 'ground' },
            { x: 5300, y: GAME_HEIGHT - 150, width: 100, height: 200, type: 'block' },
            { x: 5600, y: GAME_HEIGHT - 100, width: 120, height: 40, type: 'liftVertical', startY: GAME_HEIGHT - 100, range: 150, speed: 2, prevY: GAME_HEIGHT - 100 },
            { x: 6100, y: GAME_HEIGHT - 40, width: 900, height: 40, type: 'ground' }
        ];
        level.items = [
            { x: 1500, y: GAME_HEIGHT - 230, width: 32, height: 32, type: 'itemDress', collected: false },
            { x: 4800, y: GAME_HEIGHT - 150, width: 32, height: 32, type: 'itemDress', collected: false }
        ];
        level.enemies = [
            { x: 1450, y: GAME_HEIGHT - 120 - 32, width: 32, height: 32, type: 'clock', startX: 1450, range: 100, speed: 4 },
            { x: 4500, y: GAME_HEIGHT - 40 - 32, width: 32, height: 32, type: 'clock', startX: 4500, range: 150, speed: 5 }
        ];
        level.decoration = [ { x: 500, y: GAME_HEIGHT - 250, type: 'photoFrame' }, { x: 2800, y: GAME_HEIGHT - 220, type: 'photoFrame' }, { x: 4000, y: GAME_HEIGHT - 250, type: 'photoFrame' }, { x: 5800, y: GAME_HEIGHT - 220, type: 'photoFrame' } ];
    }
    
    level.goal.x = level.endX - 150;
    level.goal.y = GAME_HEIGHT - 40 - 32;
}

const spriteSheet = {
    groomStand: ["....1111........","...111111.......","...222222.......","...212212.......","....2222........","...33433........","..4331334.......","44333433344.....","4.3333333.4.....","5.3333333.5.....","..6666666.......","..66...66.......","..66...66.......","..66...66.......","..77...77.......","................"],
    groomWalk1: [".....1111.......","....111111......",".....22222......",".....21221......","......222.......",".....3433.......","....431334......",".44.334333......","5...33333.......","...66666........","...66..6........","...6...66.......","...6....6.......","..77....6.......","........77......","................"],
    groomWalk2: [".....1111.......","....111111......",".....22222......",".....21221......","......222.......",".....3343.......","....433134......","......4333.44...",".......333..5...","........666.....","........666.....",".......66.6.....",".......6...6....",".......6...77...","......77........","................"],
    groomJump: ["....1111........","...111111.......","...222222.......","...212212.......","....2222........","44333433344.....","4.4331334.4.....","5.3334333.5.....","..3333333.......","..6666666.......","..66...66.......",".66.....66......",".66.....66......",".77.....77......","................","................"],
    bride: ["....1111........","...111111.......","..11222211......","..11212111......","..11222211......","...BBBBBB.......","...BBBBBB.......","..B2BBBB2B......","..B2BBBB2B......","...BBBBBB.......","...JJJJJJ.......","...JJJJJJ.......","...JJ..JJ.......","...JJ..JJ.......","...77..77.......","................"],
    present: [".......4........","......444.......",".....44444......","....4444444.....","JJJJJJJ4JJJJJJJJ","JJJJJJJ4JJJJJJJJ","JJJJJJJ4JJJJJJJJ","4444444444444444","JJJJJJJ4JJJJJJJJ","JJJJJJJ4JJJJJJJJ","JJJJJJJ4JJJJJJJJ","JJJJJJJ4JJJJJJJJ","JJJJJJJ4JJJJJJJJ","JJJJJJJ4JJJJJJJJ","JJJJJJJ4JJJJJJJJ","................"],
    itemCake: [".......9........","......WFW.......",".....WWFWW......","....WFFFFFW.....","....WWWWWWW.....","...WWWWWWWWW....","..WWFFFFFFFWW...","..WWWWWWWWWWW...",".WWWWWWWWWWWWW..",".WFFFFFFFFFFFW..","WWWWWWWWWWWWWWW.","WWWWWWWWWWWWWWW.","BBBBBBBBBBBBBBB.","................","................","................"],
    itemDress: [".......C........","......CCC.......",".....88888......","....8888888.....","....8.888.8.....","......888.......",".....88888......","....8888888.....","...888888888....","..88888888888...","..88888888888...",".8888888888888..",".8888888888888..","888888888888888.","888888888888888.","................"],
    ring: ["................",".....55555......","....5.....5.....","...5.......5....","...5.......5....","..5.........5...","..5...888...5...","..5...8.8...5...","..5...888...5...","...5.......5....","...5.......5....","....5.....5.....",".....55555......","................","................","................"],
    champagne: [".......G........","......GGG.......","......G.G.......","......GGG.......",".....GGGGG......","....GFFFFFG.....","....GFFFFFG.....","....GGGGGGG.....","....GGGGGGG.....","....GGGGGGG.....","....GGGGGGG.....","....GGGGGGG.....","...GGGGGGGGG....","...GGGGGGGGG....","...GGGGGGGGG....","................"],
    bottle: [".........DD.....","........DD......",".......DDDD.....","......DDDD......",".....DDDDDD.....","....DDDDDDDD....","...DWWWWWWD.....","...DWKKKKWD.....","...DWKKKKWD.....","..DWWWWWWD......","..DDDDDDDD......",".DDDDDDDD.......",".DDDDDDDDDD.....",".DDDDDDDDDD.....","DDDDDDDDDD......","................"],
    clock: [".......HH.......",".LL...HHHH...LL.","LLLL..HHHH..LLLL","LLL..WWWWWW..LLL","LL..WWWWWWWW..LL","L...WWKWWKWW...L","...WWWWWWWWWW...","..WWWWKWWKWWWW..","...WWWWWWWWWW...","L...WWWWWWWW...L","LL...WWWWWW...LL","LLL...GGGG...LLL","........G.......",".......G.G......","......G...G.....","................"]
};

const colors = { '1': '#6d4c41', '2': '#ffecb3', '3': '#424242', '4': '#ffffff', '5': '#ffb74d', '6': '#212121', '7': '#4e342e', '8': '#ffffff', '9': '#ff5252', 'A': '#ffffff', 'B': '#ff80ab', 'C': '#8d6e63', 'D': '#4caf50', 'E': '#8bc34a', 'F': '#ff4081', 'H': '#f44336', 'W': '#ffffff', 'K': '#212121', 'G': '#ffd54f', 'L': '#e1bee7', 'J': '#42a5f5' };

function drawPixelArt(ctx, sprite, startX, startY, baseScaleX, baseScaleY, flipX = false, stretchX = 1.0, stretchY = 1.0, overrideColor = null) {
    if (!sprite) return;
    ctx.save();
    const totalW = sprite[0].length * baseScaleX;
    const totalH = sprite.length * baseScaleY;
    ctx.translate(startX + totalW / 2, startY + totalH);
    ctx.scale(flipX ? -stretchX : stretchX, stretchY);
    ctx.translate(-totalW / 2, -totalH);
    for (let y = 0; y < sprite.length; y++) {
        const row = sprite[y];
        for (let x = 0; x < row.length; x++) {
            const char = row[x];
            if (char !== '.' && char !== ' ') {
                ctx.fillStyle = overrideColor || colors[char];
                ctx.fillRect(x * baseScaleX, y * baseScaleY, baseScaleX + 0.5, baseScaleY + 0.5);
            }
        }
    }
    ctx.restore();
}

function spawnSparkles(x, y, count = 10, special = false) {
    for(let i = 0; i < count; i++) {
        let type = 'sparkle';
        if (special) {
            let r = Math.random();
            if (r < 0.3) type = 'heart';
            else if (r < 0.6) type = 'star';
        }
        particles.push({
            x: x, y: y, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200,
            life: 0.5 + Math.random() * 0.5, size: Math.random() * 6 + 4,
            color: `hsl(${Math.random()*360}, 100%, 80%)`, type: type,
            angle: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 10
        });
    }
}

function spawnTextPop(x, y, text) {
    const words = ["YEAH!", "SWEET!", "LOVE!", "HAPPY!", "WONDERFUL!"];
    const t = text || words[Math.floor(Math.random() * words.length)];
    particles.push({
        x: x, y: y, vx: (Math.random() - 0.5) * 50, vy: -150 - Math.random() * 50,
        life: 1.0, size: 24, color: '#f06292', type: 'text', text: t
    });
}

function spawnPetals(x, y, count = 80) {
    for(let i = 0; i < count; i++) {
        particles.push({
            x: x + (Math.random() - 0.5) * GAME_WIDTH * 1.5,
            y: y - GAME_HEIGHT + Math.random() * GAME_HEIGHT * 0.5,
            vx: (Math.random() - 0.5) * 50 + 60, vy: Math.random() * 80 + 40,
            life: 4.0 + Math.random() * 3.0, size: Math.random() * 6 + 4,
            color: '#ffffff', type: 'petal', angle: Math.random() * Math.PI*2, spin: (Math.random() - 0.5) * 5
        });
    }
}

function startGame() {
    initLevel(currentStage);
    player.x = 100; player.y = GAME_HEIGHT - 40 - player.height;
    player.vx = 0; player.vy = 0;
    player.facingLeft = false; player.scaleX = 1.0; player.scaleY = 1.0;
    player.frameName = 'groomStand'; player.walkTimer = 0;
    player.invincibleTimer = 0; player.knockbackTimer = 0; player.powerUpTimer = 0;
    player.hp = diffConfig[currentDifficulty].hp;
    timeRemaining = diffConfig[currentDifficulty].time;
    let sMult = diffConfig[currentDifficulty].speedMult;
    for (let e of level.enemies) e.speed *= sMult;
    camera.x = 0; camera.shakeTimer = 0; 
    if (currentStage === 1) {
        particles = []; 
        ringsCollected = 0; 
    }
    UI.ringCount.innerText = ringsCollected;
    UI.hpIcons.innerText = "❤".repeat(Math.max(0, player.hp));
    UI.photoOverlay.classList.remove('photo-visible');
    UI.angryBrideContainer.classList.remove('photo-visible');
    UI.goldRankText.classList.add('hidden');
    UI.creditsContainer.classList.add('hidden');
    time = 0;
    currentState = STATE.PLAYING;
    UI.start.classList.add('hidden');
    UI.gameOver.classList.add('hidden');
    UI.clear.classList.add('hidden');
    AudioManager.playBGM('main');
    lastTime = document.timeline.currentTime || performance.now();
    if (animationId) cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(gameLoop);
}

function triggerGameOver(reasonText, isTimeUp = false) {
    if (currentState !== STATE.PLAYING) return;
    currentState = STATE.GAME_OVER;
    AudioManager.sfx.gameOver();
    UI.gameOverReason.innerText = reasonText;
    UI.gameOver.classList.remove('hidden');
    keys.ArrowLeft = false; keys.ArrowRight = false; keys.Space = false;
    if (isTimeUp) {
        UI.gameOverTitle.classList.add('time-up'); UI.gameOverTitle.innerText = "TIME OVER!";
        UI.angryBrideContainer.classList.add('photo-visible');
    } else {
        UI.gameOverTitle.classList.remove('time-up'); UI.gameOverTitle.innerText = "GAME OVER...";
        UI.angryBrideContainer.classList.remove('photo-visible');
    }
}

function checkCollision(r1, r2) {
    return r1.x < r2.x + r2.width && r1.x + r1.width > r2.x && r1.y < r2.y + r2.height && r1.y + r1.height > r2.y;
}

let lastTime = 0;
function updateParticles(dt) {
    for(let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.type === 'heart' || p.type === 'star' || p.type === 'sparkle') p.vy += GRAVITY * 0.1 * dt;
        if (p.type === 'petal') { p.angle += p.spin * dt; p.x += Math.sin(time * 2 + p.spin) * 20 * dt; }
        else if (p.type === 'text') { p.vy *= 0.95; }
        else { p.vx *= 0.98; p.vy *= 0.98; }
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function update(dt) {
    time += dt;
    player.scaleX += (1.0 - player.scaleX) * 15 * dt;
    player.scaleY += (1.0 - player.scaleY) * 15 * dt;
    if (currentState === STATE.CLEAR) { updateParticles(dt); player.frameName = 'groomJump'; return; }
    if (currentState !== STATE.PLAYING) return;
    if (camera.shakeTimer > 0) camera.shakeTimer -= dt;
    timeRemaining -= dt;
    if (timeRemaining <= 0) { timeRemaining = 0; triggerGameOver("Oh no! She's waiting!", true); }
    UI.timeCounter.innerText = Math.ceil(timeRemaining);
    if (player.invincibleTimer > 0) player.invincibleTimer -= dt;
    
    let wasPowerUp = player.powerUpTimer > 0;
    if (player.powerUpTimer > 0) player.powerUpTimer -= dt;
    if (wasPowerUp && player.powerUpTimer <= 0) {
        AudioManager.playBGM('main');
    }

    for (let e of level.enemies) e.x = e.startX + Math.sin(time * e.speed) * e.range;

    let carryDx = 0;
    for (let p of level.platforms) {
        if (p.type === 'liftVertical') { p.y = p.startY + Math.sin(time * p.speed) * p.range; }
        else if (p.type === 'liftHorizontal') {
            let newX = p.startX + Math.sin(time * p.speed) * p.range;
            if (p.prevX === undefined) p.prevX = newX;
            let dx = newX - p.prevX; p.prevX = newX; p.x = newX;
            if (player.onGround && player.y + player.height <= p.y + 5 && player.x + player.width > p.x && player.x < p.x + p.width) { carryDx = dx; }
        }
        else if (p.type === 'ferrisWheel') {
            p.angle += p.speed * dt;
            p.x = p.centerX + Math.cos(p.angle) * p.radius - p.width / 2;
            p.y = p.centerY + Math.sin(p.angle) * p.radius - p.height / 2;
            // Crude carry logic for circular motion
            if (player.onGround && player.y + player.height <= p.y + 10 && player.x + player.width > p.x && player.x < p.x + p.width) {
                 player.x += -Math.sin(p.angle) * p.radius * p.speed * dt;
                 player.y = p.y - player.height;
            }
        }
    }

    if (player.knockbackTimer > 0) { player.knockbackTimer -= dt; } else {
        let currentSpeed = player.powerUpTimer > 0 ? BASE_PLAYER_SPEED * 1.8 : BASE_PLAYER_SPEED;
        if (keys.ArrowLeft) { player.vx = -currentSpeed; player.facingLeft = true; }
        else if (keys.ArrowRight) { player.vx = currentSpeed; player.facingLeft = false; }
        else { player.vx = 0; }
        if (keys.Space && player.onGround) {
            AudioManager.sfx.jump();
            player.vy = JUMP_POWER; player.onGround = false; 
            spawnSparkles(player.x + player.width/2, player.y + player.height, 12, true);
            if (Math.random() < 0.2) spawnTextPop(player.x + 16, player.y);
            player.scaleY = 1.3; player.scaleX = 0.7; 
        }
    }

    player.vy += GRAVITY * dt;
    player.x += player.vx * dt + carryDx;
    if (player.x < 0) player.x = 0;
    if (player.x + player.width > level.endX) player.x = level.endX - player.width;
    let pxCollisionPlatforms = level.platforms.filter(p => !p.type.includes('lift') && p.type !== 'ferrisWheel');
    for (let p of pxCollisionPlatforms) { if (checkCollision(player, p)) { if (player.vx > 0) player.x = p.x - player.width; else if (player.vx < 0) player.x = p.x + p.width; player.vx = 0; } }
    const wasOnGround = player.onGround;
    player.y += player.vy * dt;
    player.onGround = false;
    for (let p of level.platforms) { if (checkCollision(player, p)) { if (player.vy >= 0 && player.y + player.height - player.vy * dt <= p.y + p.height) { if (!wasOnGround) { player.scaleY = 0.6; player.scaleX = 1.3; spawnSparkles(player.x + player.width/2, p.y, 5); } player.y = p.y - player.height; player.vy = 0; player.onGround = true; } else if (player.vy < 0 && !p.type.includes('lift') && p.type !== 'ferrisWheel') { player.y = p.y + p.height; player.vy = 0; } } }
    if (player.invincibleTimer <= 0 && player.powerUpTimer <= 0) {
        for (let e of level.enemies) {
            let hitBox = {x: e.x + 4, y: e.y + e.height/4, width: e.width - 8, height: e.height*0.75};
            if (checkCollision(player, hitBox)) {
                AudioManager.sfx.hit();
                camera.shakeTimer = 0.2;
                player.hp--; UI.hpIcons.innerText = "❤".repeat(Math.max(0, player.hp));
                player.scaleX = 1.4; player.scaleY = 0.5; player.invincibleTimer = 1.5; player.knockbackTimer = 0.4;
                player.vy = -350; player.vx = player.x < e.x ? -200 : 200; player.onGround = false;
                spawnSparkles(player.x + 16, player.y + 16, 20); 
                if (player.hp <= 0) { triggerGameOver("You had too much to drink!"); }
            }
        }
    }
    if (player.y > GAME_HEIGHT + 150) triggerGameOver("You fell down!");
    if (!player.onGround) player.frameName = 'groomJump';
    else if (player.vx !== 0 && player.knockbackTimer <= 0) { player.walkTimer += dt; if (player.walkTimer > 0.3) player.walkTimer -= 0.3; player.frameName = player.walkTimer < 0.15 ? 'groomWalk1' : 'groomWalk2'; }
    else { player.frameName = 'groomStand'; player.walkTimer = 0; }
    for (let item of level.items) {
        if (!item.collected && checkCollision(player, item)) {
            item.collected = true;
            if (item.type === 'champagne') {
                AudioManager.sfx.powerup();
                spawnTextPop(player.x + 16, player.y, "FEVER!");
                player.powerUpTimer = 5.0;
                spawnSparkles(player.x + 16, player.y + 16, 30, true);
            } else {
                AudioManager.sfx.item();
                spawnTextPop(player.x + 16, player.y);
                ringsCollected++;
                UI.ringCount.innerText = ringsCollected;
                spawnSparkles(item.x + item.width/2, item.y + item.height/2, 20, true);
            }
        }
    }
    if (checkCollision(player, level.goal) && currentState === STATE.PLAYING) {
        if (currentStage < MAX_STAGES) {
            currentState = STATE.CLEAR;
            UI.stageClearScreen.classList.remove('hidden');
            AudioManager.sfx.clear();
        } else {
            currentState = STATE.CLEAR; UI.clear.classList.remove('hidden');
            UI.creditsContainer.classList.remove('hidden');
            AudioManager.sfx.clear();
            if (ringsCollected === 3) { UI.goldRankText.classList.remove('hidden'); spawnPetals(camera.x + GAME_WIDTH / 2, GAME_HEIGHT); spawnPetals(camera.x + GAME_WIDTH / 4, GAME_HEIGHT); setTimeout(() => { UI.photoOverlay.classList.add('photo-visible'); }, 1000); }
            else { spawnHearts(player.x + player.width/2, player.y); setTimeout(() => { UI.photoOverlay.classList.add('photo-visible'); }, 1500); }
        }
    }
    let targetCamX = player.x - GAME_WIDTH / 2.5;
    if (targetCamX < 0) targetCamX = 0; if (targetCamX > level.endX - GAME_WIDTH) targetCamX = level.endX - GAME_WIDTH;
    camera.x += (targetCamX - camera.x) * 5 * dt;
    updateParticles(dt);
}

function spawnHearts(x, y) {
    for(let i=0; i<30; i++) {
        particles.push({
            x: x, y: y, vx: (Math.random()-0.5)*300, vy: -200 - Math.random()*200,
            life: 1.5, size: 20 + Math.random()*15, color: '#f06292', type: 'heart',
            angle: Math.random()*Math.PI*2, spin: (Math.random()-0.5)*5
        });
    }
}

function drawParallax() {
    ctx.save();
    let skyColor = '#b2ebf2'; // Day
    let mountainColor = '#80deea';
    let cloudColor = 'rgba(255,255,255, 0.4)';
    
    if (currentStage === 2) { // Evening
        skyColor = '#ffccbc'; mountainColor = '#ffab91'; cloudColor = 'rgba(255,243,224, 0.4)';
    } else if (currentStage === 3) { // Night
        skyColor = '#1a237e'; mountainColor = '#0d47a1'; cloudColor = 'rgba(255,255,255, 0.2)';
    }
    
    const farScroll = camera.x * 0.1; ctx.fillStyle = skyColor; ctx.beginPath();
    for (let i = 0; i < 20; i++) { let xOffset = i * 400 - (farScroll % 400); ctx.arc(xOffset, GAME_HEIGHT, 220, Math.PI, 0); } ctx.fill();
    const midScroll = camera.x * 0.25; ctx.fillStyle = mountainColor; 
    for (let i = 0; i < 30; i++) { let xOffset = i * 200 - (midScroll % 200); ctx.fillRect(xOffset, GAME_HEIGHT - 120, 60, 80); ctx.fillRect(xOffset + 30, GAME_HEIGHT - 150, 40, 110); }
    const nearScroll = camera.x * 0.5; ctx.fillStyle = cloudColor;
    for (let i = 0; i < 25; i++) { let xOffset = i * 350 - (nearScroll % 350); ctx.beginPath(); ctx.arc(xOffset + 50, 60 + (i%5)*30, 40, 0, Math.PI*2); ctx.arc(xOffset + 80, 50 + (i%5)*30, 50, 0, Math.PI*2); ctx.arc(xOffset + 120, 65 + (i%5)*30, 40, 0, Math.PI*2); ctx.fill(); }
    ctx.restore();
}

function drawChapelBackground() {
    const startX = level.endX - 500; ctx.save(); ctx.fillStyle = '#4fc3f7'; ctx.fillRect(startX, 0, 800, GAME_HEIGHT);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; ctx.beginPath(); ctx.arc(startX + 180, 80, 50, 0, Math.PI*2); ctx.arc(startX + 230, 90, 60, 0, Math.PI*2); ctx.arc(startX + 280, 80, 50, 0, Math.PI*2); ctx.fill();
    const walkwayX = startX + 400; ctx.fillStyle = '#f5f5f5'; ctx.fillRect(walkwayX, 180, 400, 30); 
    for (let i = 0; i < 4; i++) { let px = walkwayX + 30 + i * 90; ctx.fillStyle = '#eeeeee'; ctx.fillRect(px, 210, 20, GAME_HEIGHT); ctx.fillStyle = '#bdbdbd'; ctx.fillRect(px - 5, 210, 30, 10); ctx.fillRect(px - 5, GAME_HEIGHT - 60, 30, 20); }
    const chapelX = startX + 50; ctx.fillStyle = '#fff3e0'; ctx.fillRect(chapelX, 150, 180, GAME_HEIGHT);
    ctx.fillStyle = '#cfd8dc'; ctx.beginPath(); ctx.arc(chapelX + 90, GAME_HEIGHT - 80, 40, Math.PI, 0); ctx.fill(); ctx.fillRect(chapelX + 50, GAME_HEIGHT - 80, 80, 80);
    ctx.fillStyle = '#37474f'; ctx.beginPath(); ctx.arc(chapelX + 90, GAME_HEIGHT - 80, 30, Math.PI, 0); ctx.fill(); ctx.fillRect(chapelX + 60, GAME_HEIGHT - 80, 60, 80);
    ctx.fillStyle = '#ffe082'; ctx.fillRect(chapelX + 40, 60, 100, 90);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(chapelX + 90, 105, 30, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#bdbdbd'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#212121'; ctx.fillRect(chapelX + 88, 85, 4, 20); ctx.fillRect(chapelX + 90, 103, 20, 4); 
    ctx.fillStyle = '#66bb6a'; ctx.beginPath(); ctx.moveTo(chapelX + 20, 60); ctx.lineTo(chapelX + 160, 60); ctx.lineTo(chapelX + 90, -40); ctx.fill();
    ctx.fillStyle = '#fbc02d'; ctx.fillRect(chapelX + 87, -70, 6, 30); ctx.fillRect(chapelX + 75, -60, 30, 6);
    ctx.fillStyle = '#2e7d32'; ctx.beginPath(); ctx.arc(chapelX - 30, GAME_HEIGHT - 60, 70, 0, Math.PI * 2); ctx.arc(chapelX + 220, GAME_HEIGHT - 80, 80, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d7ccc8'; ctx.fillRect(startX, GAME_HEIGHT - 40, 800, 40); ctx.restore();
}

function drawPhotoFrame(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = '#d4af37'; // Gold frame
    ctx.fillRect(x, y, 60, 80);
    ctx.fillStyle = '#fff'; // White matting
    ctx.fillRect(x + 5, y + 5, 50, 70);
    ctx.fillStyle = '#fce4ec'; // placeholder "photo"
    ctx.fillRect(x + 10, y + 10, 40, 60);
    // Tiny silhouettes for silhouettes
    ctx.fillStyle = '#444';
    ctx.fillRect(x + 18, y + 35, 10, 15);
    ctx.fillRect(x + 32, y + 38, 8, 12);
    ctx.beginPath(); ctx.arc(x + 23, y + 32, 5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 36, y + 34, 4, 0, Math.PI*2); ctx.fill();
    ctx.restore();
}

function draw() {
    ctx.save();
    if (camera.shakeTimer > 0) { ctx.translate((Math.random()-0.5)*10, (Math.random()-0.5)*10); }
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT); drawParallax();
    ctx.save(); ctx.translate(-Math.floor(camera.x), 0);
    
    // Draw background decorations first
    for (let d of level.decoration) { if (d.type === 'photoFrame') drawPhotoFrame(ctx, d.x, d.y); }
    
    const chapelStartX = level.endX - 500;
    drawChapelBackground();
    for (let p of level.platforms) { if (p.type === 'ground') { const isChapelArea = p.x + p.width > chapelStartX; if (!isChapelArea || p.x < chapelStartX) { let renderWidth = isChapelArea ? chapelStartX - p.x : p.width; ctx.fillStyle = '#a5d6a7'; ctx.fillRect(p.x, p.y, renderWidth, p.height); ctx.fillStyle = '#81c784'; ctx.fillRect(p.x, p.y, renderWidth, 10); } } else if (p.type === 'block' || p.type.includes('lift')) { let count = Math.floor(p.width / 40); if (count === 0) count = 1; for(let i=0; i<count; i++) drawPixelArt(ctx, spriteSheet.present, p.x + i * 40, p.y, 40/16, p.height/16); } }
    for (let e of level.enemies) { let bobY = Math.sin(time * 10) * 3; let isMovingLeft = Math.cos(time * e.speed) < 0; let spr = e.type === 'clock' ? spriteSheet.clock : spriteSheet.bottle; drawPixelArt(ctx, spr, e.x, e.y + bobY, 32/16, 32/16, isMovingLeft); }
    for (let item of level.items) { if (!item.collected) { let bobY = Math.sin(time * 5) * 5; let spr = spriteSheet[item.type]; drawPixelArt(ctx, spr, item.x, item.y + bobY, 32/16, 32/16); } }
    const brideScale = 32 / 16; drawPixelArt(ctx, spriteSheet.bride, level.goal.x, level.goal.y, brideScale, brideScale);
    let groomOverride = null;
    if (player.powerUpTimer > 0) { groomOverride = `hsl(${(time * 360 * 2) % 360}, 100%, 70%)`; }
    else if (player.invincibleTimer > 0 && Math.floor(time * 15) % 2 === 0) { groomOverride = '#ff5252'; }
    if (player.invincibleTimer <= 0 || player.powerUpTimer > 0 || Math.floor(time * 10) % 2 === 0) { const groomScale = 32 / 16; drawPixelArt(ctx, spriteSheet[player.frameName], player.x, player.y, groomScale, groomScale, player.facingLeft, player.scaleX, player.scaleY, groomOverride); }
    for(let i = particles.length - 1; i >= 0; i--) { 
        let p = particles[i]; ctx.save(); 
        ctx.globalAlpha = Math.max(0, p.life / (p.type === 'petal' ? 3.0 : (p.type === 'text' ? 1.0 : 0.5))); 
        ctx.fillStyle = p.color; 
        if (p.type === 'petal') { ctx.translate(p.x, p.y); ctx.rotate(p.angle); ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size/2, 0, 0, Math.PI*2); ctx.fill(); } 
        else if (p.type === 'heart') { ctx.font = `${Math.floor(p.size)}px Arial`; ctx.fillText('❤', p.x, p.y); } 
        else if (p.type === 'star') { ctx.font = `${Math.floor(p.size)}px Arial`; ctx.fillText('⭐', p.x, p.y); } 
        else if (p.type === 'text') { ctx.font = `bold ${p.size}px Fredoka One, cursive`; ctx.textAlign = 'center'; ctx.fillText(p.text, p.x, p.y); }
        else { ctx.fillRect(p.x, p.y, p.size, p.size); } 
        ctx.restore(); 
    }
    ctx.restore(); ctx.restore();
}

function gameLoop(timestamp) { const dt = Math.min((timestamp - lastTime) / 1000, 0.1); lastTime = timestamp; update(dt); draw(); if (currentState === STATE.PLAYING || currentState === STATE.CLEAR) animationId = requestAnimationFrame(gameLoop); else animationId = null; }

draw();
