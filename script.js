// --- Audio Setup ---
let audioContext;
const fadeoutTime = 0.2;
const attackTime = 0.01;
const releaseTime = fadeoutTime;

// DOM Elements
const statusDiv = document.getElementById('audio-status');
const waveformSelect = document.getElementById('waveform-select');
let currentWaveform = 'sine';
const kbdElements = {};
document.querySelectorAll('kbd').forEach(kbd => {
    kbdElements[kbd.textContent.toLowerCase()] = kbd;
});

// Key to Frequency Mapping
const keyToFrequency = {
    'q': 261.63, '2': 277.18, 'w': 293.66, '3': 311.13, 'e': 329.63, 'r': 349.23,
    '5': 369.99, 't': 392.00, '6': 415.30, 'y': 440.00, '7': 466.16, 'u': 493.88,
    'i': 523.25, '9': 554.37, 'o': 587.33, '0': 622.25, 'p': 659.26, 'a': 698.46,
    'z': 739.99, 's': 783.99, 'x': 830.61, 'd': 880.00, 'c': 932.33, 'f': 987.77,
    'g': 1046.50, 'h': 1108.73, 'j': 1174.66, 'k': 1244.51, 'l': 1318.51
};

// Polyphonic Oscillator Pools
const oscillatorPools = {};
const poolSizePerKey = 4;

// Sustain pedal
let sustainPedal = false;

function initializeAudio() {
    return new Promise((resolve, reject) => {
        if (audioContext && audioContext.state === 'running') {
            resolve();
            return;
        }

        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)({
                    latencyHint: 0
                });
                console.log("AudioContext created.");
                updateAudioStatus();
            }

            audioContext.resume().then(() => {
                console.log("AudioContext resumed.");
                updateAudioStatus();
                document.body.removeEventListener('click', handleInteraction);
                document.body.removeEventListener('touchstart', handleInteraction);
                window.removeEventListener('keydown', handleInteraction);
                preCreateOscillatorPools();
                resolve();
            }).catch(e => {
                console.error("AudioContext resume failed:", e);
                updateAudioStatus("Error resuming audio.", "error");
                reject(e);
            });

        } catch (e) {
            console.error("Web Audio API not supported or creation failed:", e);
            updateAudioStatus("Web Audio API not supported.", "error");
            reject(e);
        }
    });
}

function updateAudioStatus(message = '', type = '') {
    if (!statusDiv) return;

    if (type === 'error') {
        statusDiv.textContent = message || "Error initializing audio.";
        statusDiv.className = 'error';
    } else if (!audioContext) {
        statusDiv.textContent = message || "Audio not initialized.";
        statusDiv.className = 'error';
    } else if (audioContext.state === 'running') {
        statusDiv.textContent = message || "Audio Ready";
        statusDiv.className = 'ready';
    } else if (audioContext.state === 'suspended') {
        statusDiv.textContent = message || "Click or press a key to enable audio";
        statusDiv.className = 'suspended';
    } else if (audioContext.state === 'closed') {
        statusDiv.textContent = message || "Audio context closed.";
        statusDiv.className = 'error';
    }
}

// Pre-create Oscillator Pools
function preCreateOscillatorPools() {
    for (const key in keyToFrequency) {
        const frequency = keyToFrequency[key];
        oscillatorPools[key] = [];

        for (let i = 0; i < poolSizePerKey; i++) {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.type = currentWaveform;
            oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            oscillator.start();

            oscillatorPools[key].push({ oscillator, gainNode, busy: false });
        }
    }
}

// Reset oscillators when waveform changes
function resetOscillatorPools() {
    console.log("Resetting oscillators...");
    for (const key in oscillatorPools) {
        for (const sound of oscillatorPools[key]) {
            sound.oscillator.stop();
            sound.gainNode.disconnect();
        }
    }
    preCreateOscillatorPools();
}

// Play and Stop Notes
function playNote(key) {
    if (!audioContext || audioContext.state !== 'running') {
        console.warn("AudioContext not running. Note blocked.");
        if (audioContext && audioContext.state === 'suspended') {
            initializeAudio();
        } else if (!audioContext) {
            updateAudioStatus("Click or press a key to enable audio", "suspended");
        }
        return;
    }

    const pool = oscillatorPools[key];
    if (!pool) return;

    const sound = pool.find(s => !s.busy);
    if (!sound) {
        console.warn(`No free oscillators for key "${key}"`);
        return;
    }

    const now = audioContext.currentTime;

    sound.gainNode.gain.cancelScheduledValues(now);
    sound.gainNode.gain.setValueAtTime(0, now);
    sound.gainNode.gain.linearRampToValueAtTime(1, now + attackTime);

    sound.busy = true;

    if (kbdElements[key]) {
        kbdElements[key].classList.add('active');
    }
}

function stopNote(key) {
    if (!audioContext) return;

    const pool = oscillatorPools[key];
    if (!pool) return;

    const now = audioContext.currentTime;

    for (const sound of pool) {
        if (sound.busy) {
            sound.gainNode.gain.cancelScheduledValues(now);
            sound.gainNode.gain.setValueAtTime(sound.gainNode.gain.value, now);
            sound.gainNode.gain.linearRampToValueAtTime(0.0001, now + releaseTime);

            sound.busy = false;
        }
    }

    if (kbdElements[key]) {
        kbdElements[key].classList.remove('active');
    }
}

// Handle interactions
function handleInteraction() {
    initializeAudio().catch(err => {
        updateAudioStatus("Failed to initialize audio.", "error");
    });
}

// Handle key events
window.addEventListener('keydown', (event) => {
    if (!audioContext || audioContext.state !== 'running') {
        initializeAudio();
    }

    if (event.repeat) return;

    if (event.code === "Space") {
        sustainPedal = true;
        console.log("Sustain pedal down");
        event.preventDefault();
        return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
    }

    const key = event.key.toLowerCase();
    playNote(key);
});

window.addEventListener('keyup', (event) => {
    if (event.code === "Space") {
        sustainPedal = false;
        console.log("Sustain pedal up");
        return;
    }

    const key = event.key.toLowerCase();
    if (!sustainPedal) {
        stopNote(key);
    }
});

// Handle waveform change
waveformSelect.addEventListener('change', () => {
    currentWaveform = waveformSelect.value;
    console.log("Waveform changed to", currentWaveform);
    resetOscillatorPools();
});

// Initial Setup
window.addEventListener('load', () => {
    if (!(window.AudioContext || window.webkitAudioContext)) {
        updateAudioStatus("Browser doesn't support Web Audio API.", "error");
    } else {
        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 0 });
                if (audioContext.state === 'suspended') {
                    updateAudioStatus("Click or press a key to enable audio", "suspended");
                    document.body.addEventListener('click', handleInteraction, { once: true });
                    document.body.addEventListener('touchstart', handleInteraction, { once: true });
                    window.addEventListener('keydown', handleInteraction, { once: true });
                } else if (audioContext.state === 'running') {
                    updateAudioStatus("Audio Ready", "ready");
                    preCreateOscillatorPools();
                } else {
                    updateAudioStatus("Audio context state: " + audioContext.state, "error");
                }
            } else {
                updateAudioStatus();
            }
        } catch (e) {
            console.error("Error creating initial AudioContext:", e);
            updateAudioStatus("Failed to initialize audio.", "error");
        }
    }
});

statusDiv.addEventListener('click', () => {
    if (audioContext && audioContext.state === 'suspended') {
        initializeAudio();
    }
});

