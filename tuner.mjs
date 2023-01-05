// @ts-check

const MAX_INTERESTING_FREQUENCY = 10_000;
const PEAK_VALUE_FILTER_VALUE = 0.5;
const KEY_MAXIMUM_CUT_OFF = 0.8;

const NOTE_STRINGS = [
  "C",
  "C♯",
  "D",
  "E♭",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "B♭",
  "B",
];

/** @typedef {{noteString: string, octaveNumber: number, frequency: number, error: number}} Note */

/**
 * @returns {Promise<{ release: () => void }  | undefined>}
 */
const requestWakeLock = async () => {
  try {
    // @ts-ignore
    return await navigator.wakeLock.request();
  } catch (err) {
    console.log(`Unable to keep screen awake: ${err.name}, ${err.message}`);
    return;
  }
};

/**
 * @param {number[] | Uint8Array} data
 * @param {number} index
 */
const interpolateMax = (data, index) => {
  const y1 = data[index - 1];
  const y2 = data[index];
  const y3 = data[index + 1];

  const a = (y1 + y3 - 2 * y2) / 2;
  const b = (y3 - y1) / 2;
  const peak = index - b / (2 * a);
  return peak;
};

/**
 * @param {number[] | Uint8Array} data
 * @returns {number}
 */
const findMaxValue = (data) => {
  // @ts-ignore
  return data.reduce((max, value) => (value > max ? value : max), 0);
};

const frequencyToNoteString = (frequency) => {
  var noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
  return Math.round(noteNum) + 69;
};

const noteToFrequency = (noteNumber) => {
  return Math.exp(((noteNumber - 69) / 12) * Math.log(2)) * 440;
};

/**
 *
 * @param {number | null} frequency
 * @returns {Note | null} note
 */
const createNote = (frequency) => {
  if (frequency === null) {
    return null;
  }
  const midiNoteNumber = frequencyToNoteString(frequency);
  const octaveNumber = Math.floor(midiNoteNumber / 12) - 1;
  const noteString = NOTE_STRINGS[midiNoteNumber % 12];
  const expectedFrequency = noteToFrequency(midiNoteNumber);

  const nextNoteFrequency = noteToFrequency(midiNoteNumber + 1);
  const previousNoteFrequency = noteToFrequency(midiNoteNumber - 1);
  const error =
    frequency - expectedFrequency > 0
      ? (-1 * (frequency - expectedFrequency)) /
        (previousNoteFrequency - expectedFrequency)
      : (frequency - expectedFrequency) /
        (nextNoteFrequency - expectedFrequency);

  return {
    frequency,
    octaveNumber,
    noteString,
    error,
  };
};

/**
 * See http://www.cs.otago.ac.nz/tartini/papers/A_Smarter_Way_to_Find_Pitch.pdf
 * @param {number[] | Float32Array} data
 * @param {number[]} testValues
 */
const correlationFunction = (data, testValues) => {
  /** @type {number[]} */
  const nDash = new Array();

  testValues.forEach((tau) => {
    let rDash = 0;
    let mDash = 0;
    for (let j = 0; j < data.length - tau; j++) {
      rDash += data[j] * data[j + tau];
      mDash += Math.pow(data[j], 2) + Math.pow(data[j + tau], 2);
    }

    nDash[tau] = (2 * rDash) / mDash;
  });

  return nDash;
};

/**
 * @param {Uint8Array | number[]} data
 * @returns {number[]}
 */
const findPeaks = (data, thresholdFactor) => {
  const maxValue = findMaxValue(data);
  const threshold = thresholdFactor * maxValue;

  // @ts-ignore
  return data.reduce((peaks, value, index) => {
    // Assume the data is fairly smooth when identifying peaks
    if (
      value > threshold &&
      data[index - 1] > value &&
      data[index + 1] < value
    ) {
      const peakValue = interpolateMax(data, index);
      return [...peaks, peakValue];
    } else {
      return peaks;
    }
  }, []);
};

/** @typedef {{
 *   sampleRate: number,
 *   audioContext: AudioContext,
 *   audioAnalyser: AnalyserNode,
 *   timer?: number,
 *   mediaStream: MediaStream
 *   wakeLock?: { release: () => void},
 * }} TunerState
 */

/** @returns {Promise<TunerState>} */
const createTunerState = async () => {
  const audioContext = new window.AudioContext();

  try {
    const sampleRate = audioContext.sampleRate;
    const audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.minDecibels = -100;
    audioAnalyser.maxDecibels = -10;
    audioAnalyser.smoothingTimeConstant = 0.85;
    audioAnalyser.fftSize = 4096;

    const wakeLock = await requestWakeLock();

    const constraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
      },
    };
    const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    return {
      audioContext,
      audioAnalyser,
      sampleRate,
      mediaStream,
      wakeLock,
    };
  } catch (error) {
    audioContext.close();
    throw error;
  }
};

