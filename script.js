// --- Audio Setup ---
let audioContext;
const fadeoutTime = 0.5; // Fadeout time in seconds (adjust as needed)

// Function to initialize the Audio Context (must be called on user interaction)
function initAudio() {
    if (!audioContext) {
        try {
            // Standard way
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log("AudioContext created successfully.");
            // Hide warning if audio is enabled
            const warning = document.getElementById('audio-warning');
            if (warning) warning.style.display = 'none';
        } catch (e) {
            console.error("Web Audio API is not supported in this browser", e);
            alert("Web Audio API is not supported in this browser.");
        }
    }
    // Resume context if it's suspended (often happens on page load)
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
        console.log("AudioContext resumed.");
    }
}

// --- Key to Frequency Mapping ---
const keyToFrequency = {
    'q': 261.63,  // C4
    '2': 277.18,  // C#4/Db4
    'w': 293.66,  // D4
    '3': 311.13,  // D#4/Eb4
    'e': 329.63,  // E4
    'r': 349.23,  // F4
    '5': 369.99,  // F#4/Gb4
    't': 392.00,  // G4
    '6': 415.30,  // G#4/Ab4
    'y': 440.00,  // A4
    '7': 466.16,  // A#4/Bb4
    'u': 493.88,  // B4
    'i': 523.25,  // C5
    '9': 554.37,  // C#5/Db5
    'o': 587.33,  // D5
    '0': 622.25,  // D#5/Eb5
    'p': 659.26,  // E5
    'a': 698.46,  // F5
    'z': 739.99,  // F#5/Gb5
    's': 783.99,  // G5
    'x': 830.61,  // G#5/Ab5
    'd': 880.00,  // A5
    'c': 932.33,  // A#5/Bb5
    'f': 987.77,  // B5
    'g': 1046.50, // C6
    'h': 1108.73, // C#6/Db6
    'j': 1174.66, // D6
    'k': 1244.51, // D#6/Eb6
    'l': 1318.51  // E6
};

// --- Store Playing Sounds ---
// We store { oscillator: OscillatorNode, gainNode: GainNode } for each key
const playingSounds = {};

// --- Sound Generation and Control ---

function playNote(key) {
    if (!audioContext) {
        console.warn("AudioContext not initialized. Cannot play note.");
        const warning = document.getElementById('audio-warning');
        if (warning) warning.style.display = 'block'; // Show warning
        return;
    }
    if (playingSounds[key]) return; // Already playing this key

    const frequency = keyToFrequency[key];
    if (!frequency) return; // Key not mapped

    // Create nodes
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    // Configure nodes
    oscillator.type = 'sine'; // Same as the Python example
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

    // Connect nodes: oscillator -> gain -> destination (speakers)
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Start the oscillator
    oscillator.start(0); // Start immediately

    // Store references for stopping later
    playingSounds[key] = { oscillator, gainNode };

    // Optional: Add visual feedback (e.g., change key style)
    const kbdElement = Array.from(document.querySelectorAll('kbd')).find(kbd => kbd.textContent === key);
    if (kbdElement) {
        kbdElement.style.backgroundColor = '#ccc';
        kbdElement.style.boxShadow = 'inset 1px 1px 1px #999';
    }
}

function stopNote(key) {
    if (!audioContext || !playingSounds[key]) return; // Not playing or context not ready

    const { oscillator, gainNode } = playingSounds[key];
    const now = audioContext.currentTime;

    // Start fade out
    gainNode.gain.setValueAtTime(gainNode.gain.value, now); // Set current value as start point
    gainNode.gain.linearRampToValueAtTime(0.0001, now + fadeoutTime); // Fade to near zero

    // Schedule oscillator stop after fadeout is complete
    oscillator.stop(now + fadeoutTime);

    // Remove from playing sounds *immediately* so keydown can trigger again if needed
    delete playingSounds[key];

    // Optional: Remove visual feedback
    const kbdElement = Array.from(document.querySelectorAll('kbd')).find(kbd => kbd.textContent === key);
    if (kbdElement) {
        kbdElement.style.backgroundColor = '#eee'; // Reset style
        kbdElement.style.boxShadow = '1px 1px 1px #999';
    }
}

// --- Event Listeners ---

// Use 'key' property for modern browsers, convert to lowercase
window.addEventListener('keydown', (event) => {
    // Initialize audio on first key press if needed
    if (!audioContext || audioContext.state === 'suspended') {
        initAudio();
    }
    // Don't play if modifier keys are pressed (except Shift if needed, though unnecessary here)
    // or if it's repeating (event.repeat)
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) {
        return;
    }
    const key = event.key.toLowerCase();
    playNote(key);
});

window.addEventListener('keyup', (event) => {
    if (!audioContext) return;
    const key = event.key.toLowerCase();
    stopNote(key);
});


// Attempt to initialize AudioContext on first user interaction (click or touch)
// This is often required by browsers for audio playback policies.
function setupAudioOnInteraction() {
    initAudio();
    // Remove these listeners once the context is running
    document.body.removeEventListener('click', setupAudioOnInteraction);
    document.body.removeEventListener('touchstart', setupAudioOnInteraction);
    window.removeEventListener('keydown', setupAudioOnInteraction); // Also remove from keydown
}

document.body.addEventListener('click', setupAudioOnInteraction, { once: true });
document.body.addEventListener('touchstart', setupAudioOnInteraction, { once: true });
// Also try to initialize on the very first keydown, just in case click/touch doesn't happen
window.addEventListener('keydown', setupAudioOnInteraction, { once: true });

// Show warning initially if context might not be ready
window.addEventListener('load', () => {
    // Check if context exists and is running after load (unlikely but possible)
     if (!(window.AudioContext || window.webkitAudioContext)) {
         const warning = document.getElementById('audio-warning');
         if(warning) warning.textContent = "Your browser doesn't support the Web Audio API.";
         if(warning) warning.style.display = 'block';
     } else if (!audioContext || audioContext.state !== 'running') {
         const warning = document.getElementById('audio-warning');
         if (warning) warning.style.display = 'block';
     }
});
