// --- Audio Setup ---
let audioContext;
const fadeoutTime = 0.2;
const attackTime = 0.01;
const releaseTime = fadeoutTime;

const statusDiv = document.getElementById('audio-status');
const waveformSelect = document.getElementById('waveform-select');
const volumeSlider = document.getElementById('volume-slider');
const octaveShiftDisplay = document.getElementById('octave-shift-display');
const noteDisplay = document.getElementById('note-display');

let currentWaveform = 'sine';
let globalVolume = 0.25;
let octaveShift = 0;

const baseKeyToFrequency = {
    'q': 261.63, '2': 277.18, 'w': 293.66, '3': 311.13, 'e': 329.63, 'r': 349.23,
    '5': 369.99, 't': 392.00, '6': 415.30, 'y': 440.00, '7': 466.16, 'u': 493.88,
    'i': 523.25, '9': 554.37, 'o': 587.33, '0': 622.25, 'p': 659.26,
    'a': 698.46, 's': 783.99, 'd': 880.00, 'f': 987.77, 'g': 1046.50,
    'h': 1108.73, 'j': 1174.66, 'k': 1244.51, 'l': 1318.51,
    'z': 739.99, 'x': 830.61, 'c': 932.33
};

const keyToNoteName = {
    'q': 'C4', '2': 'C#4', 'w': 'D4', '3': 'D#4', 'e': 'E4', 'r': 'F4', '5': 'F#4',
    't': 'G4', '6': 'G#4', 'y': 'A4', '7': 'A#4', 'u': 'B4',
    'i': 'C5', '9': 'C#5', 'o': 'D5', '0': 'D#5', 'p': 'E5',
    'a': 'F5', 's': 'G5', 'd': 'A5', 'f': 'B5', 'g': 'C6',
    'h': 'C#6', 'j': 'D6', 'k': 'D#6', 'l': 'E6',
    'z': 'F#5', 'x': 'G#5', 'c': 'A#5'
};

const oscillatorPools = {};
const poolSizePerKey = 4;
let sustainPedal = false;

const kbdElements = {};
document.querySelectorAll('kbd').forEach(kbd => {
    kbdElements[kbd.textContent.toLowerCase()] = kbd;
});

function getShiftedFrequency(frequency) {
    return frequency * Math.pow(2, octaveShift);
}

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
                updateAudioStatus();
            }

            audioContext.resume().then(() => {
                updateAudioStatus();
                preCreateOscillatorPools();
                resolve();
            }).catch(e => {
                updateAudioStatus("Error resuming audio.", "error");
                reject(e);
            });

        } catch (e) {
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

function preCreateOscillatorPools() {
    for (const key in baseKeyToFrequency) {
        oscillatorPools[key] = [];
        for (let i = 0; i < poolSizePerKey; i++) {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.type = currentWaveform;
            oscillator.frequency.setValueAtTime(baseKeyToFrequency[key], audioContext.currentTime);
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            oscillator.start();

            oscillatorPools[key].push({ oscillator, gainNode, busy: false });
        }
    }
}

function getFreeOscillator(key) {
    const pool = oscillatorPools[key];
    return pool ? pool.find(s => !s.busy) : null;
}

function playNote(key) {
    if (!audioContext || audioContext.state !== 'running') {
        initializeAudio();
        return;
    }

    const sound = getFreeOscillator(key);
    if (!sound) return;

    const now = audioContext.currentTime;
    const baseFrequency = baseKeyToFrequency[key];
    const shiftedFrequency = getShiftedFrequency(baseFrequency);

    sound.oscillator.frequency.setValueAtTime(shiftedFrequency, now);
    sound.gainNode.gain.cancelScheduledValues(now);
    sound.gainNode.gain.setValueAtTime(0, now);
    sound.gainNode.gain.linearRampToValueAtTime(globalVolume, now + attackTime);

    sound.busy = true;

    if (kbdElements[key]) {
        kbdElements[key].classList.add('active');
    }

    // Show Note Name
    if (keyToNoteName[key]) {
        noteDisplay.textContent = keyToNoteName[key];
    }
}

function stopNote(key) {
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

// --- Event Listeners ---

function handleInteraction() {
    initializeAudio();
}

window.addEventListener('keydown', (event) => {
    if (event.repeat) return;

    if (event.code === "Space") {
        sustainPedal = true;
        return;
    }

    if (event.code === "ArrowUp") {
        octaveShift++;
        octaveShiftDisplay.textContent = octaveShift;
        return;
    }
    if (event.code === "ArrowDown") {
        octaveShift--;
        octaveShiftDisplay.textContent = octaveShift;
        return;
    }

    const key = event.key.toLowerCase();
    playNote(key);
});

window.addEventListener('keyup', (event) => {
    if (event.code === "Space") {
        sustainPedal = false;
        return;
    }

    const key = event.key.toLowerCase();
    if (!sustainPedal) {
        stopNote(key);
    }
});

volumeSlider.addEventListener('input', () => {
    globalVolume = parseFloat(volumeSlider.value);
});

waveformSelect.addEventListener('change', () => {
    currentWaveform = waveformSelect.value;
    preCreateOscillatorPools();
});

document.querySelectorAll('kbd').forEach(kbd => {
    const key = kbd.textContent.toLowerCase();
    kbd.addEventListener('mousedown', (event) => {
        event.preventDefault();
        playNote(key);
    });
    kbd.addEventListener('mouseup', (event) => {
        event.preventDefault();
        if (!sustainPedal) stopNote(key);
    });
    kbd.addEventListener('mouseleave', (event) => {
        event.preventDefault();
        if (!sustainPedal) stopNote(key);
    });
    kbd.addEventListener('touchstart', (event) => {
        event.preventDefault();
        playNote(key);
    });
    kbd.addEventListener('touchend', (event) => {
        event.preventDefault();
        if (!sustainPedal) stopNote(key);
    });
});

// --- Initial Setup ---

window.addEventListener('load', () => {
    if (!(window.AudioContext || window.webkitAudioContext)) {
        updateAudioStatus("Browser doesn't support Web Audio API.", "error");
    } else {
        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 0 });
                if (audioContext.state === 'suspended') {
                    updateAudioStatus("Click or press a key to enable audio", "suspended");
                } else if (audioContext.state === 'running') {
                    updateAudioStatus("Audio Ready", "ready");
                    preCreateOscillatorPools();
                }
            }
        } catch (e) {
            updateAudioStatus("Failed to initialize audio.", "error");
        }
    }
});

statusDiv.addEventListener('click', () => {
    if (audioContext && audioContext.state === 'suspended') {
        initializeAudio();
    }
});

