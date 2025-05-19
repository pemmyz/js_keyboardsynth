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

let currentWaveform = waveformSelect.value;
let globalVolume = 0.1;
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
let sustainedNotes = new Set();
let physicallyDownKeys = new Set(); // Tracks physically pressed keys

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
                    latencyHint: 'interactive'
                });
            }
            audioContext.resume().then(() => {
                if (Object.keys(oscillatorPools).length === 0) {
                    preCreateOscillatorPools();
                }
                updateAudioStatus();
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
    const currentStatus = audioContext ? audioContext.state : 'uninitialized';
    if (type === 'error') {
        statusDiv.textContent = message || "Error initializing audio.";
        statusDiv.className = 'error';
    } else if (currentStatus === 'running') {
        statusDiv.textContent = message || "Audio Ready";
        statusDiv.className = 'ready';
    } else if (currentStatus === 'suspended') {
        statusDiv.textContent = message || "Click or press a key to enable audio";
        statusDiv.className = 'suspended';
    } else if (currentStatus === 'closed') {
        statusDiv.textContent = message || "Audio context closed.";
        statusDiv.className = 'error';
    } else {
        statusDiv.textContent = message || "Audio not initialized.";
        statusDiv.className = 'error';
    }
}

function preCreateOscillatorPools() {
    if (!audioContext || audioContext.state !== 'running') return;
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
            oscillatorPools[key].push({ oscillator, gainNode, busy: false, key, busyTimeoutId: null });
        }
    }
}

function getFreeOscillator(key) {
    if (!oscillatorPools[key]) return null;
    return oscillatorPools[key].find(s => !s.busy);
}

function playNote(key) {
    if (!audioContext || audioContext.state !== 'running') {
        initializeAudio().then(() => { if (audioContext.state === 'running') playNote(key); })
                         .catch(err => console.error("Audio init failed during playNote:", err));
        return;
    }
    if (!baseKeyToFrequency[key]) return;

    const sound = getFreeOscillator(key);
    if (!sound) return;

    if (sound.busyTimeoutId) { // If it was fading out, cancel that
        clearTimeout(sound.busyTimeoutId);
        sound.busyTimeoutId = null;
    }
    sound.busy = true; // Mark as busy *before* gain ramp

    const now = audioContext.currentTime;
    const baseFrequency = baseKeyToFrequency[key];
    const shiftedFrequency = getShiftedFrequency(baseFrequency);

    sound.oscillator.type = currentWaveform;
    sound.oscillator.frequency.setValueAtTime(shiftedFrequency, now);
    sound.gainNode.gain.cancelScheduledValues(now);
    sound.gainNode.gain.setValueAtTime(sound.gainNode.gain.value, now);
    sound.gainNode.gain.linearRampToValueAtTime(globalVolume, now + attackTime);

    if (kbdElements[key]) {
        kbdElements[key].classList.add('active');
    }

    if (keyToNoteName[key]) {
        const noteNamePart = keyToNoteName[key].slice(0, -1);
        const octaveNumber = parseInt(keyToNoteName[key].slice(-1)) + octaveShift;
        noteDisplay.textContent = noteNamePart + octaveNumber;
    }
}

function stopNote(key, forceStop = false) {
    if (sustainPedal && !forceStop) {
        sustainedNotes.add(key);
        if (kbdElements[key] && !kbdElements[key].classList.contains('active')) {
            kbdElements[key].classList.add('active'); // Ensure sustained notes are visually active
        }
        return;
    }

    if (!audioContext || !baseKeyToFrequency[key] || !oscillatorPools[key]) return;

    const now = audioContext.currentTime;
    let anySoundWasFading = false;

    for (const sound of oscillatorPools[key]) {
        if (sound.busy) { // Only stop oscillators that are currently busy
            anySoundWasFading = true;
            sound.gainNode.gain.cancelScheduledValues(now);
            sound.gainNode.gain.setValueAtTime(sound.gainNode.gain.value, now);
            sound.gainNode.gain.linearRampToValueAtTime(0.0001, now + releaseTime);

            if (sound.busyTimeoutId) clearTimeout(sound.busyTimeoutId); // Clear previous timeout

            sound.busyTimeoutId = setTimeout(() => {
                sound.busy = false;
                sound.busyTimeoutId = null;
                checkAndDeactivateVisual(key); // Check visual state after this oscillator finishes its release
            }, releaseTime * 1000 + 50); // Buffer of 50ms
        }
    }

    if (forceStop) {
        sustainedNotes.delete(key);
        if (!anySoundWasFading) { // If forcing stop but no sounds were busy (e.g. only in sustainedNotes)
            checkAndDeactivateVisual(key); // Check visual state immediately
        }
    } else if (!anySoundWasFading) {
        // If not forcing stop, and no sounds were busy, still check.
        // This handles case where stopNote is called for an already idle key that might be visually stuck.
        checkAndDeactivateVisual(key);
    }
}

