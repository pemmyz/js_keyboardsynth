document.addEventListener('DOMContentLoaded', () => {
    // --- Dark Mode ---
    const darkModeToggleBtn = document.getElementById('dark-mode-toggle');
    const body = document.body;

    function setDarkMode(enabled) {
        if (enabled) {
            body.classList.remove('light-mode');
            darkModeToggleBtn.textContent = '☀️ Light Mode';
        } else {
            body.classList.add('light-mode');
            darkModeToggleBtn.textContent = '🌙 Dark Mode';
        }
        localStorage.setItem('darkMode', enabled ? 'enabled' : 'disabled');
    }

    darkModeToggleBtn.addEventListener('click', () => {
        const isLight = body.classList.contains('light-mode');
        setDarkMode(isLight);
        darkModeToggleBtn.blur();
    });

    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode === 'enabled') {
        setDarkMode(true);
    } else if (savedDarkMode === 'disabled') {
        setDarkMode(false);
    } else {
        setDarkMode(true); // Default to dark mode
    }

    // --- Audio Setup & State ---
    let audioContext;
    let audioInitializationPromise = null; // FIX: For robust, race-free initialization
    const fadeoutTime = 0.2;
    const attackTime = 0.01;
    const releaseTime = fadeoutTime;
    const NOTE_BASE_GAIN = 0.5;

    const statusDiv = document.getElementById('audio-status');
    const waveformSelect = document.getElementById('waveform-select');
    const volumeSlider = document.getElementById('volume-slider');
    const octaveShiftDisplay = document.getElementById('octave-shift-display');
    const noteDisplay = document.getElementById('note-display');

    const unisonVoicesSlider = document.getElementById('unison-voices-slider');
    const unisonVoicesDisplay = document.getElementById('unison-voices-display');
    const unisonDetuneSlider = document.getElementById('unison-detune-slider');
    const unisonDetuneDisplay = document.getElementById('unison-detune-display');

    let currentWaveform = waveformSelect.value;
    let octaveShift = 0;
    let programmaticWaveformChange = false;

    let unisonVoices = 1;
    let detuneAmount = 0;

    // --- Effects State & Nodes ---
    let effectsChainInput, masterOutputGain, fxBypassGain;
    let reverbNode, reverbMixNode;
    let delayNode, delayFeedbackNode, delayMixNode;
    let distortionNode;
    let modLfo, modLfoGain, modDelay, modFeedbackGain, modMixNode, modDryGain;
    let stereoSpreadAmount = 0;
    let isFxBypassed = true; // FIX: Set FX to be OFF by default
    let fxBypassToggleBtn;

    // --- Metronome State ---
    let isMetronomeOn = false;
    let bpm = 120;
    let metronomeVolume = 0.7;
    let schedulerIntervalId = null;
    let nextNoteTime = 0.0;
    
    // --- Core Synth State ---
    let activeNoteSounds = new Map(); // Robust state tracking for currently playing notes

    const DEFAULT_WAVEFORM_ON_PARSE = 'square';
    const JSON_EXPORT_COMMENT_HEADER = `// This is Super Deluxe Synth sequencer file,
// live @ https://pemmyz.github.io/js_keyboardsynth/
// Repo @ https://github.com/pemmyz/js_keyboardsynth\n`;
    const JSON_EXPORT_COMMENT_FOOTER = `\n// This is Super Deluxe Synth sequencer file,
// live @ https://pemmyz.github.io/js_keyboardsynth/
// Repo @ https://github.com/pemmyz/js_keyboardsynth`;


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
    const poolSizePerKey = 6;
    let sustainPedal = false;
    let sustainedNotes = new Set();
    let physicallyDownKeys = new Set();

    const kbdElements = {};
    document.querySelectorAll('kbd').forEach(kbd => {
        kbdElements[kbd.textContent.toLowerCase()] = kbd;
    });

    let isRecording = false;
    let recordingStartTime = 0;
    let recordedSequence = [];
    let activeRecordingNotes = {};
    let isPlayingBack = false;
    let playbackTimeouts = [];
    let activePlaybackNoteSounds = new Map();

    // UI Elements for Sequencer Panel
    const sidePanel = document.getElementById('side-panel');
    const togglePanelBtn = document.getElementById('toggle-panel-btn');
    const recordBtn = document.getElementById('record-btn');
    const playBtn = document.getElementById('play-btn');
    const stopPlaybackBtn = document.getElementById('stop-playback-btn');
    const sequenceDisplay = document.getElementById('note-sequence-display');
    const copySequenceBtn = document.getElementById('copy-sequence-btn');
    const pasteSequenceBtn = document.getElementById('paste-sequence-btn');
    const exportBtn = document.getElementById('export-btn');
    const importFileInput = document.getElementById('import-file-input');
    const importLabel = document.querySelector('label[for="import-file-input"]');
    const clearSequenceBtn = document.getElementById('clear-sequence-btn');
    let sequenceDisplayLineInfo = [];

    // UI Elements for Effects Panel
    const effectsPanel = document.getElementById('effects-panel');
    const toggleEffectsPanelBtn = document.getElementById('toggle-effects-panel-btn');

    // Metronome UI Elements
    const metronomeToggle = document.getElementById('metronome-toggle');
    const bpmSlider = document.getElementById('bpm-slider');
    const bpmDisplay = document.getElementById('bpm-display');
    const metronomeVolumeSlider = document.getElementById('metronome-volume-slider');

    const FM_MODULATOR_RATIO = 1.4;
    const FM_MODULATION_INDEX_SCALE = 2.0;
    const AM_MODULATOR_FREQ = 7;
    const AM_MODULATION_DEPTH = 0.7;
    const RING_MOD_RATIO = 0.78;
    const PWM_REAL_COEFFS = new Float32Array([0, 0.8, 0.8, 0.4, 0, -0.4, -0.8, -0.8]);
    const PWM_IMAG_COEFFS = new Float32Array(PWM_REAL_COEFFS.length).fill(0);
    let pwmPeriodicWave = null;


    // --- Panel Management ---
    const panelsConfig = [
        {
            button: togglePanelBtn,
            panel: sidePanel,
            name: 'Seq',
            iconOpen: '➡️ Close',
            iconClosed: '🎹 Seq'
        },
        {
            button: toggleEffectsPanelBtn,
            panel: effectsPanel,
            name: 'FX',
            iconOpen: '➡️ Close FX',
            iconClosed: '🎛️ FX'
        }
    ];

    function openPanel(panelToOpen) {
        if (!panelToOpen) return;
        panelsConfig.forEach(p => {
            if (p.panel === panelToOpen) {
                p.panel.classList.add('visible');
                if (p.button) p.button.textContent = p.iconOpen;
            } else {
                p.panel.classList.remove('visible');
                if (p.button) p.button.textContent = p.iconClosed;
            }
        });
        body.classList.add('panel-open-main-adjust');
    }

    function closeAllPanels() {
        panelsConfig.forEach(p => {
            if (p.panel) p.panel.classList.remove('visible');
            if (p.button) p.button.textContent = p.iconClosed;
        });
        body.classList.remove('panel-open-main-adjust');
    }

    panelsConfig.forEach(item => {
        if (item.button && item.panel) {
            item.button.addEventListener('click', () => {
                const isCurrentlyVisible = item.panel.classList.contains('visible');
                if (isCurrentlyVisible) {
                    closeAllPanels();
                } else {
                    openPanel(item.panel);
                }
                item.button.blur();
            });
        }
    });

    // --- Effects Implementation ---
    function updateFxBypassState() {
        if (!audioContext || !effectsChainInput || !masterOutputGain || !fxBypassGain) return;

        if (isFxBypassed) {
            // Route signal directly to master, bypassing effects.
            effectsChainInput.connect(masterOutputGain);
            fxBypassGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.01);
            if(fxBypassToggleBtn) fxBypassToggleBtn.textContent = '🔊 FX Off';
        } else {
            // Route signal through the effects chain.
            effectsChainInput.disconnect(masterOutputGain);
            fxBypassGain.gain.setTargetAtTime(1, audioContext.currentTime, 0.01);
             if(fxBypassToggleBtn) fxBypassToggleBtn.textContent = '🔊 FX On';
        }
    }

    function makeDistortionCurve(amount, type = 'distortion') {
        const k = typeof amount === 'number' ? amount : 50;
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        let x;
        for (let i = 0; i < n_samples; ++i) {
            x = i * 2 / n_samples - 1;
            if (k === 0) {
                curve[i] = x;
                continue;
            }
            switch (type) {
                case 'overdrive':
                    curve[i] = (1 + k/100) * x - (k/100) * Math.pow(x, 3);
                    break;
                case 'fuzz':
                     const y = x * (k / 10 + 1.2);
                     curve[i] = Math.max(-1, Math.min(1, y)) * (1 - (1 / (1 + Math.abs(y)*5)));
                     break;
                case 'bitcrush':
                    const steps = Math.pow(2, 8 - Math.floor(k / 100 * 6));
                    curve[i] = Math.round(x * steps) / steps;
                    break;
                case 'distortion':
                default:
                    curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
                    break;
            }
        }
        return curve;
    }

    function generateReverbIR() {
        return new Promise((resolve) => {
            if (!audioContext) { resolve(null); return; }
            const sampleRate = audioContext.sampleRate;
            const length = sampleRate * 2;
            const impulse = audioContext.createBuffer(2, length, sampleRate);
            for (let channel = 0; channel < 2; channel++) {
                const channelData = impulse.getChannelData(channel);
                for (let i = 0; i < length; i++) {
                    const decay = Math.pow(1 - i / length, 2.5);
                    channelData[i] = (Math.random() * 2 - 1) * decay;
                }
            }
            resolve(impulse);
        });
    }

    function initializeEffectSettings() {
        const reverbMix = document.getElementById('reverb-mix');
        const delayTime = document.getElementById('delay-time');
        const delayFeedback = document.getElementById('delay-feedback');
        const delayMix = document.getElementById('delay-mix');
        const distortionAmount = document.getElementById('distortion-amount');
        const distortionType = document.getElementById('distortion-type');
        const modEffectType = document.getElementById('mod-effect-type');
        const modEffectRate = document.getElementById('mod-effect-rate');
        const modEffectDepth = document.getElementById('mod-effect-depth');
        const stereoSpreadAmountSlider = document.getElementById('stereo-spread-amount');

        if (masterOutputGain) masterOutputGain.gain.value = parseFloat(volumeSlider.value);
        if (reverbMixNode) reverbMixNode.gain.value = parseFloat(reverbMix.value);
        if (delayNode) delayNode.delayTime.value = parseFloat(delayTime.value);
        if (delayFeedbackNode) delayFeedbackNode.gain.value = parseFloat(delayFeedback.value);
        if (delayMixNode) delayMixNode.gain.value = parseFloat(delayMix.value);
        if (distortionNode) {
            distortionNode.curve = makeDistortionCurve(parseFloat(distortionAmount.value), distortionType.value);
            distortionNode.oversample = '4x';
        }
        const rate = parseFloat(modEffectRate.value);
        const depth = parseFloat(modEffectDepth.value);
        const type = modEffectType.value;
        if (modLfo) modLfo.frequency.value = rate;
        if (type === 'chorus') {
            if (modFeedbackGain) modFeedbackGain.gain.value = 0.3;
            if (modDelay) modDelay.delayTime.value = 0.025;
            if (modLfoGain) modLfoGain.gain.value = depth * 0.005;
        } else if (type === 'flanger') {
            if (modFeedbackGain) modFeedbackGain.gain.value = 0.85;
            if (modDelay) modDelay.delayTime.value = 0.005;
            if (modLfoGain) modLfoGain.gain.value = depth * 0.003;
        }
        if(modMixNode) modMixNode.gain.value = 0.5; 
        if(modDryGain) modDryGain.gain.value = 0.5;
        stereoSpreadAmount = parseFloat(stereoSpreadAmountSlider.value);
    }

    function setupEffectsChain() {
        if (!audioContext) return;
        effectsChainInput = audioContext.createGain();
        masterOutputGain = audioContext.createGain();
        fxBypassGain = audioContext.createGain();

        masterOutputGain.connect(audioContext.destination);
        let currentNode = fxBypassGain; // Start chain from the bypass gate

        // 1. Distortion
        distortionNode = audioContext.createWaveShaper();
        currentNode.connect(distortionNode);
        currentNode = distortionNode;

        // 2. Modulation (Chorus/Flanger)
        modDryGain = audioContext.createGain();
        currentNode.connect(modDryGain);
        modDelay = audioContext.createDelay(1);
        modLfo = audioContext.createOscillator();
        modLfoGain = audioContext.createGain();
        modFeedbackGain = audioContext.createGain();
        modMixNode = audioContext.createGain();
        modLfo.connect(modLfoGain);
        modLfoGain.connect(modDelay.delayTime);
        modLfo.start();
        currentNode.connect(modDelay);
        modDelay.connect(modFeedbackGain);
        modFeedbackGain.connect(modDelay);
        modDelay.connect(modMixNode);
        const modOutput = audioContext.createGain();
        modDryGain.connect(modOutput);
        modMixNode.connect(modOutput);
        currentNode = modOutput;

        // 3. Delay
        const delayDryGain = audioContext.createGain();
        currentNode.connect(delayDryGain);
        delayNode = audioContext.createDelay(2.0);
        delayFeedbackNode = audioContext.createGain();
        delayMixNode = audioContext.createGain();
        currentNode.connect(delayNode);
        delayNode.connect(delayFeedbackNode);
        delayFeedbackNode.connect(delayNode);
        delayNode.connect(delayMixNode);
        const delayOutput = audioContext.createGain();
        delayDryGain.connect(delayOutput);
        delayMixNode.connect(delayOutput);
        delayDryGain.gain.value = 1.0;
        currentNode = delayOutput;

        // 4. Reverb
        const reverbDryGain = audioContext.createGain();
        currentNode.connect(reverbDryGain);
        reverbNode = audioContext.createConvolver();
        reverbMixNode = audioContext.createGain();
        generateReverbIR().then(irBuffer => { if (reverbNode) reverbNode.buffer = irBuffer; });
        currentNode.connect(reverbNode);
        reverbNode.connect(reverbMixNode);
        const reverbOutput = audioContext.createGain();
        reverbDryGain.connect(reverbOutput);
        reverbMixNode.connect(reverbOutput);
        reverbDryGain.gain.value = 1.0;
        currentNode = reverbOutput;

        // Final connections for bypass routing
        effectsChainInput.connect(fxBypassGain);
        currentNode.connect(masterOutputGain); // Connect wet signal to master
        
        initializeEffectSettings();
        updateFxBypassState(); // Set initial bypass state
    }


    function sanitizeIncomingNote(noteData) {
        return {
            key: noteData.key,
            startTime: parseFloat(noteData.startTime),
            duration: parseFloat(noteData.duration),
            waveform: noteData.waveform,
            volume: noteData.volume !== undefined ? parseFloat(noteData.volume) : NOTE_BASE_GAIN,
            octaveShift: noteData.octaveShift !== undefined ? parseInt(noteData.octaveShift) : 0,
        };
    }

    function getShiftedFrequency(baseFrequency, currentOctaveShiftValue = octaveShift) {
        return baseFrequency * Math.pow(2, currentOctaveShiftValue);
    }

    function getNoteNameWithOctave(key, currentOctaveShiftValue) {
        if (!keyToNoteName[key]) return 'Unknown';
        const baseNoteName = keyToNoteName[key];
        const notePart = baseNoteName.slice(0, -1);
        const baseOctaveNum = parseInt(baseNoteName.slice(-1));
        const newOctave = baseOctaveNum + currentOctaveShiftValue;
        return notePart + newOctave;
    }

    // FIX: This function is now fully robust against race conditions.
    function initializeAudio() {
        if (audioContext && audioContext.state === 'running') {
            return Promise.resolve();
        }

        // If initialization is already in progress, return the existing promise
        if (audioInitializationPromise) {
            return audioInitializationPromise;
        }

        // Start a new initialization process
        audioInitializationPromise = new Promise((resolve, reject) => {
            try {
                if (!audioContext) {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)({
                        latencyHint: 'interactive',
                        sampleRate: 44100
                    });
                }

                // This must be called from a user gesture (click, keydown, etc.)
                audioContext.resume().then(() => {
                    if (audioContext.state === 'running') {
                        // Setup nodes only on the very first successful resume
                        if (!effectsChainInput) setupEffectsChain();
                        if (Object.keys(oscillatorPools).length === 0) preCreateOscillatorPools();
                        if (!pwmPeriodicWave) {
                            pwmPeriodicWave = audioContext.createPeriodicWave(PWM_REAL_COEFFS, PWM_IMAG_COEFFS, { disableNormalization: false });
                        }
                        updateAudioStatus();
                        resolve();
                    } else {
                        reject(new Error("Audio context did not resume to 'running' state."));
                    }
                }).catch(err => {
                    updateAudioStatus("Error resuming audio.", "error");
                    console.error("Audio resume failed:", err);
                    reject(err);
                });

            } catch (err) {
                updateAudioStatus("Web Audio API not supported.", "error");
                console.error("AudioContext creation failed:", err);
                reject(err);
            }
        }).finally(() => {
            // Clear the promise so that if it failed, a new attempt can be made.
            audioInitializationPromise = null;
        });

        return audioInitializationPromise;
    }


    function updateAudioStatus(message = '', type = '') {
        if (!statusDiv) return;
        const currentStatus = audioContext ? audioContext.state : 'uninitialized';
        statusDiv.className = '';
        if (type === 'error') {
            statusDiv.textContent = message || "Error initializing audio."; statusDiv.classList.add('error');
        } else if (currentStatus === 'running') {
            statusDiv.textContent = message || "Audio Ready"; statusDiv.classList.add('ready');
        } else if (currentStatus === 'suspended') {
            statusDiv.textContent = message || "Click or press a key to enable audio"; statusDiv.classList.add('suspended');
        } else if (currentStatus === 'closed') {
            statusDiv.textContent = message || "Audio context closed."; statusDiv.classList.add('error');
        } else {
            statusDiv.textContent = message || "Audio initializing...";
        }
    }

    function preCreateOscillatorPools() {
        if (!audioContext || audioContext.state !== 'running' || !effectsChainInput) return;
        for (const key in baseKeyToFrequency) {
            oscillatorPools[key] = [];
            for (let i = 0; i < poolSizePerKey; i++) {
                const carrierOsc = audioContext.createOscillator();
                const modulatorOsc1 = audioContext.createOscillator();
                const mainGain = audioContext.createGain();
                const modGain1 = audioContext.createGain();
                const pannerNode = audioContext.createStereoPanner();
                
                mainGain.connect(pannerNode);
                pannerNode.connect(effectsChainInput);
                
                mainGain.gain.setValueAtTime(0, audioContext.currentTime);
                carrierOsc.start();
                modulatorOsc1.start();
                oscillatorPools[key].push({
                    carrierOsc, modulatorOsc1, mainGain, modGain1, pannerNode,
                    busy: false, key, busyTimeoutId: null, isPlayback: false,
                    _currentWaveformType: null, _activeNodeConnections: [], _auxNodes: []
                });
            }
        }
    }

    function getFreeOscillator(key) {
        if (!oscillatorPools[key]) {
            if (audioContext && audioContext.state === 'running') preCreateOscillatorPools();
            if (!oscillatorPools[key]) return null;
        }
        
        let sound = oscillatorPools[key].find(s => !s.busy);
        if (sound) {
            return sound;
        }

        console.warn(`No free oscillator for key ${key}, stealing a voice.`);
        sound = oscillatorPools[key][0];
        forceResetSound(sound);
        return sound;
    }

    function forceResetSound(sound) {
        if (!sound || !audioContext) return;
        const now = audioContext.currentTime;
        if (sound.busyTimeoutId) { clearTimeout(sound.busyTimeoutId); sound.busyTimeoutId = null; }
        if (sound.mainGain && sound.mainGain.gain) {
            try {
                sound.mainGain.gain.cancelScheduledValues(now);
                sound.mainGain.gain.setValueAtTime(sound.mainGain.gain.value, now);
                sound.mainGain.gain.linearRampToValueAtTime(0, now + 0.001);
            } catch (e) { try { sound.mainGain.gain.value = 0; } catch (e2) { /* ignore */ } }
        }
        sound._activeNodeConnections.forEach(conn => {
            try {
                if (conn.param) conn.source.disconnect(conn.destination[conn.param]);
                else if (conn.destination) conn.source.disconnect(conn.destination);
                else conn.source.disconnect();
            } catch (e) {}
        });
        sound._activeNodeConnections = [];
        sound._auxNodes.forEach(node => { try { node.stop(); node.disconnect(); } catch(e) {} });
        sound._auxNodes = [];
        sound.carrierOsc.type = 'sine';
        sound.modulatorOsc1.type = 'sine';
        sound.modulatorOsc1.frequency.cancelScheduledValues(now);
        sound.modulatorOsc1.frequency.setValueAtTime(1, now);
        sound.modGain1.gain.cancelScheduledValues(now);
        sound.modGain1.gain.setValueAtTime(0, now);
        sound.busy = false; sound.isPlayback = false; sound._currentWaveformType = null;
    }

    function playNote(key, forPlayback = false, playbackNoteData = null) {
        if (!audioContext || audioContext.state !== 'running') {
            initializeAudio().then(() => {
                if (audioContext.state === 'running') playNote(key, forPlayback, playbackNoteData);
            }).catch(err => {
                // If initialization fails, we can't play the note.
                console.error("Cannot play note, audio context not ready.", err);
            });
            return null;
        }
        if (!baseKeyToFrequency[key]) return null;

        // Robust Note Handling: Stop any existing note for this key before starting a new one.
        if (activeNoteSounds.has(key)) {
            stopNote(key, true); // Force stop to override sustain
        }
        
        const now = audioContext.currentTime;
        let actualWaveformToUse, noteDataOctaveShiftValue, noteDataVolumeValue;

        const currentUnisonVoices = unisonVoices;
        const currentDetuneAmount = detuneAmount;

        if (forPlayback && playbackNoteData) {
            noteDataOctaveShiftValue = playbackNoteData.octaveShift;
            noteDataVolumeValue = playbackNoteData.volume;
            actualWaveformToUse = playbackNoteData.waveform || currentWaveform;
        } else {
            noteDataOctaveShiftValue = octaveShift;
            noteDataVolumeValue = NOTE_BASE_GAIN;
            actualWaveformToUse = currentWaveform;
        }

        const baseFreq = baseKeyToFrequency[key];
        const rootFrequency = getShiftedFrequency(baseFreq, noteDataOctaveShiftValue);
        
        let soundObjectsStarted = [];

        for (let i = 0; i < currentUnisonVoices; i++) {
            const voiceSound = getFreeOscillator(key);
             if (!voiceSound) {
                console.warn(`No free oscillator for unison voice ${i + 1} of key ${key}`);
                continue;
            }
            forceResetSound(voiceSound);
            voiceSound.busy = true;
            voiceSound.isPlayback = forPlayback;
            voiceSound.key = key;
            voiceSound._currentWaveformType = actualWaveformToUse;

            let detuneCentsForThisVoice = 0;
            let panForThisVoice = 0;
            if (currentUnisonVoices > 1) {
                const offsetRatio = (currentUnisonVoices === 1) ? 0 : (i - (currentUnisonVoices - 1) / 2) / ((currentUnisonVoices - 1) / 2);
                detuneCentsForThisVoice = currentDetuneAmount * offsetRatio;
                panForThisVoice = stereoSpreadAmount * offsetRatio;
            }

            voiceSound.pannerNode.pan.setValueAtTime(panForThisVoice, now);
            const finalFrequency = rootFrequency * Math.pow(2, detuneCentsForThisVoice / 1200);
            voiceSound.carrierOsc.frequency.setValueAtTime(finalFrequency, now);

            switch (actualWaveformToUse) {
                case 'sine': case 'square': case 'sawtooth': case 'triangle':
                    voiceSound.carrierOsc.type = actualWaveformToUse;
                    voiceSound.carrierOsc.connect(voiceSound.mainGain);
                    voiceSound._activeNodeConnections.push({ source: voiceSound.carrierOsc, destination: voiceSound.mainGain });
                    break;
                case 'pwm':
                    if (pwmPeriodicWave) voiceSound.carrierOsc.setPeriodicWave(pwmPeriodicWave);
                    else voiceSound.carrierOsc.type = 'square';
                    voiceSound.carrierOsc.connect(voiceSound.mainGain);
                    voiceSound._activeNodeConnections.push({ source: voiceSound.carrierOsc, destination: voiceSound.mainGain });
                    break;
                case 'fm':
                    voiceSound.carrierOsc.type = 'sine'; voiceSound.modulatorOsc1.type = 'sine';
                    const modulatorFreqFM = finalFrequency * FM_MODULATOR_RATIO;
                    const modIndexFM = finalFrequency * FM_MODULATION_INDEX_SCALE;
                    voiceSound.modulatorOsc1.frequency.setValueAtTime(modulatorFreqFM, now);
                    voiceSound.modGain1.gain.setValueAtTime(modIndexFM, now);
                    voiceSound.modulatorOsc1.connect(voiceSound.modGain1);
                    voiceSound._activeNodeConnections.push({ source: voiceSound.modulatorOsc1, destination: voiceSound.modGain1 });
                    voiceSound.modGain1.connect(voiceSound.carrierOsc.frequency);
                    voiceSound._activeNodeConnections.push({ source: voiceSound.modGain1, destination: voiceSound.carrierOsc, param: 'frequency' });
                    voiceSound.carrierOsc.connect(voiceSound.mainGain);
                    voiceSound._activeNodeConnections.push({ source: voiceSound.carrierOsc, destination: voiceSound.mainGain });
                    break;
                case 'am':
                    voiceSound.carrierOsc.type = 'sine'; voiceSound.modulatorOsc1.type = 'sine';
                    voiceSound.modulatorOsc1.frequency.setValueAtTime(AM_MODULATOR_FREQ, now);
                    const baseGainAM = 1.0 - (AM_MODULATION_DEPTH / 2);
                    const modScaleAM = AM_MODULATION_DEPTH / 2;
                    const dcOffsetNodeAM = audioContext.createConstantSource();
                    dcOffsetNodeAM.offset.value = baseGainAM; dcOffsetNodeAM.start(now); voiceSound._auxNodes.push(dcOffsetNodeAM);
                    const modulatorScaleGainAM = audioContext.createGain();
                    modulatorScaleGainAM.gain.value = modScaleAM; voiceSound._auxNodes.push(modulatorScaleGainAM);
                    voiceSound.modulatorOsc1.connect(modulatorScaleGainAM);
                    dcOffsetNodeAM.connect(voiceSound.modGain1.gain);
                    voiceSound._activeNodeConnections.push({ source: dcOffsetNodeAM, destination: voiceSound.modGain1, param: 'gain' });
                    modulatorScaleGainAM.connect(voiceSound.modGain1.gain);
                    voiceSound._activeNodeConnections.push({ source: modulatorScaleGainAM, destination: voiceSound.modGain1, param: 'gain' });
                    voiceSound.carrierOsc.connect(voiceSound.modGain1);
                    voiceSound._activeNodeConnections.push({ source: voiceSound.carrierOsc, destination: voiceSound.modGain1 });
                    voiceSound.modGain1.connect(voiceSound.mainGain);
                    voiceSound._activeNodeConnections.push({ source: voiceSound.modGain1, destination: voiceSound.mainGain });
                    break;
                case 'ring':
                    voiceSound.carrierOsc.type = 'sine'; voiceSound.modulatorOsc1.type = 'sine';
                    voiceSound.modulatorOsc1.frequency.setValueAtTime(finalFrequency * RING_MOD_RATIO, now);
                    voiceSound.modulatorOsc1.connect(voiceSound.modGain1.gain);
                    voiceSound._activeNodeConnections.push({ source: voiceSound.modulatorOsc1, destination: voiceSound.modGain1, param: 'gain' });
                    voiceSound.carrierOsc.connect(voiceSound.modGain1);
                    voiceSound._activeNodeConnections.push({ source: voiceSound.carrierOsc, destination: voiceSound.modGain1 });
                    voiceSound.modGain1.connect(voiceSound.mainGain);
                    voiceSound._activeNodeConnections.push({ source: voiceSound.modGain1, destination: voiceSound.mainGain });
                    break;
                default:
                    voiceSound.carrierOsc.type = 'sine';
                    voiceSound.carrierOsc.connect(voiceSound.mainGain);
                    voiceSound._activeNodeConnections.push({ source: voiceSound.carrierOsc, destination: voiceSound.mainGain });
                    break;
            }
            const gainPerVoice = currentUnisonVoices > 0 ? noteDataVolumeValue / Math.sqrt(currentUnisonVoices) : 0;
            voiceSound.mainGain.gain.cancelScheduledValues(now);
            voiceSound.mainGain.gain.setValueAtTime(0, now);
            voiceSound.mainGain.gain.linearRampToValueAtTime(gainPerVoice, now + attackTime);
            soundObjectsStarted.push(voiceSound);
        }

        if (soundObjectsStarted.length === 0) return null;
        
        // Add the new sounds to our state map
        activeNoteSounds.set(key, soundObjectsStarted);

        if (kbdElements[key]) kbdElements[key].classList.add('active');
        
        if (!forPlayback) {
            noteDisplay.textContent = getNoteNameWithOctave(key, noteDataOctaveShiftValue);
        }
        if (!forPlayback && isRecording && !activeRecordingNotes[key]) {
            activeRecordingNotes[key] = {
                key: key, octaveShift: noteDataOctaveShiftValue, waveform: actualWaveformToUse,
                volume: noteDataVolumeValue, startTimeAbsolute: audioContext.currentTime
            };
        }
        return soundObjectsStarted;
    }

    function stopNote(key, forceStop = false, forPlayback = false, soundToStop = null, playbackRelTime = null) {
        if (sustainPedal && !forceStop && !forPlayback) {
            sustainedNotes.add(key);
            if (kbdElements[key] && !kbdElements[key].classList.contains('active')) kbdElements[key].classList.add('active');
            return;
        }

        let soundsToProcess = [];
        if(soundToStop) {
            soundsToProcess = Array.isArray(soundToStop) ? soundToStop : [soundToStop];
        } else if (activeNoteSounds.has(key)) {
            soundsToProcess = activeNoteSounds.get(key);
            activeNoteSounds.delete(key);
        } else {
            return; // Nothing to stop for this key
        }

        if (!forPlayback && isRecording && activeRecordingNotes[key]) {
            const noteData = activeRecordingNotes[key];
            const startTimeOffset = noteData.startTimeAbsolute - recordingStartTime;
            const duration = audioContext.currentTime - noteData.startTimeAbsolute;
            if (duration > 0.02) {
                recordedSequence.push({
                    key: noteData.key, octaveShift: noteData.octaveShift, waveform: noteData.waveform,
                    volume: noteData.volume, startTime: startTimeOffset, duration: duration
                });
                updateSequenceDisplay(); updateSequencerControls();
            }
            delete activeRecordingNotes[key];
        }

        if (!audioContext) return;
        const currentRelTime = forPlayback ? (playbackRelTime !== null ? playbackRelTime : releaseTime) : releaseTime;
        
        soundsToProcess.forEach(sound => {
            if (!sound) return;
            const now = audioContext.currentTime;
            
            // Mark as not busy immediately for the pool, but continue fade out
            sound.busy = false;

            if (sound.mainGain && sound.mainGain.gain && typeof sound.mainGain.gain.cancelScheduledValues === 'function') {
                sound.mainGain.gain.cancelScheduledValues(now);
                sound.mainGain.gain.setValueAtTime(sound.mainGain.gain.value, now);
                sound.mainGain.gain.linearRampToValueAtTime(0.0001, now + currentRelTime);
            } else {
                forceResetSound(sound);
            }
            if (sound.busyTimeoutId) clearTimeout(sound.busyTimeoutId);
            sound.busyTimeoutId = setTimeout(() => {
                if (sound.busyTimeoutId === null) return;
                forceResetSound(sound); // Full cleanup after fade
                checkAndDeactivateVisual(sound.key || key);
            }, (currentRelTime * 1000) + 100);
        });

        if (forceStop && !forPlayback) sustainedNotes.delete(key);
        
        // Visuals are tricky. Let's check after a short delay to let audio settle.
        setTimeout(() => checkAndDeactivateVisual(key), 50);
    }


    function checkAndDeactivateVisual(key) {
        if (!kbdElements[key]) return;

        const isLogicallyOn = activeNoteSounds.has(key);
        const isDirectlyHeld = physicallyDownKeys.has(key) || (currentTouchedKeyForDrag === key);
        const isSustainedByPedal = sustainPedal && sustainedNotes.has(key);

        if (isLogicallyOn || isDirectlyHeld || isSustainedByPedal) {
            if (!kbdElements[key].classList.contains('active')) kbdElements[key].classList.add('active');
        } else {
            kbdElements[key].classList.remove('active');
        }
    }

    let isMouseButton1Down = false;
    let currentTouchedKeyForDrag = null;
    window.addEventListener('mousedown', (event) => {
        if (event.target.closest('#side-panel') || event.target.closest('#effects-panel') || event.target.closest('#note-sequence-display')) return;
        initializeAudio().catch(e => console.error("Audio init on mousedown failed", e));
        if (event.button === 0) isMouseButton1Down = true;
    });
    window.addEventListener('mouseup', (event) => { if (event.button === 0) isMouseButton1Down = false; });
    
    window.addEventListener('keydown', (event) => {
        if (event.target.tagName === 'TEXTAREA' || event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') return;
        if (event.key === "Escape") { event.preventDefault(); panicStopAllSoundsAndReset(); return; }
        if (event.repeat || isPlayingBack) return;
        initializeAudio().catch(e => console.error("Audio init on keydown failed", e));
        
        if (event.code === "Space") {
            event.preventDefault();
            if (!sustainPedal) {
                sustainPedal = true; noteDisplay.textContent = "Sustain ON";
                physicallyDownKeys.forEach(heldKey => { if (baseKeyToFrequency[heldKey]) sustainedNotes.add(heldKey); });
            } return;
        }
        if (event.code === "ArrowUp") { octaveShift++; octaveShiftDisplay.textContent = octaveShift; return; }
        if (event.code === "ArrowDown") { octaveShift--; octaveShiftDisplay.textContent = octaveShift; return; }

        const key = event.key.toLowerCase();
        if (!physicallyDownKeys.has(key)) {
            physicallyDownKeys.add(key);
            if (baseKeyToFrequency[key]) playNote(key);
        }
    });
    
    window.addEventListener('keyup', (event) => {
        if (event.target.tagName === 'TEXTAREA' || event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') return;
        
        const key = event.key.toLowerCase();
        
        if (event.code === "Space") {
            event.preventDefault(); sustainPedal = false; noteDisplay.textContent = "Sustain OFF";
            const notesToPotentiallyStop = new Set(sustainedNotes); sustainedNotes.clear();
            notesToPotentiallyStop.forEach(noteKey => {
                if (!physicallyDownKeys.has(noteKey)) {
                    stopNote(noteKey, true);
                }
            });
            setTimeout(() => {
                 if (!physicallyDownKeys.size && !sustainedNotes.size && !activeNoteSounds.size && noteDisplay.textContent === "Sustain OFF") {
                     noteDisplay.textContent = ' ';
                 }
            }, releaseTime * 1000 + 100);
            return;
        }
        
        physicallyDownKeys.delete(key);
        if (baseKeyToFrequency[key]) stopNote(key);
    });

    volumeSlider.addEventListener('input', () => {
        const newVolume = parseFloat(volumeSlider.value);
        if (masterOutputGain && audioContext) {
            masterOutputGain.gain.setTargetAtTime(newVolume, audioContext.currentTime, 0.01);
        }
    });

    volumeSlider.addEventListener('change', () => {
        volumeSlider.blur();
    });

    if (unisonVoicesSlider) {
        unisonVoicesSlider.addEventListener('input', () => {
            unisonVoices = parseInt(unisonVoicesSlider.value);
            if (unisonVoicesDisplay) unisonVoicesDisplay.textContent = unisonVoices;
        });
        unisonVoicesSlider.addEventListener('change', () => unisonVoicesSlider.blur());
    }
    if (unisonDetuneSlider) {
        unisonDetuneSlider.addEventListener('input', () => {
            detuneAmount = parseInt(unisonDetuneSlider.value);
            if (unisonDetuneDisplay) unisonDetuneDisplay.textContent = detuneAmount;
        });
        unisonDetuneSlider.addEventListener('change', () => unisonDetuneSlider.blur());
    }


    function isStandardWaveformOption(wave) {
        if (!wave) return false;
        for (let i = 0; i < waveformSelect.options.length; i++) {
            const opt = waveformSelect.options[i];
            if (opt.id !== 'dynamic-default-waveform-option' && opt.value === wave) {
                return true;
            }
        }
        return false;
    }

    function setSequenceWaveform(targetWaveform, isProgrammatic, context = { fromLoad: false, isEstablishingDefault: false }) {
        currentWaveform = targetWaveform;
        const ddwo = document.getElementById('dynamic-default-waveform-option');
        let finalDropdownValueToSet;

        if (context.fromLoad && context.isEstablishingDefault) {
            ddwo.value = targetWaveform;
            ddwo.textContent = `Default (${targetWaveform})`;
            ddwo.hidden = false;
            ddwo.disabled = false;
            finalDropdownValueToSet = targetWaveform;
        } else {
            if (ddwo) {
                ddwo.value = "";
                ddwo.textContent = "Default (---)";
                ddwo.hidden = true;
                ddwo.disabled = true;
            }
            finalDropdownValueToSet = targetWaveform;
        }

        if (waveformSelect.value !== finalDropdownValueToSet) {
            if (isProgrammatic) {
                programmaticWaveformChange = true;
            }
            waveformSelect.value = finalDropdownValueToSet;
        } else if (isProgrammatic) {
             programmaticWaveformChange = false;
        }

        if (!(context.fromLoad && context.isEstablishingDefault)) {
            if (recordedSequence.length > 0) {
                let sequenceDataChanged = false;
                recordedSequence.forEach(note => {
                    if (note.waveform !== targetWaveform) {
                        note.waveform = targetWaveform;
                        sequenceDataChanged = true;
                    }
                });
                if (sequenceDataChanged) {
                    updateSequenceDisplay(-1);
                }
            } else if (context.fromLoad && recordedSequence.length === 0) {
                 updateSequenceDisplay(-1);
            }
        }
    }

    waveformSelect.addEventListener('change', () => {
        if (programmaticWaveformChange) {
            programmaticWaveformChange = false;
            waveformSelect.blur();
            return;
        }
        const selectedWaveform = waveformSelect.value;
        setSequenceWaveform(selectedWaveform, false, { fromLoad: false, isEstablishingDefault: false });
        waveformSelect.blur();
    });


    document.querySelectorAll('kbd').forEach(kbd => {
        const keyVal = kbd.textContent.toLowerCase();
        if (!baseKeyToFrequency[keyVal]) return;
        
        const play = (e) => {
            e.preventDefault();
            if (!isPlayingBack) playNote(keyVal);
        };

        const stop = (e) => {
            e.preventDefault();
            if (!isPlayingBack) stopNote(keyVal);
        };

        kbd.addEventListener('mousedown', play);
        kbd.addEventListener('mouseup', stop);
        kbd.addEventListener('mouseleave', (e) => {
            if (isMouseButton1Down && !isPlayingBack && kbd.classList.contains('active')) {
                stopNote(keyVal);
            }
        });
        kbd.addEventListener('mouseover', (e) => {
             if (isMouseButton1Down && !isPlayingBack) {
                 playNote(keyVal);
             }
        });
        
        kbd.addEventListener('touchstart', (e) => {
            e.preventDefault(); if (isPlayingBack) return;
            initializeAudio().catch(e => console.error("Audio init on touchstart failed", e));
            playNote(keyVal);
            currentTouchedKeyForDrag = keyVal;
        }, { passive: false });
        
        kbd.addEventListener('touchend', (e) => {
            e.preventDefault(); if (isPlayingBack) return;
            stopNote(keyVal);
            currentTouchedKeyForDrag = null;
        });
    });
    
    document.addEventListener('touchmove', (event) => {
        if (isPlayingBack || !currentTouchedKeyForDrag) return;
        if (event.touches.length > 0) {
            const touch = event.touches[0];
            const elementUnderTouch = document.elementFromPoint(touch.clientX, touch.clientY);
            let newKeyOver = null;
            if (elementUnderTouch && elementUnderTouch.tagName === 'KBD') {
                newKeyOver = elementUnderTouch.textContent.toLowerCase();
                if (!baseKeyToFrequency[newKeyOver]) newKeyOver = null;
            }
            if (newKeyOver !== currentTouchedKeyForDrag) {
                if (currentTouchedKeyForDrag) stopNote(currentTouchedKeyForDrag);
                if (newKeyOver) playNote(newKeyOver);
                currentTouchedKeyForDrag = newKeyOver;
            }
            if (newKeyOver) event.preventDefault();
        }
    }, { passive: false });
    
    document.addEventListener('touchend', (event) => {
        if (currentTouchedKeyForDrag && event.touches.length === 0 && !isPlayingBack) {
           stopNote(currentTouchedKeyForDrag); currentTouchedKeyForDrag = null;
        }
    });
    
    document.addEventListener('touchcancel', (event) => {
        if (currentTouchedKeyForDrag && !isPlayingBack) {
            stopNote(currentTouchedKeyForDrag, true); currentTouchedKeyForDrag = null;
        }
        physicallyDownKeys.forEach(physKey => stopNote(physKey, true)); physicallyDownKeys.clear();
    });

    // --- Metronome Logic ---

    function playMetronomeTick() {
        if (!audioContext || !masterOutputGain) return;
        const now = audioContext.currentTime;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, now);
        osc.connect(gain);
        gain.connect(masterOutputGain);
        gain.gain.setValueAtTime(metronomeVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    }

    function scheduler() {
        if (!audioContext) return;
        while (nextNoteTime < audioContext.currentTime + 0.1) {
            if (isMetronomeOn) {
                playMetronomeTick();
            }
            const secondsPerBeat = 60.0 / bpm;
            nextNoteTime += secondsPerBeat;
        }
    }

    function startScheduler() {
        if (schedulerIntervalId) clearInterval(schedulerIntervalId);
        if (audioContext && isMetronomeOn) {
            nextNoteTime = audioContext.currentTime;
            schedulerIntervalId = setInterval(scheduler, 25);
        }
    }

    function stopScheduler() {
        if (schedulerIntervalId) clearInterval(schedulerIntervalId);
        schedulerIntervalId = null;
    }
    
    metronomeToggle.addEventListener('change', () => {
        isMetronomeOn = metronomeToggle.checked;
        if (isMetronomeOn) initializeAudio().then(startScheduler).catch(e => console.error("Could not start metronome", e));
        else stopScheduler();
    });

    bpmSlider.addEventListener('input', () => {
        bpm = parseInt(bpmSlider.value, 10);
        bpmDisplay.textContent = bpm;
    });

    metronomeVolumeSlider.addEventListener('input', () => {
        metronomeVolume = parseFloat(metronomeVolumeSlider.value);
    });

    // --- Sequencer Logic ---
    function processLoadedSequenceData(incomingSanitizedNotes) {
        recordedSequence = incomingSanitizedNotes.map(note => ({ ...note }));
        let waveformForCurrentSetting;
        let establishDefaultUIState = false;

        if (recordedSequence.length > 0) {
            const validStandardWaveformsInSequence = recordedSequence
                .map(n => n.waveform)
                .filter(w => isStandardWaveformOption(w));

            if (validStandardWaveformsInSequence.length > 0) {
                const firstValidWaveform = validStandardWaveformsInSequence[0];
                if (validStandardWaveformsInSequence.every(w => w === firstValidWaveform)) {
                    waveformForCurrentSetting = firstValidWaveform;
                } else {
                    waveformForCurrentSetting = currentWaveform;
                    recordedSequence.forEach(note => { note.waveform = waveformForCurrentSetting; });
                }
            } else {
                waveformForCurrentSetting = currentWaveform;
                recordedSequence.forEach(note => { note.waveform = waveformForCurrentSetting; });
            }
            establishDefaultUIState = true;
        } else {
            waveformForCurrentSetting = currentWaveform;
            establishDefaultUIState = false;
        }

        if (recordedSequence.length > 0) {
            recordedSequence.sort((a, b) => a.startTime - b.startTime);
        }
        setSequenceWaveform(waveformForCurrentSetting, true, { fromLoad: true, isEstablishingDefault: establishDefaultUIState });
        updateSequencerControls();
        updateSequenceDisplay(-1);
    }

    function updateSequenceDisplay(highlightNoteIndex = -1) {
        sequenceDisplayLineInfo = []; let currentText = ""; let linesForInfo = [];
        if (recordedSequence.length === 0) { currentText = ""; }
        else {
            linesForInfo = recordedSequence.map((note, index) => {
                const noteName = getNoteNameWithOctave(note.key, note.octaveShift);
                const displayWaveform = note.waveform || DEFAULT_WAVEFORM_ON_PARSE;
                return `${String(index + 1).padStart(3, '0')}: ${noteName.padEnd(5)} ` +
                       `T:${note.startTime.toFixed(2).padStart(6)} ` +
                       `D:${note.duration.toFixed(2).padStart(5)} ` +
                       `V:${note.volume.toFixed(2)} ${displayWaveform.slice(0,3)}`;
            });
            currentText = linesForInfo.join('\n');
            let charIndex = 0;
            linesForInfo.forEach((line, idx) => {
                const start = charIndex; const end = charIndex + line.length;
                sequenceDisplayLineInfo.push({ start, end, originalIndex: idx });
                charIndex = end + 1;
            });
        }
        sequenceDisplay.value = currentText;

        if (highlightNoteIndex !== -1 && sequenceDisplayLineInfo[highlightNoteIndex]) {
            const { start, end } = sequenceDisplayLineInfo[highlightNoteIndex];
            if (document.activeElement !== sequenceDisplay && sidePanel && sidePanel.classList.contains('visible')) {
                sequenceDisplay.focus({ preventScroll: true });
            }
            if(document.activeElement === sequenceDisplay) {
                sequenceDisplay.setSelectionRange(start, end);
            }
            const ta = sequenceDisplay; const numTotalLines = ta.value.split('\n').length;
            if (numTotalLines > 0 && recordedSequence.length > 0) {
                if (highlightNoteIndex >= 0 && highlightNoteIndex < recordedSequence.length) {
                    const avgLineHeight = ta.scrollHeight / numTotalLines;
                    const targetLineVisualIndex = highlightNoteIndex;
                    let scrollTopToCenterLine = (targetLineVisualIndex * avgLineHeight) - (ta.clientHeight / 2) + (avgLineHeight / 2);
                    const maxScrollTop = Math.max(0, ta.scrollHeight - ta.clientHeight);
                    ta.scrollTop = Math.max(0, Math.min(scrollTopToCenterLine, maxScrollTop));
                }
            }
        } else if (highlightNoteIndex === -1) {
            if (document.activeElement === sequenceDisplay) {
                 const currentPos = sequenceDisplay.selectionStart;
                 sequenceDisplay.setSelectionRange(currentPos, currentPos);
            }
        }
    }

    function updateSequencerControls() {
        const hasSequence = recordedSequence.length > 0;
        const activityLock = isRecording || isPlayingBack;

        playBtn.disabled = !hasSequence || activityLock;
        exportBtn.disabled = !hasSequence || activityLock;
        copySequenceBtn.disabled = !hasSequence || activityLock;
        pasteSequenceBtn.disabled = activityLock;

        if (importLabel) {
            if (activityLock) { importFileInput.disabled = true; importLabel.classList.add('disabled-label'); }
            else { importFileInput.disabled = false; importLabel.classList.remove('disabled-label'); }
        } else { importFileInput.disabled = activityLock; }

        const isTextareaEffectivelyEmpty = sequenceDisplay.value.trim() === "" || sequenceDisplay.value.trim() === "No notes recorded yet.";
        clearSequenceBtn.disabled = (isTextareaEffectivelyEmpty && !hasSequence) || activityLock;
        stopPlaybackBtn.disabled = !isPlayingBack;
        recordBtn.disabled = isPlayingBack;
    }

    recordBtn.addEventListener('click', () => {
        initializeAudio().then(() => {
            if (isPlayingBack) { recordBtn.blur(); return; }
            isRecording = !isRecording;
            if (isRecording) {
                recordBtn.classList.add('recording'); recordBtn.textContent = '▉ Stop Recording';
                recordingStartTime = audioContext.currentTime; recordedSequence = []; activeRecordingNotes = {};
                noteDisplay.textContent = "REC 🔴";
                setSequenceWaveform(currentWaveform, true, { fromLoad: false, isEstablishingDefault: false });
                updateSequenceDisplay(-1);
            } else {
                recordBtn.classList.remove('recording'); recordBtn.textContent = '⏺️ Record';
                noteDisplay.textContent = "REC ⏹️";
                Object.keys(activeRecordingNotes).forEach(recKey => {
                    const noteData = activeRecordingNotes[recKey];
                    const startTimeOffset = noteData.startTimeAbsolute - recordingStartTime;
                    const duration = audioContext.currentTime - noteData.startTimeAbsolute;
                    if (duration > 0.02) {
                        recordedSequence.push({
                            key: noteData.key, octaveShift: noteData.octaveShift, waveform: noteData.waveform,
                            volume: noteData.volume, startTime: startTimeOffset, duration: duration
                        });
                    }
                });
                activeRecordingNotes = {};
                if (recordedSequence.length > 0) {
                    recordedSequence.sort((a, b) => a.startTime - b.startTime);
                }
                updateSequenceDisplay(-1);
                if (sequenceDisplay.value.length > 0 && sequenceDisplay.value !== "No notes recorded yet.") {
                     sequenceDisplay.scrollTop = sequenceDisplay.scrollHeight;
                }
                setTimeout(() => { if(noteDisplay.textContent === "REC ⏹️") noteDisplay.textContent = ' ';}, 2000);
            }
            updateSequencerControls(); recordBtn.blur();
        }).catch(err => { recordBtn.blur(); });
    });

    playBtn.addEventListener('click', () => {
        if (document.activeElement === sequenceDisplay) { handleSequenceInput(); }
        if (recordedSequence.length === 0 || isRecording || isPlayingBack) {
            updateSequencerControls(); playBtn.blur(); return;
        }
        initializeAudio().then(() => {
            isPlayingBack = true;
            updateSequencerControls();
            noteDisplay.textContent = "PLAY ▶️";
            document.querySelectorAll('kbd.active').forEach(k => k.classList.remove('active'));
            if (document.activeElement !== sequenceDisplay && sidePanel && sidePanel.classList.contains('visible')) {
                 sequenceDisplay.focus({ preventScroll: true });
            }
            playSequence();
            playBtn.blur();
        })
        .catch(err => { console.error("Audio init failed for play:", err); playBtn.blur(); });
    });

    stopPlaybackBtn.addEventListener('click', () => { stopSequencePlayback(true); stopPlaybackBtn.blur(); });

    function playSequence() {
        if (!isPlayingBack) return;

        playbackTimeouts.forEach(t => clearTimeout(t.id));
        playbackTimeouts = [];
        activePlaybackNoteSounds.clear();
        updateSequenceDisplay(-1);

        recordedSequence.forEach((noteData, index) => {
            const uniqueNoteId = `playback_${index}_${noteData.startTime.toFixed(4)}`;
            const noteSpecificReleaseTime = noteData.releaseTime !== undefined ? noteData.releaseTime : releaseTime;

            const playTimeoutId = setTimeout(() => {
                if (!isPlayingBack) return;
                const soundObjectsArray = playNote(noteData.key, true, noteData);
                if (soundObjectsArray && soundObjectsArray.length > 0) {
                    activePlaybackNoteSounds.set(uniqueNoteId, soundObjectsArray);
                    if (kbdElements[noteData.key]) kbdElements[noteData.key].classList.add('active');
                    noteDisplay.textContent = `${getNoteNameWithOctave(noteData.key, noteData.octaveShift)} (Seq)`;
                    updateSequenceDisplay(index);
                }
            }, noteData.startTime * 1000);
            playbackTimeouts.push({ type: 'play', id: playTimeoutId, key: noteData.key, uniqueNoteId, noteIndex: index });

            const stopTime = noteData.startTime + noteData.duration;
            const stopTimeoutId = setTimeout(() => {
                if (!isPlayingBack) return;
                const soundsToActuallyStopArray = activePlaybackNoteSounds.get(uniqueNoteId);
                if (soundsToActuallyStopArray && soundsToActuallyStopArray.length > 0) {
                    stopNote(noteData.key, false, true, soundsToActuallyStopArray, noteSpecificReleaseTime);
                    activePlaybackNoteSounds.delete(uniqueNoteId);
                }
            }, stopTime * 1000);
            playbackTimeouts.push({ type: 'stop', id: stopTimeoutId, key: noteData.key, uniqueNoteId });
        });

        const lastNote = recordedSequence[recordedSequence.length - 1];
        if (lastNote) {
            const lastNoteRelTime = lastNote.releaseTime !== undefined ? lastNote.releaseTime : releaseTime;
            const sequenceDuration = lastNote.startTime + lastNote.duration + lastNoteRelTime + 0.1;

            const loopTimeoutId = setTimeout(() => {
                if (isPlayingBack) {
                    playSequence();
                }
            }, sequenceDuration * 1000);
            playbackTimeouts.push({ type: 'loop', id: loopTimeoutId });
        } else {
             stopSequencePlayback(true);
        }
    }

    function forceStopAllPlaybackOscillators() {
        if (!audioContext) return;
        for (const poolKey in oscillatorPools) {
            if (!oscillatorPools.hasOwnProperty(poolKey)) continue;
            oscillatorPools[poolKey].forEach(sound => { if (sound.isPlayback) forceResetSound(sound); });
        }
    }

    function stopSequencePlayback(manualStop = true) {
        const wasPlayingBack = isPlayingBack; isPlayingBack = false;
        playbackTimeouts.forEach(t => clearTimeout(t.id)); playbackTimeouts = [];

        activePlaybackNoteSounds.forEach((soundObjectsArray, uniqueNoteId) => {
            soundObjectsArray.forEach(soundObject => forceResetSound(soundObject));
        });
        activePlaybackNoteSounds.clear();
        forceStopAllPlaybackOscillators();

        if (wasPlayingBack) {
            updateSequenceDisplay(-1);
            noteDisplay.textContent = "PLAY ⏹️";
            setTimeout(() => { if (noteDisplay.textContent === "PLAY ⏹️") noteDisplay.textContent = ' '; }, 1500);
        }
        updateSequencerControls();
        setTimeout(() => {
            document.querySelectorAll('kbd').forEach(kbdEl => {
                const kbdKeyVal = kbdEl.textContent.toLowerCase();
                if (baseKeyToFrequency[kbdKeyVal]) checkAndDeactivateVisual(kbdKeyVal);
            });
        }, 60);
    }

    function panicStopAllSoundsAndReset() {
        if (isPlayingBack) stopSequencePlayback(true);
        if (isRecording) {
            isRecording = false; recordBtn.classList.remove('recording');
            recordBtn.textContent = '⏺️ Record'; activeRecordingNotes = {};
        }

        // Force stop all active sounds by iterating our robust map
        activeNoteSounds.forEach((sounds, key) => {
            stopNote(key, true);
        });
        activeNoteSounds.clear();
        
        // Also do the low-level pool sweep as a final safety measure
        if (audioContext) {
            for (const poolKey in oscillatorPools) {
                if (oscillatorPools.hasOwnProperty(poolKey)) {
                    oscillatorPools[poolKey].forEach(sound => forceResetSound(sound));
                }
            }
        }
        
        sustainPedal = false; sustainedNotes.clear();
        physicallyDownKeys.clear(); currentTouchedKeyForDrag = null;

        noteDisplay.textContent = "ALL STOPPED 🛑"; updateSequenceDisplay(-1); updateSequencerControls();
        setTimeout(() => {
            document.querySelectorAll('kbd').forEach(kbdEl => {
                const kbdKeyVal = kbdEl.textContent.toLowerCase();
                if (baseKeyToFrequency[kbdKeyVal]) checkAndDeactivateVisual(kbdKeyVal);
            });
            if (noteDisplay.textContent === "ALL STOPPED 🛑") noteDisplay.textContent = ' ';
        }, 100);
    }

    exportBtn.addEventListener('click', () => {
        if (recordedSequence.length === 0) { exportBtn.blur(); return; }
        const jsonData = JSON.stringify(recordedSequence, null, 2);
        const fileContentWithHeaderAndFooter = JSON_EXPORT_COMMENT_HEADER + jsonData + JSON_EXPORT_COMMENT_FOOTER;
        const blob = new Blob([fileContentWithHeaderAndFooter], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
        a.download = `synth_sequence_${timestamp}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        exportBtn.blur();
    });

    importFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0]; if (!file) { importFileInput.blur(); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                let fileContent = e.target.result;
                const contentWithoutComments = fileContent.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*$)/gm, (match, group1) => group1 ? '' : match);
                const importedJson = JSON.parse(contentWithoutComments);
                if (Array.isArray(importedJson) &&
                    (importedJson.length === 0 || importedJson.every(n => n.key && n.startTime !== undefined && n.duration !== undefined))) {
                    if (isRecording) { isRecording = false; recordBtn.classList.remove('recording'); recordBtn.textContent = '⏺️ Record'; activeRecordingNotes = {}; }
                    if (isPlayingBack) stopSequencePlayback(true);
                    const sanitizedNotes = importedJson.map(note => sanitizeIncomingNote(note));
                    processLoadedSequenceData(sanitizedNotes);
                    noteDisplay.textContent = "Sequence Loaded";
                    setTimeout(() => { if (noteDisplay.textContent === "Sequence Loaded") noteDisplay.textContent = ' '; }, 2000);
                } else { alert('Invalid sequence file format.'); }
            } catch (err) { console.error("Error parsing sequence file:", err); alert('Error parsing sequence file.'); }
            finally { importFileInput.value = ''; importFileInput.blur(); }
        };
        reader.readAsText(file);
    });

    clearSequenceBtn.addEventListener('click', () => {
        if (isRecording) { isRecording = false; recordBtn.classList.remove('recording'); recordBtn.textContent = '⏺️ Record'; activeRecordingNotes = {}; }
        if (isPlayingBack) stopSequencePlayback(true);
        recordedSequence = [];
        setSequenceWaveform(currentWaveform, true, { fromLoad: false, isEstablishingDefault: false });
        updateSequenceDisplay(-1);
        updateSequencerControls();
        noteDisplay.textContent = "Sequence Cleared";
        setTimeout(() => { if(noteDisplay.textContent === "Sequence Cleared") noteDisplay.textContent = ' ';}, 1500);
        clearSequenceBtn.blur();
    });

    function handleSequenceInput() {
        if (isPlayingBack) { stopSequencePlayback(true); noteDisplay.textContent = "Playback stopped by edit."; setTimeout(() => { if (noteDisplay.textContent.startsWith("Playback stopped")) noteDisplay.textContent = ' '; }, 2000); }
        if (isRecording) { isRecording = false; recordBtn.classList.remove('recording'); recordBtn.textContent = '⏺️ Record'; activeRecordingNotes = {}; noteDisplay.textContent = "Recording stopped by edit."; setTimeout(() => { if (noteDisplay.textContent.startsWith("Recording stopped")) noteDisplay.textContent = ' '; }, 2000); }

        const textContent = sequenceDisplay.value; let contentToParse = textContent.trim();
        const oldSequenceJSON = JSON.stringify(recordedSequence);

        if (contentToParse === "" || contentToParse === "No notes recorded yet.") {
            let changed = recordedSequence.length > 0;
            processLoadedSequenceData([]);
            if (changed) { noteDisplay.textContent = "Sequence cleared by edit."; setTimeout(() => { if (noteDisplay.textContent.startsWith("Sequence cleared")) noteDisplay.textContent = ' '; }, 2000); }
        } else {
            try {
                let jsonContentToParse = contentToParse;
                if (jsonContentToParse.includes('//')) {
                    jsonContentToParse = jsonContentToParse.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*$)/gm, (match, group1) => group1 ? '' : match);
                }
                const importedJson = JSON.parse(jsonContentToParse);
                if (Array.isArray(importedJson) && (importedJson.length === 0 || importedJson.every(n => n.key && n.startTime !== undefined && n.duration !== undefined))) {
                    const sanitizedNotes = importedJson.map(note => sanitizeIncomingNote(note));
                    processLoadedSequenceData(sanitizedNotes);
                    if (oldSequenceJSON !== JSON.stringify(recordedSequence)) {
                        noteDisplay.textContent = "Sequence Updated from Text"; setTimeout(() => { if (noteDisplay.textContent.startsWith("Sequence Updated")) noteDisplay.textContent = ' '; }, 2000);
                    }
                } else {
                    noteDisplay.textContent = "Text is JSON, but not valid sequence."; setTimeout(() => { if (noteDisplay.textContent.startsWith("Text is JSON,")) noteDisplay.textContent = ' '; }, 3000);
                }
            } catch (jsonError) {
                noteDisplay.textContent = "Text is not valid JSON."; setTimeout(() => { if (noteDisplay.textContent === "Text is not valid JSON.") noteDisplay.textContent = ' '; }, 3000);
            }
        }
        updateSequencerControls();
    }

    sequenceDisplay.addEventListener('change', handleSequenceInput);

    sequenceDisplay.addEventListener('copy', (event) => {
        if (recordedSequence.length > 0) {
            event.preventDefault();
            const jsonSequence = JSON.stringify(recordedSequence, null, 2);
            const contentToCopyWithHeaderAndFooter = JSON_EXPORT_COMMENT_HEADER + jsonSequence + JSON_EXPORT_COMMENT_FOOTER;

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(contentToCopyWithHeaderAndFooter).catch(err => {
                    console.error('Copy failed: ', err);
                    tryCopyFallback(contentToCopyWithHeaderAndFooter);
                });
            } else {
                tryCopyFallback(contentToCopyWithHeaderAndFooter);
            }
            noteDisplay.textContent = "Seq copied (JSON)!";
            setTimeout(() => { if (noteDisplay.textContent === "Seq copied (JSON)!") noteDisplay.textContent = ' '; }, 2000);
        }
    });

    function tryCopyFallback(textToCopy) {
        try {
            const SDU_tempTextArea = document.createElement('textarea'); SDU_tempTextArea.value = textToCopy;
            SDU_tempTextArea.style.position = 'absolute'; SDU_tempTextArea.style.left = '-9999px';
            document.body.appendChild(SDU_tempTextArea); SDU_tempTextArea.select(); document.execCommand('copy');
            document.body.removeChild(SDU_tempTextArea);
            noteDisplay.textContent = "Seq copied (fallback)!"; setTimeout(() => { if (noteDisplay.textContent.startsWith("Seq copied")) noteDisplay.textContent = ' '; }, 2000);
        } catch (e) { console.error('Fallback copy failed', e); alert("Copy to clipboard failed."); }
    }

    copySequenceBtn.addEventListener('click', () => {
        if (recordedSequence.length > 0) {
            const jsonSequence = JSON.stringify(recordedSequence, null, 2);
            const contentToCopyWithHeaderAndFooter = JSON_EXPORT_COMMENT_HEADER + jsonSequence + JSON_EXPORT_COMMENT_FOOTER;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(contentToCopyWithHeaderAndFooter).then(() => {
                    noteDisplay.textContent = "Seq copied!"; setTimeout(() => { if (noteDisplay.textContent === "Seq copied!") noteDisplay.textContent = ' '; }, 2000);
                }).catch(err => { console.error('Copy failed: ', err); tryCopyFallback(contentToCopyWithHeaderAndFooter); });
            } else { tryCopyFallback(contentToCopyWithHeaderAndFooter); }
        } else { noteDisplay.textContent = "Nothing to copy."; setTimeout(() => { if (noteDisplay.textContent === "Nothing to copy.") noteDisplay.textContent = ' '; }, 1500); }
        copySequenceBtn.blur();
    });

    pasteSequenceBtn.addEventListener('click', async () => {
        if (isRecording) recordBtn.click();
        if (isPlayingBack) stopSequencePlayback(true);

        try {
            if (!navigator.clipboard || !navigator.clipboard.readText) {
                noteDisplay.textContent = "Clipboard API not supported.";
                setTimeout(() => { if (noteDisplay.textContent.startsWith("Clipboard API")) noteDisplay.textContent = ' '; }, 4000);
                sequenceDisplay.focus(); pasteSequenceBtn.blur(); return;
            }
            const text = await navigator.clipboard.readText();
            if (text.trim() === "") {
                noteDisplay.textContent = "Clipboard empty.";
                processLoadedSequenceData([]);
                setTimeout(() => { if (noteDisplay.textContent.startsWith("Clipboard empty")) noteDisplay.textContent = ' '; }, 2000);
                pasteSequenceBtn.blur(); return;
            }
            noteDisplay.textContent = "Processing paste...";
            try {
                let jsonContentToParse = text.trim();
                if (jsonContentToParse.includes('//')) {
                    jsonContentToParse = jsonContentToParse.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*$)/gm, (match, group1) => group1 ? '' : match);
                }
                const importedJson = JSON.parse(jsonContentToParse);
                if (Array.isArray(importedJson) && (importedJson.length === 0 || importedJson.every(n => n.key && n.startTime !== undefined && n.duration !== undefined))) {
                    const sanitizedNotes = importedJson.map(note => sanitizeIncomingNote(note));
                    processLoadedSequenceData(sanitizedNotes);
                    noteDisplay.textContent = "Sequence Pasted"; setTimeout(() => { if (noteDisplay.textContent === "Sequence Pasted") noteDisplay.textContent = ' '; }, 2000);
                } else {
                    sequenceDisplay.value = text;
                    noteDisplay.textContent = "Pasted JSON not valid sequence.";
                    setTimeout(() => { if (noteDisplay.textContent.startsWith("Pasted JSON not valid")) noteDisplay.textContent = ' '; }, 3000);
                }
            } catch (jsonError) {
                sequenceDisplay.value = text;
                noteDisplay.textContent = "Pasted text not valid JSON.";
                setTimeout(() => { if (noteDisplay.textContent.startsWith("Pasted text not valid")) noteDisplay.textContent = ' '; }, 3000);
            }
        } catch (err) {
            console.error('Paste failed:', err); noteDisplay.textContent = "Paste failed.";
            setTimeout(() => { if (noteDisplay.textContent.startsWith("Paste failed")) noteDisplay.textContent = ' '; }, 3000);
        }
        updateSequencerControls();
        pasteSequenceBtn.blur();
    });

    function bindEffectsControls() {
        const reverbMix = document.getElementById('reverb-mix'), reverbMixDisplay = document.getElementById('reverb-mix-display');
        const delayTime = document.getElementById('delay-time'), delayTimeDisplay = document.getElementById('delay-time-display');
        const delayFeedback = document.getElementById('delay-feedback'), delayFeedbackDisplay = document.getElementById('delay-feedback-display');
        const delayMix = document.getElementById('delay-mix'), delayMixDisplay = document.getElementById('delay-mix-display');
        const distortionAmount = document.getElementById('distortion-amount'), distortionAmountDisplay = document.getElementById('distortion-amount-display');
        const distortionType = document.getElementById('distortion-type');
        const modEffectRate = document.getElementById('mod-effect-rate'), modEffectRateDisplay = document.getElementById('mod-effect-rate-display');
        const modEffectDepth = document.getElementById('mod-effect-depth'), modEffectDepthDisplay = document.getElementById('mod-effect-depth-display');
        const modEffectType = document.getElementById('mod-effect-type');
        const stereoSpreadAmountSlider = document.getElementById('stereo-spread-amount'), stereoSpreadAmountDisplay = document.getElementById('stereo-spread-amount-display');

        reverbMix.addEventListener('input', () => {
            const val = parseFloat(reverbMix.value);
            if (reverbMixNode && audioContext) reverbMixNode.gain.setTargetAtTime(val, audioContext.currentTime, 0.01);
            reverbMixDisplay.textContent = val.toFixed(2);
        });
        reverbMix.addEventListener('change', () => reverbMix.blur());

        delayTime.addEventListener('input', () => {
            const val = parseFloat(delayTime.value);
            if (delayNode && audioContext) delayNode.delayTime.setTargetAtTime(val, audioContext.currentTime, 0.01);
            delayTimeDisplay.textContent = val.toFixed(2);
        });
        delayTime.addEventListener('change', () => delayTime.blur());

        delayFeedback.addEventListener('input', () => {
            const val = parseFloat(delayFeedback.value);
            if (delayFeedbackNode && audioContext) delayFeedbackNode.gain.setTargetAtTime(val, audioContext.currentTime, 0.01);
            delayFeedbackDisplay.textContent = val.toFixed(2);
        });
        delayFeedback.addEventListener('change', () => delayFeedback.blur());

        delayMix.addEventListener('input', () => {
            const val = parseFloat(delayMix.value);
            if (delayMixNode && audioContext) delayMixNode.gain.setTargetAtTime(val, audioContext.currentTime, 0.01);
            delayMixDisplay.textContent = val.toFixed(2);
        });
        delayMix.addEventListener('change', () => delayMix.blur());

        const updateDistortion = () => {
            if (!distortionNode || !audioContext) return;
            const amount = parseFloat(distortionAmount.value);
            distortionNode.curve = makeDistortionCurve(amount, distortionType.value);
            distortionAmountDisplay.textContent = amount;
        };
        distortionAmount.addEventListener('input', updateDistortion);
        distortionAmount.addEventListener('change', () => distortionAmount.blur());
        distortionType.addEventListener('change', () => {
            updateDistortion();
            distortionType.blur();
        });

        const updateModEffect = () => {
            if (!modLfo || !modLfoGain || !modDelay || !modFeedbackGain || !audioContext) return;
            const rate = parseFloat(modEffectRate.value), depth = parseFloat(modEffectDepth.value), type = modEffectType.value;
            modLfo.frequency.setTargetAtTime(rate, audioContext.currentTime, 0.01);
            if (type === 'chorus') {
                modFeedbackGain.gain.setTargetAtTime(0.3, audioContext.currentTime, 0.01);
                modDelay.delayTime.setTargetAtTime(0.025, audioContext.currentTime, 0.01);
                modLfoGain.gain.setTargetAtTime(depth * 0.005, audioContext.currentTime, 0.01);
            } else if (type === 'flanger') {
                modFeedbackGain.gain.setTargetAtTime(0.85, audioContext.currentTime, 0.01);
                modDelay.delayTime.setTargetAtTime(0.005, audioContext.currentTime, 0.01);
                modLfoGain.gain.setTargetAtTime(depth * 0.003, audioContext.currentTime, 0.01);
            }
            modEffectRateDisplay.textContent = rate.toFixed(1);
            modEffectDepthDisplay.textContent = depth.toFixed(2);
        };
        modEffectRate.addEventListener('input', updateModEffect);
        modEffectRate.addEventListener('change', () => modEffectRate.blur());
        modEffectDepth.addEventListener('input', updateModEffect);
        modEffectDepth.addEventListener('change', () => modEffectDepth.blur());
        modEffectType.addEventListener('change', () => {
            updateModEffect();
            modEffectType.blur();
        });

        stereoSpreadAmountSlider.addEventListener('input', () => {
            stereoSpreadAmount = parseFloat(stereoSpreadAmountSlider.value);
            stereoSpreadAmountDisplay.textContent = stereoSpreadAmount.toFixed(2);
        });
        stereoSpreadAmountSlider.addEventListener('change', () => stereoSpreadAmountSlider.blur());
    }

    function initialSetup() {
        const defaultPanel = panelsConfig.find(p => p.name === 'Seq');
        if (defaultPanel) { openPanel(defaultPanel.panel); }
        else { closeAllPanels(); }

        currentWaveform = waveformSelect.value;
        const ddwo = document.getElementById('dynamic-default-waveform-option');
        if (ddwo) {
            ddwo.value = ""; ddwo.textContent = "Default (---)";
            ddwo.hidden = true; ddwo.disabled = true;
        }

        octaveShiftDisplay.textContent = octaveShift;
        if (metronomeVolumeSlider) metronomeVolumeSlider.value = String(metronomeVolume);
        if (unisonVoicesSlider) unisonVoicesSlider.value = String(unisonVoices);
        if (unisonVoicesDisplay) unisonVoicesDisplay.textContent = unisonVoices;
        if (unisonDetuneSlider) unisonDetuneSlider.value = String(detuneAmount);
        if (unisonDetuneDisplay) unisonDetuneDisplay.textContent = detuneAmount;

        // Activate effects panel controls and add Bypass button
        const effectsPanelHeading = effectsPanel.querySelector('h2');
        if(effectsPanelHeading) {
            fxBypassToggleBtn = document.createElement('button');
            fxBypassToggleBtn.id = 'fx-bypass-toggle';
            // The text content will be set by updateFxBypassState
            fxBypassToggleBtn.style.cssText = `
                display: block; width: 100%; margin: 15px 0; padding: 10px 12px; font-size: 0.95em;
                background-color: #007bff; border-color: #0056b3; color: white; border: 1px solid;
                border-radius: 4px; cursor: pointer; text-align: center;
            `;
            fxBypassToggleBtn.addEventListener('click', () => {
                isFxBypassed = !isFxBypassed;
                updateFxBypassState();
                fxBypassToggleBtn.blur();
            });
            effectsPanelHeading.after(fxBypassToggleBtn);
        }

        effectsPanel.querySelectorAll('input, select').forEach(el => el.disabled = false);
        effectsPanel.querySelectorAll('p').forEach(p => p.style.display = 'none');
        bindEffectsControls();

        updateAudioStatus("Initializing..."); 
        updateSequenceDisplay(-1); 
        updateSequencerControls();

        if (!(window.AudioContext || window.webkitAudioContext)) {
            updateAudioStatus("Web Audio API not supported.", "error");
            document.querySelectorAll('button, input, select').forEach(el => {
                if(el.id !== 'dark-mode-toggle' && el.id !== 'toggle-panel-btn' && el.id !== 'toggle-effects-panel-btn') {
                    el.disabled = true;
                }
            });
            return;
        }

        updateAudioStatus("Click or press a key to enable audio", "suspended");
    }

    initialSetup();
});
