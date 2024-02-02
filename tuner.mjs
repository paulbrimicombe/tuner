// @ts-check

// const MIN_NOTE_FREQUENCY = 27;
const MIN_NOTE_FREQUENCY = 25;
const MAX_NOTE_FREQUENCY = 8_000;

// For graphing purposes
const MAX_INTERESTING_FREQUENCY = 12_000;
const MIN_INTERESTING_FREQUENCY = 20;

const KEY_MAXIMUM_CUT_OFF = 0.8;
const NOTE_UPDATE_PERIOD_MS = 100;

/** @typedef {{noteString: string, octaveNumber: number, midiNumber: number, frequency: number, error: number}} Note */

/**
 * @param {number[] | Uint8Array | Float32Array} data
 * @returns {[number, number]}
 */
const interpolateMax = (data, index) => {
  const y1 = data[index - 1];
  const y2 = data[index];
  const y3 = data[index + 1];

  const a = (y1 + y3 - 2 * y2) / 2;
  const b = (y3 - y1) / 2;
  const peakX = index - b / (2 * a);
  const peakY = y2 - (peakX - index) * (peakX - index) * a;

  return [peakX, peakY];
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
 * @param {Float32Array} nDash the array where results are stored
 * @param {number[] | Float32Array} data
 * @param {number} sampleRate
 */
const correlationFunction = (nDash, data, sampleRate) => {
  const startIndex = Math.ceil(sampleRate / MAX_NOTE_FREQUENCY);
  const endIndex = Math.floor(sampleRate / MIN_NOTE_FREQUENCY);

  for (let tau = 0; tau < nDash.length; tau++) {
    if (tau < startIndex || tau > endIndex) {
      nDash[tau] = 0;
    } else {
      let rDash = 0;
      let mDash = 0;
      for (let j = 0; j < data.length - tau; j++) {
        rDash += data[j] * data[j + tau];
        mDash += Math.pow(data[j], 2) + Math.pow(data[j + tau], 2);
      }

      nDash[tau] = (2 * rDash) / mDash;
    }
  }
};

/**
 * @param {Float32Array} data
 * @returns {number[]}
 */
const findPeaks = (data, thresholdFactor) => {
  const averagedData = data.map((value, index) => {
    return (data[index - 1] + value + data[index + 1]) / 3;
  });

  let maxValue = 0;
  const positiveSlopeStarts = [];

  const maximumPoints = averagedData.reduce((maximumPoints, value, index) => {
    if (averagedData[index - 1] < 0 && value >= 0) {
      positiveSlopeStarts.push(index);
    }

    if (positiveSlopeStarts.length) {
      if (
        value > 0 &&
        averagedData[index - 1] <= value &&
        averagedData[index + 1] <= value
      ) {
        const [peakX, peakY] = interpolateMax(averagedData, index);
        maximumPoints[maximumPoints.length] = [peakX, peakY];

        if (peakY > maxValue) {
          maxValue = peakY;
        }
      }
    }
    return maximumPoints;
  }, []);

  const threshold = maxValue * thresholdFactor;
  const results = [];

  positiveSlopeStarts.forEach((slopeStartIndex, index) => {
    const nextSlopeStart = positiveSlopeStarts[index + 1] ?? data.length;

    const matchingPoints = maximumPoints.filter(
      ([x]) => x >= slopeStartIndex && x < nextSlopeStart
    );

    const highestPoint = matchingPoints.sort(([, a], [, b]) => b - a)[0];
    if (highestPoint?.[1] > threshold) {
      results.push(highestPoint[0]);
    }
  });

  return results;
};

/** @typedef {{
 *   sampleRate: number,
 *   audioContext: AudioContext,
 *   audioAnalyser: AnalyserNode,
 *   timer?: number,
 *   mediaStream: MediaStream,
 *   harmonics: number[] | null,
 *   note: Note | null,
 *   showHarmonics: boolean,
 *   showFrequencies: boolean
 * }} TunerState
 */

/**
 * @param {Partial<TunerState>} initialSettings
 * @returns {Promise<TunerState>}
 */
const createTunerState = async (initialSettings = {}) => {
  const audioContext = new window.AudioContext();

  try {
    const sampleRate = audioContext.sampleRate;
    const audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.minDecibels = -100;
    audioAnalyser.maxDecibels = -10;
    audioAnalyser.smoothingTimeConstant = 0.75;
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
      note: null,
      harmonics: null,
      showHarmonics: true,
      showFrequencies: true,
      ...initialSettings,
      audioContext,
      audioAnalyser,
      sampleRate,
      mediaStream,
    };
  } catch (error) {
    audioContext.close();
    throw error;
  }
};