function checkAndDeactivateVisual(key) {
    if (!kbdElements[key]) return;

    const isDirectlyHeld = physicallyDownKeys.has(key) ||
                           (currentTouchedKeyForDrag === key) ||
                           (isMouseButton1Down && kbdElements[key].matches(':hover'));

    if (isDirectlyHeld) {
        if (!kbdElements[key].classList.contains('active')) {
            kbdElements[key].classList.add('active');
        }
        return; // Held by direct input, keep/make active
    }

    if (sustainPedal && sustainedNotes.has(key)) {
         if (!kbdElements[key].classList.contains('active')) {
            kbdElements[key].classList.add('active');
        }
        return; // Sustained by pedal, keep/make active
    }

    let anyAudioStillBusyForKey = false;
    if (oscillatorPools[key]) {
        anyAudioStillBusyForKey = oscillatorPools[key].some(s => s.busy);
    }

    if (!anyAudioStillBusyForKey) { // No direct hold, not sustained by pedal, no audio busy for this key
        kbdElements[key].classList.remove('active');
    } else {
        // Audio is busy for this key (or it should be active due to other prior checks), ensure it's visually active
         if (!kbdElements[key].classList.contains('active')) {
            kbdElements[key].classList.add('active');
        }
    }
}


// --- Global state for mouse and touch dragging ---
let isMouseButton1Down = false;
let currentTouchedKeyForDrag = null;

window.addEventListener('mousedown', (event) => {
    initializeAudio();
    if (event.button === 0) {
        isMouseButton1Down = true;
    }
});
window.addEventListener('mouseup', (event) => {
    if (event.button === 0) {
        isMouseButton1Down = false;
        // If mouse up happens not over a key, any dragged key should have been stopped by mouseout
        // or its own mouseup. This global mouseup helps reset the flag.
        // Check all kbd elements if any were active due to mouse drag and should now stop
        document.querySelectorAll('kbd.active').forEach(kbd => {
            const key = kbd.textContent.toLowerCase();
            if (!physicallyDownKeys.has(key) && currentTouchedKeyForDrag !== key) {
                 // If was active, and mouse is now up, and not held by other means
                 // stopNote will trigger checkAndDeactivateVisual after release
                 // This is a bit broad, kbd mouseout should handle most cases.
            }
        });
    }
});

// --- Keyboard (physical) event listeners ---
window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    initializeAudio();

    if (event.code === "Space") {
        event.preventDefault();
        sustainPedal = true;
        // Ensure currently playing notes that become sustained are visually active
        physicallyDownKeys.forEach(key => {
            if (kbdElements[key] && !kbdElements[key].classList.contains('active')) {
                kbdElements[key].classList.add('active');
            }
            sustainedNotes.add(key); // Add physically held keys to sustain list
        });
        return;
    }
    if (event.code === "ArrowUp") { octaveShift++; octaveShiftDisplay.textContent = octaveShift; return; }
    if (event.code === "ArrowDown") { octaveShift--; octaveShiftDisplay.textContent = octaveShift; return; }

    const key = event.key.toLowerCase();
    physicallyDownKeys.add(key);
    if (baseKeyToFrequency[key]) {
        playNote(key);
    }
});
window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    physicallyDownKeys.delete(key);

    if (event.code === "Space") {
        event.preventDefault();
        sustainPedal = false;
        const notesToProcessForSustainRelease = new Set(sustainedNotes);
        sustainedNotes.clear();

        notesToProcessForSustainRelease.forEach(noteKey => {
            const isStillDirectlyHeld = physicallyDownKeys.has(noteKey) ||
                                       (currentTouchedKeyForDrag === noteKey) ||
                                       (isMouseButton1Down && kbdElements[noteKey]?.matches(':hover'));
            if (!isStillDirectlyHeld) {
                stopNote(noteKey, true); // Force stop audio, visual update will follow
            } else {
                 // Still held by direct input, ensure visual active state
                if (kbdElements[noteKey] && !kbdElements[noteKey].classList.contains('active')) {
                    kbdElements[noteKey].classList.add('active');
                }
            }
        });
        return;
    }

    if (baseKeyToFrequency[key]) {
        stopNote(key); // This will handle audio stop and subsequent visual check
    }
});

