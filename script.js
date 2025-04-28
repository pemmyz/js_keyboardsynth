// --- Audio Setup ---
let audioContext;
const fadeoutTime = 0.2; // Slightly faster fadeout
const attackTime = 0; // Instant attack for minimal latency
const releaseTime = fadeoutTime; // Same for consistency

// DOM Elements for status and interaction
const statusDiv = document.getElementById('audio-status');
const kbdElements = {}; // Cache kbd elements for faster access
document.querySelectorAll('kbd').forEach(kbd => {
    kbdElements[kbd.textContent.toLowerCase()] = kbd;
});

// Function to initialize/resume the Audio Context
function initializeAudio() {
    return new Promise((resolve, reject) => {
        if (audioContext && audioContext.state === 'running') {
            resolve();
            return;
        }

        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)({
                    latencyHint: 0 // Request lowest possible latency
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

// Update visual status indicator
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

// --- Key to Frequency Mapping ---
const keyToFrequency = {
    'q': 261.63, '2': 277.18, 'w': 293.66, '3': 311.13, 'e': 329.63, 'r': 349.23,
    '5': 369.99, 't': 392.00, '6': 415.30, 'y': 440.00, '7': 466.16, 'u': 493.88,
    'i': 523.25, '9': 554.37, 'o': 587.33, '0': 622.25, 'p': 659.26, 'a': 698.46,
    'z': 739.99, 's': 783.99, 'x': 830.61, 'd': 880.00, 'c': 932.33, 'f': 987.77,
    'g': 1046.50, 'h': 1108.73, 'j': 1174.66, 'k': 1244.51, 'l': 1318.51
};

// --- Store Playing Sounds ---
const playingSounds = {};

// --- Sound Generation and Control ---

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
    if (playingSounds[key]) return;

    const frequency = keyToFrequency[key];
    if (!frequency) return;

    const now = audioContext.currentTime;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);

    // Instant attack: set gain immediately
    gainNode.gain.setValueAtTime(1, now);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start(now);

    playingSounds[key] = { oscillator, gainNode };

    if (kbdElements[key]) {
        kbdElements[key].classList.add('active');
    }
}

function stopNote(key) {
    if (!audioContext || !playingSounds[key]) return;

    const { oscillator, gainNode } = playingSounds[key];
    const now = audioContext.currentTime;

    // Fade out smoothly
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(0.0001, now + releaseTime);

    oscillator.stop(now + releaseTime);

    delete playingSounds[key];

    if (kbdElements[key]) {
        kbdElements[key].classList.remove('active');
    }
}

// --- Event Listeners ---

function handleInteraction() {
    initializeAudio().catch(err => {
        updateAudioStatus("Failed to initialize audio.", "error");
    });
}

window.addEventListener('keydown', (event) => {
    if (!audioContext || audioContext.state !== 'running') {
        initializeAudio();
    }

    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
        return;
    }

    const key = event.key.toLowerCase();
    playNote(key);
});

window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    stopNote(key);
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
                    document.body.addEventListener('click', handleInteraction, { once: true });
                    document.body.addEventListener('touchstart', handleInteraction, { once: true });
                    window.addEventListener('keydown', handleInteraction, { once: true });
                } else if (audioContext.state === 'running') {
                    updateAudioStatus("Audio Ready", "ready");
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