/** @param {{ canvas: HTMLCanvasElement }} options */
export const create = ({ canvas: tunerCanvas }) => {
  /** @type TunerState | null */
  let tunerState = null;

  /**
   * @param {{ onNote: (note: Note | null, harmonics: number[]) => void, showHarmonics: boolean, showFrequencies: boolean }} settings
   */
  const start = async ({ onNote, showHarmonics, showFrequencies }) => {
    if (tunerState) {
      stop();
    }

    tunerState = await createTunerState({
      showFrequencies,
      showHarmonics,
    });

    const { audioContext, audioAnalyser, mediaStream, sampleRate } = tunerState;
    const maxFrequency = sampleRate / 2;

    const audioSource = audioContext.createMediaStreamSource(mediaStream);
    audioSource.connect(audioAnalyser);

    const frequencyAnalysis = new Uint8Array(audioAnalyser.frequencyBinCount);
    const frequencyBucketWidth = maxFrequency / frequencyAnalysis.length;

    const findHarmonicIntensities = () => {
      if (!tunerState || !tunerState.note) {
        return [];
      }

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

    const timeDomainBuffer = new Float32Array(audioAnalyser.fftSize);
    const correlationResults = new Float32Array(audioAnalyser.fftSize);

    const drawCorrelationResults = (keyMaxima = []) => {
      canvasContext.save();
      canvasContext.clearRect(0, 0, tunerCanvas.width, tunerCanvas.height);

      const heightMultiplier = tunerCanvas.height / 2;
      canvasContext.fillStyle = "white";

      correlationResults.forEach((magnitude, index) => {
        canvasContext.fillRect(
          (2 * index * tunerCanvas.width) / correlationResults.length,
          tunerCanvas.height / 2,
          tunerCanvas.width / correlationResults.length,
          -1 * magnitude * heightMultiplier
        );
      });

      canvasContext.fillStyle = "hotpink";
      keyMaxima.forEach((maximum) => {
        canvasContext.fillRect(
          (2 * maximum * tunerCanvas.width) / correlationResults.length,
          tunerCanvas.height,
          2,
          -2 * heightMultiplier
        );
      });

      canvasContext.restore();
    };

    const findNote = () => {
      audioAnalyser.getFloatTimeDomainData(timeDomainBuffer);
      correlationFunction(correlationResults, timeDomainBuffer, sampleRate);

      const keyMaxima = findPeaks(
        correlationResults,
        KEY_MAXIMUM_CUT_OFF
      ).filter((maximum) => maximum >= 0);

      const frequency = keyMaxima[0] ? sampleRate / keyMaxima[0] : null;
      const note = Note.create(frequency);

      if (tunerState) {
        tunerState.note = note;
        tunerState.harmonics = findHarmonicIntensities();
        onNote(note, tunerState.harmonics);
      }
    };

    const canvasContext = tunerCanvas.getContext("2d");

    if (!canvasContext) {
      throw new Error("Can't get canvas context");
    }

    const maxInterestingBucket = Math.ceil(
      MAX_INTERESTING_FREQUENCY / frequencyBucketWidth
    );

    const minInterestingBucket = Math.floor(
      MIN_INTERESTING_FREQUENCY / frequencyBucketWidth
    );

    const bucketWidth = Math.ceil(
      tunerCanvas.width / (maxInterestingBucket - minInterestingBucket)
    );

    const drawHarmonics = ({ height }) => {
      if (!canvasContext) {
        return;
      }

      if (!tunerState || !tunerState.note) {
        return;
      }

      canvasContext.save();
      const heightMultiplier = height / 100;

      const gradient = canvasContext.createLinearGradient(0, height, 0, 0);
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

      canvasContext.fillStyle = gradient;

      const bucketPadding = 20;
      const bucketWidth = tunerCanvas.width / 12;

      tunerState.harmonics?.forEach((magnitude, bucket) => {
        canvasContext.fillRect(
          bucket * bucketWidth + bucketPadding / 2,
          height,
          bucketWidth - bucketPadding,
          -1 * magnitude * heightMultiplier
        );
      });

      canvasContext.restore();
    };

    const drawFrequencies = ({ height = 0, yOffset = 0 }) => {
      if (!tunerState) {
        return;
      }

      audioAnalyser.getByteFrequencyData(frequencyAnalysis);

      canvasContext.save();
      const heightMultiplier = height / 255;

      const gradient = canvasContext.createLinearGradient(
        0,
        height + yOffset,
        0,
        tunerCanvas.height - height
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

      canvasContext.fillStyle = gradient;

      frequencyAnalysis.forEach((magnitude, bucket) => {
        if (bucket < minInterestingBucket || bucket > maxInterestingBucket) {
          return;
        }
        canvasContext.fillRect(
          (bucket - minInterestingBucket) * bucketWidth,
          height + yOffset,
          bucketWidth,
          -1 * magnitude * heightMultiplier
        );
      });

      canvasContext.restore();
    };

    const drawGraphics = () => {
      canvasContext.clearRect(0, 0, tunerCanvas.width, tunerCanvas.height);

      const frequencyOptions =
        tunerState?.showFrequencies && tunerState?.showHarmonics
          ? { height: tunerCanvas.height / 2, yOffset: tunerCanvas.height / 2 }
          : tunerState?.showFrequencies
          ? { height: tunerCanvas.height, yOffset: 0 }
          : { height: 0, yOffset: 0 };

      const harmonicsHeight =
        tunerState?.showFrequencies && tunerState?.showHarmonics
          ? tunerCanvas.height / 2
          : tunerState?.showHarmonics
          ? tunerCanvas.height
          : 0;

      drawFrequencies(frequencyOptions);
      drawHarmonics({ height: harmonicsHeight });
      window.requestAnimationFrame(drawGraphics);
    };

    const updateNote = () => {
      findNote();

      if (tunerState) {
        tunerState.timer = setTimeout(updateNote, NOTE_UPDATE_PERIOD_MS);
      }
    };

    drawGraphics();
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
    setShowHarmonics: (newValue = false) => {
      if (tunerState) {
        tunerState.showHarmonics = newValue;
      }
    },
    setShowFrequencies: (newValue = false) => {
      if (tunerState) {
        tunerState.showFrequencies = newValue;
      }
    },
  };
};
