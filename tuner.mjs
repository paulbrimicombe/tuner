// @ts-check

const MAX_INTERESTING_FREQUENCY = 12_000;
const MIN_INTERESTING_FREQUENCY = 20;
const PEAK_VALUE_FILTER_VALUE = 0.5;
const KEY_MAXIMUM_CUT_OFF = 0.8;
const NOTE_UPDATE_PERIOD = 100;

/** @typedef {{noteString: string, octaveNumber: number, midiNumber: number, frequency: number, error: number}} Note */

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

const Note = {
  NOTE_STRINGS: [
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
  ],
  frequencyToNoteString: (frequency) => {
    var noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    return Math.round(noteNum) + 69;
  },
  noteToFrequency: (noteNumber) => {
    return Math.exp(((noteNumber - 69) / 12) * Math.log(2)) * 440;
  },
  /**
   * @param {number | null} frequency
   * @returns {Note | null} note
   */
  create: (frequency) => {
    if (frequency === null) {
      return null;
    }
    const midiNumber = Note.frequencyToNoteString(frequency);
    const octaveNumber = Math.floor(midiNumber / 12) - 1;
    const noteString = Note.NOTE_STRINGS[midiNumber % 12];
    const expectedFrequency = Note.noteToFrequency(midiNumber);

    const nextNoteFrequency = Note.noteToFrequency(midiNumber + 1);
    const previousNoteFrequency = Note.noteToFrequency(midiNumber - 1);
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
      midiNumber,
    };
  },
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
  const averagedData = data.map((value, index) => {
    return (data[index - 1] + value + data[index + 1]) / 3;
  });

  const maxValue = findMaxValue(averagedData);
  const threshold = thresholdFactor * maxValue;

  // @ts-ignore
  return averagedData.reduce((peaks, value, index) => {
    // Assume the data is fairly smooth when identifying peaks
    if (
      value > threshold &&
      averagedData[index - 1] <= value &&
      averagedData[index + 1] <= value
    ) {
      const peakValue = interpolateMax(averagedData, index);
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
 *   mediaStream: MediaStream,
 *   note: Note | null
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
      note: null,
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

  /**
   * @param {(note: Note | null, harmonics: number[]) => void} onNote
   */
  const start = async (onNote) => {
    if (tunerState) {
      stop();
    }

    tunerState = await createTunerState();

    const { audioContext, audioAnalyser, mediaStream, sampleRate } = tunerState;

    const audioSource = audioContext.createMediaStreamSource(mediaStream);
    audioSource.connect(audioAnalyser);

    const frequencyAnalysis = new Uint8Array(audioAnalyser.frequencyBinCount);

    const findHarmonicIntensities = () => {
      if (!tunerState || !tunerState.note) {
        return [];
      }
      const frequencyBucketWidth = sampleRate / 2 / frequencyAnalysis.length;

      const bucketIndex = Math.floor(
        tunerState.note.frequency / frequencyBucketWidth
      );
      const interestingBuckets = [
        bucketIndex,
        bucketIndex * 2,
        bucketIndex * 3,
        bucketIndex * 4,
        bucketIndex * 5,
        bucketIndex * 6,
        bucketIndex * 7,
        bucketIndex * 8,
        bucketIndex * 9,
        bucketIndex * 10,
        bucketIndex * 11,
        bucketIndex * 12,
      ];

      const harmonicIntensities = interestingBuckets
        .filter((entry) => entry < frequencyAnalysis.length)
        .map((index) => {
          let elements = 0;
          let sum = 0;
          for (let i = -5; i <= 5; i++) {
            sum += frequencyAnalysis[index - i] ?? 0;
            elements += frequencyAnalysis[index - i] === undefined ? 0 : 1;
          }
          return (100 * (sum / elements)) / 255;
        });

      return harmonicIntensities;
    };

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
      const note = Note.create(frequency);

      if (tunerState) {
        tunerState.note = note;
        const harmonics = findHarmonicIntensities();
        onNote(note, harmonics);
      }
    };

    const canvasContext = tunerCanvas.getContext("2d");

    if (!canvasContext) {
      throw new Error("Can't get canvas context");
    }

    const gradient = canvasContext.createLinearGradient(
      0,
      tunerCanvas.height,
      0,
      0
    );
    const colourStops = [
      "#2f984fff",
      "#4daf62ee",
      "#73c378dd",
      "#97d494cc",
      "#b7e2b1bb",
      "#d3eecdaa",
      "#e8f6e399",
      "#f7fcf588",
    ];
    colourStops.forEach((colour, index) => {
      gradient.addColorStop(index / colourStops.length, colour);
    });

    const heightMultiplier = tunerCanvas.height / 255;

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

      const minInterestingBucket = Math.floor(
        MIN_INTERESTING_FREQUENCY / frequencyBucketWidth
      );

      const bucketWidth = Math.ceil(
        tunerCanvas.width / (maxInterestingBucket - minInterestingBucket)
      );

      canvasContext.save();
      canvasContext.fillStyle = "white";
      canvasContext.fillStyle = gradient;

      frequencyAnalysis.forEach((magnitude, bucket) => {
        if (bucket < minInterestingBucket || bucket > maxInterestingBucket) {
          return;
        }
        canvasContext.fillRect(
          (bucket - minInterestingBucket) * bucketWidth,
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
      findNote(peakFrequencies, 3);

      if (tunerState) {
        tunerState.timer = setTimeout(updateNote, NOTE_UPDATE_PERIOD);
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
