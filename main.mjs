// @ts-check

import * as Tuner from "./tuner.mjs";

const NBSP = "\xa0";

if (window.location.host !== null && navigator.serviceWorker != null) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch((error) => {
      console.error("Failed to register service worker", error);
    });
  });
}

/** @typedef {{ release: () => void }} WakeLock */

/**
 * @returns {Promise<WakeLock | null>}
 */
const requestWakeLock = async () => {
  try {
    // @ts-ignore
    return await navigator.wakeLock.request();
  } catch (err) {
    console.log(`Unable to keep screen awake: ${err.name}, ${err.message}`);
    return null;
  }
};

const getById = (id) => {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`No HTML element with id ${id} found`);
  }
  return element;
};

const getBySelector = (selector) => {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`No HTML element with selector ${selector} found`);
  }
  return element;
};

/**
 * @param {number | null} error the decimal tuning error
 * @param {{ sign: HTMLElement, value: HTMLElement, unit: HTMLElement}} errorElements
 */
const updateError = (error, { sign, value, unit }) => {
  if (error === null) {
    sign.textContent = NBSP;
    value.textContent = NBSP;
    unit.textContent = NBSP;
    return;
  }
  const fixedPrecision = Math.abs(error * 100).toFixed(0);

  const padded =
    fixedPrecision.length < 2
      ? fixedPrecision.length === 0
        ? `00`
        : `0${fixedPrecision}`
      : fixedPrecision;

  sign.textContent = error >= 0 ? "+" : "−";
  value.textContent = padded;
  unit.textContent = "¢";
};

const goButton = getById("go");

if (!(goButton instanceof HTMLInputElement)) {
  throw new Error("On / off button is not an input");
}

const dialDiv = getById("tuner-dial");
const flatDiv = getBySelector("#lights .flat");
const sharpDiv = getBySelector("#lights .sharp");
const inTuneDiv = getBySelector("#lights .in-tune");
const noteSpan = getBySelector("#note .note");
const octaveSup = getBySelector("#note .octave");
const errorElements = {
  sign: getBySelector("#error .sign"),
  value: getBySelector("#error .value"),
  unit: getBySelector("#error .unit"),
};

const tunerCanvas = getById("frequencies");

if (!(tunerCanvas instanceof HTMLCanvasElement)) {
  throw new Error("No tuner canvas found!");
}

const tuner = Tuner.create(tunerCanvas);

/** @type {WakeLock | null} */
let wakeLock = null;

/**
 * @param {import('./tuner.mjs').Note | null} note
 */
const onNote = async (note) => {
  if (!wakeLock) {
    wakeLock = await requestWakeLock();
  }

  if (note === null) {
    noteSpan.textContent = NBSP;
    octaveSup.textContent = NBSP;
    errorElements.sign.textContent = NBSP;
    errorElements.value.textContent = NBSP;
    errorElements.unit.textContent = NBSP;
    dialDiv.style.setProperty("--tuner-error", String(0));
    sharpDiv.classList.remove("on");
    inTuneDiv.classList.remove("on");
    flatDiv.classList.remove("on");
    return;
  }

  const { noteString, octaveNumber, error } = note;

  noteSpan.textContent = noteString;
  octaveSup.textContent = octaveNumber.toString();

  if (!Number.isNaN(error)) {
    dialDiv.style.setProperty("--tuner-error", String(error));
    updateError(error, errorElements);

    flatDiv.classList.remove("on");
    sharpDiv.classList.remove("on");
    inTuneDiv.classList.remove("on");

    if (error < -0.05) {
      flatDiv.classList.add("on");
    } else if (error > 0.05) {
      sharpDiv.classList.add("on");
    }

    if (Math.abs(error) < 0.8) {
      inTuneDiv.classList.add("on");
    }
  }
};

const start = async () => {
  wakeLock?.release();
  wakeLock = await requestWakeLock();
  tuner.start(onNote, "harmonics");
  tunerCanvas.classList.remove("hidden");
};

const stop = () => {
  wakeLock?.release();
  wakeLock = null;
  tuner.stop();
  tunerCanvas.classList.add("hidden");
  setTimeout(() => {
    const context = tunerCanvas.getContext("2d");
    context?.clearRect(0, 0, tunerCanvas.width, tunerCanvas.height);
  }, 500);

  onNote(null);
};

document.addEventListener("visibilitychange", () => {
  goButton.checked = false;
  stop();
});

goButton.addEventListener("change", async () => {
  try {
    if (goButton.checked) {
      await start();
    } else {
      stop();
    }
  } catch (e) {
    wakeLock?.release();
    wakeLock = null;
    throw e;
  }
});
