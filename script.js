// --- Audio Setup ---
let audioContext;
const fadeoutTime = 0.3; // Slightly shorter fadeout might feel more responsive
const attackTime = 0.005; // Very short attack to prevent clicks, minimal latency impact
const releaseTime = fadeoutTime; // Keep consistent naming

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
                // Request lowest latency ('interactive')
                audioContext = new (window.AudioContext || window.webkitAudioContext)({
                    latencyHint: 'interactive',
                    // sampleRate: 44100 // Optionally match sample rate if needed, usually default is fine
                });
                console.log("AudioContext created.");
                updateAudioStatus(); // Update status immediately after creation
            }

            // Always try to resume, in case it was suspended or closed
            audioContext.resume().then(() => {
                console.log("AudioContext resumed.");
                updateAudioStatus();
                // Remove interaction listeners once running
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
            console.error("Web Audio API is not supported or AudioContext creation failed:", e);
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
         statusDiv.className = 'error'; // Treat no context as an error state visually
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

// --- Key to Frequency Mapping (Unchanged) ---
const keyToFrequency = {
    'q': 261.63, '2': 277.18, 'w': 293.66, '3': 311.13, 'e': 329.63, 'r': 349.23,
    '5': 369.99, 't': 392.00, '6': 415.30, 'y': 440.00, '7': 466.16, 'u': 493.88,
    'i': 523.25, '9': 554.37, 'o': 587.33, '0': 622.25, 'p': 659.26, 'a': 698.46,
    'z': 739.99, 's': 783.99, 'x': 830.61, 'd': 880.00, 'c': 932.33, 'f': 987.77,
    'g': 1046.50, 'h': 1108.73, 'j': 1174.66, 'k': 1244.51, 'l': 1318.51
};

// --- Store Playing Sounds ---
// { oscillator: OscillatorNode, gainNode: GainNode }
const playingSounds = {};

// --- Sound Generation and Control ---

function playNote(key) {
    // 1. Ensure AudioContext is ready
    if (!audioContext || audioContext.state !== 'running') {
        console.warn("AudioContext not running. Note blocked.");
        // Attempt to initialize/resume if suspended - might help if user clicks status
        if (audioContext && audioContext.state === 'suspended') {
            initializeAudio();
        } else if (!audioContext) {
             updateAudioStatus("Click or press a key to enable audio", "suspended");
        }
        return;
    }
    // 2. Prevent re-triggering if already playing (keydown repeat or holding)
    if (playingSounds[key]) return;

    const frequency = keyToFrequency[key];
    if (!frequency) return; // Key not mapped

    const now = audioContext.currentTime;

    // 3. Create nodes (inevitable for polyphony with varying frequencies)
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    // 4. Configure nodes precisely
    oscillator.type = 'sine';
    // Set frequency immediately - setValueAtTime is precise
    oscillator.frequency.setValueAtTime(frequency, now);

    // 5. Envelope: Quick attack to prevent clicks, then hold at full volume
    gainNode.gain.setValueAtTime(0, now); // Start at 0 gain
    gainNode.gain.linearRampToValueAtTime(1, now + attackTime); // Ramp up quickly

    // 6. Connect nodes: oscillator -> gain -> destination
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // 7. Start oscillator slightly in the future IF attackTime > 0, else start now
    // Starting immediately (0) is generally best for lowest latency perception.
    // The attack ramp handles the initial silence.
    oscillator.start(now);

    // 8. Store references
    playingSounds[key] = { oscillator, gainNode };

    // 9. Visual feedback (using cached element)
    if (kbdElements[key]) {
        kbdElements[key].classList.add('active');
    }
}

function stopNote(key) {
    if (!audioContext || !playingSounds[key]) return;

    const { oscillator, gainNode } = playingSounds[key];
    const now = audioContext.currentTime;

    // 1. Envelope: Fade out smoothly
    // Cancel any scheduled gain changes first to avoid conflicts
    gainNode.gain.cancelScheduledValues(now);
    // Start ramp from current value
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    // Ramp down to near zero
    gainNode.gain.linearRampToValueAtTime(0.0001, now + releaseTime);

    // 2. Schedule oscillator stop after the release ramp finishes
    oscillator.stop(now + releaseTime);

    // 3. Remove from playing sounds immediately
    // (Important: do this *before* the oscillator actually stops)
    delete playingSounds[key];

    // 4. Remove visual feedback (using cached element)
     if (kbdElements[key]) {
        kbdElements[key].classList.remove('active');
    }
}

// --- Event Listeners ---

// Handle initial user interaction to unlock audio
function handleInteraction() {
    initializeAudio().catch(err => {
        // Error already logged in initializeAudio
        updateAudioStatus("Failed to initialize audio.", "error");
    });
    // Subsequent key presses will also try to init if needed
}


window.addEventListener('keydown', (event) => {
    // Attempt to initialize audio if it's not running yet
    // This covers cases where the initial click/touch listener wasn't triggered
    if (!audioContext || audioContext.state !== 'running') {
        initializeAudio(); // Try to start it, playNote will check state again
    }

    // Ignore key repeats and modifier keys
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
        return;
    }

    const key = event.key.toLowerCase();
    playNote(key);
});

window.addEventListener('keyup', (event) => {
    // No need to check audioContext state here, stopNote handles it
    const key = event.key.toLowerCase();
    stopNote(key);
});


// --- Initial Setup ---

// Set initial status message on load
window.addEventListener('load', () => {
     if (!(window.AudioContext || window.webkitAudioContext)) {
         updateAudioStatus("Browser doesn't support Web Audio API.", "error");
     } else {
         // Create context suspended initially if possible, or show prompt
         try {
              // Try creating context immediately but expect it to be suspended
              if (!audioContext) {
                  audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
                   // Check state *after* creation attempt
                   if (audioContext.state === 'suspended') {
                       updateAudioStatus("Click or press a key to enable audio", "suspended");
                       // Add listeners ONLY if suspended
                       document.body.addEventListener('click', handleInteraction, { once: true });
                       document.body.addEventListener('touchstart', handleInteraction, { once: true });
                       window.addEventListener('keydown', handleInteraction, { once: true }); // Also listen for first keydown
                   } else if (audioContext.state === 'running') {
                       updateAudioStatus("Audio Ready", "ready"); // Should be rare on load
                   } else {
                        updateAudioStatus("Audio context state: " + audioContext.state, "error");
                   }
              } else {
                   // If context already exists (e.g., from previous interaction attempts)
                   updateAudioStatus();
              }
         } catch (e) {
              console.error("Error creating initial AudioContext:", e);
              updateAudioStatus("Failed to initialize audio.", "error");
         }
     }
});

// Make the status div clickable to attempt resume if suspended
statusDiv.addEventListener('click', () => {
    if (audioContext && audioContext.state === 'suspended') {
        initializeAudio();
    }
});