// --- UI Controls Listeners ---
volumeSlider.addEventListener('input', () => { globalVolume = parseFloat(volumeSlider.value); });
waveformSelect.addEventListener('change', () => {
    currentWaveform = waveformSelect.value;
    if (audioContext && audioContext.state === 'running') {
        for (const keyPool in oscillatorPools) {
            if (oscillatorPools.hasOwnProperty(keyPool)) {
                oscillatorPools[keyPool].forEach(sound => { sound.oscillator.type = currentWaveform; });
            }
        }
    }
});

// --- Virtual Keyboard event listeners ---
document.querySelectorAll('kbd').forEach(kbd => {
    const key = kbd.textContent.toLowerCase();

    kbd.addEventListener('mousedown', (event) => { event.preventDefault(); playNote(key); });
    kbd.addEventListener('mouseup', (event) => { event.preventDefault(); stopNote(key); });
    kbd.addEventListener('mouseover', (event) => { if (isMouseButton1Down) playNote(key); });
    kbd.addEventListener('mouseout', (event) => { if (isMouseButton1Down && kbd.classList.contains('active')) stopNote(key); });
    kbd.addEventListener('touchstart', (event) => { event.preventDefault(); initializeAudio(); playNote(key); currentTouchedKeyForDrag = key; }, { passive: false });
    kbd.addEventListener('touchend', (event) => {
        event.preventDefault();
        stopNote(key);
        if (currentTouchedKeyForDrag === key) currentTouchedKeyForDrag = null;
    });
});

// --- Document-level touch listeners for dragging ---
document.addEventListener('touchmove', (event) => {
    if (event.touches.length > 0) {
        const touch = event.touches[0];
        const elementUnderTouch = document.elementFromPoint(touch.clientX, touch.clientY);
        let newKeyOver = null;
        if (elementUnderTouch && elementUnderTouch.tagName === 'KBD') {
            newKeyOver = elementUnderTouch.textContent.toLowerCase();
            event.preventDefault();
        }
        if (newKeyOver !== currentTouchedKeyForDrag) {
            if (currentTouchedKeyForDrag) stopNote(currentTouchedKeyForDrag);
            if (newKeyOver) playNote(newKeyOver);
            currentTouchedKeyForDrag = newKeyOver;
        }
    }
}, { passive: false });
document.addEventListener('touchend', (event) => {
    if (currentTouchedKeyForDrag && event.touches.length === 0) {
       stopNote(currentTouchedKeyForDrag);
       currentTouchedKeyForDrag = null;
    }
});
document.addEventListener('touchcancel', (event) => {
    if (currentTouchedKeyForDrag) stopNote(currentTouchedKeyForDrag, true);
    currentTouchedKeyForDrag = null;
});

// --- Initial Page Setup ---
window.addEventListener('load', () => {
    volumeSlider.value = String(globalVolume);
    if (!(window.AudioContext || window.webkitAudioContext)) {
        updateAudioStatus("Browser doesn't support Web Audio API.", "error");
    } else {
        initializeAudio().catch(err => {/* error handled in initializeAudio */});
    }
    updateAudioStatus();
});
statusDiv.addEventListener('click', () => {
    if (audioContext && audioContext.state === 'suspended') initializeAudio();
});