/** @param {HTMLCanvasElement} tunerCanvas */
export const create = (tunerCanvas) => {
  /** @type TunerState | null */
  let tunerState = null;

  /** @param {(note: Note | null) => void} onNote */
  const start = async (onNote) => {
    if (tunerState) {
      stop();
    }

    tunerState = await createTunerState();

    const { audioContext, audioAnalyser, mediaStream, sampleRate } = tunerState;

    const audioSource = audioContext.createMediaStreamSource(mediaStream);
    audioSource.connect(audioAnalyser);

    const frequencyAnalysis = new Uint8Array(audioAnalyser.frequencyBinCount);

    /**
     * @param {number[]} estimates
     * @param {number} testFrequencyRange
     */
    const findNote = (estimates, testFrequencyRange) => {
      const timeDomainBuffer = new Float32Array(audioAnalyser.fftSize);
      audioAnalyser.getFloatTimeDomainData(timeDomainBuffer);

      const indicesToTest = new Set();
      estimates.forEach((frequency) => {
        const startOffset = Math.max(
          Math.floor(sampleRate / frequency) - testFrequencyRange,
          0
        );
        const endOffset = Math.min(
          Math.ceil(sampleRate / frequency) + testFrequencyRange,
          sampleRate / 2
        );
        for (let i = startOffset; i <= endOffset; i++) {
          indicesToTest.add(i);
        }
      });

      const correlation = correlationFunction(timeDomainBuffer, [
        ...indicesToTest,
      ]);

      const keyMaxima = findPeaks(correlation, KEY_MAXIMUM_CUT_OFF).filter(
        (maximum) => maximum > 0
      );
      const frequency = keyMaxima[0] ? sampleRate / keyMaxima[0] : null;
      const note = createNote(frequency);
      onNote(note);
    };

    const canvasContext = tunerCanvas.getContext("2d");

    if (!canvasContext) {
      throw new Error("Can't get canvas context");
    }

    const drawFrequencies = () => {
      if (!tunerState) {
        return;
      }
      canvasContext.clearRect(0, 0, tunerCanvas.width, tunerCanvas.height);
      audioAnalyser.getByteFrequencyData(frequencyAnalysis);

      const frequencyBucketWidth = sampleRate / 2 / frequencyAnalysis.length;
      const maxInterestingBucket = Math.ceil(
        MAX_INTERESTING_FREQUENCY / frequencyBucketWidth
      );

      const bucketWidth = Math.ceil(tunerCanvas.width / maxInterestingBucket);
      const heightMultiplier = tunerCanvas.height / 255;

      canvasContext.save();
      canvasContext.fillStyle = "white";
      const gradient = canvasContext.createLinearGradient(
        0,
        tunerCanvas.height,
        0,
        0
      );
      const colourStops = [
        // "#00441b",
        // "#036429",
        // "#157f3b",
        "#2f984f",
        "#4daf62",
        "#73c378",
        "#97d494",
        "#b7e2b1",
        "#d3eecd",
        "#e8f6e3",
        "#f7fcf5",
      ];
      colourStops.forEach((colour, index) =>
        gradient.addColorStop(index / colourStops.length, colour)
      );
      canvasContext.fillStyle = gradient;

      frequencyAnalysis.forEach((magnitude, bucket) => {
        if (bucket > maxInterestingBucket) {
          return;
        }
        canvasContext.fillRect(
          bucket * bucketWidth,
          tunerCanvas.height,
          bucketWidth,
          -1 * magnitude * heightMultiplier
        );
      });

      canvasContext.restore();
      window.requestAnimationFrame(drawFrequencies);
    };

    const updateNote = () => {
      const interestingPeaks = findPeaks(
        frequencyAnalysis,
        PEAK_VALUE_FILTER_VALUE
      );
      const maxFrequency = sampleRate / 2;
      const buckets = audioAnalyser.fftSize / 2;
      const bucketWidth = maxFrequency / buckets;

      const peakFrequencies = interestingPeaks.map(
        (value) => value * bucketWidth
      );
      findNote(peakFrequencies, 10);

      if (tunerState) {
        tunerState.timer = setTimeout(updateNote, 200);
      }
    };

    drawFrequencies();
    updateNote();
  };

  const stop = () => {
    if (tunerState) {
      try {
        if (tunerState.timer) {
          clearTimeout(tunerState.timer);
        }

        tunerState.wakeLock?.release();
        tunerState.audioContext.close();
        tunerState.mediaStream.getTracks().forEach((track) => track.stop());
      } finally {
        tunerState = null;
      }
    }
  };

  return {
    start,
    stop,
  };
};
