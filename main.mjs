// @ts-check

import * as Tuner from "./tuner.mjs";

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

const goButton = getById("go");
const dialDiv = getById("tuner-dial");
const flatDiv = getBySelector("#lights .flat");
const sharpDiv = getBySelector("#lights .sharp");
const inTuneDiv = getBySelector("#lights .in-tune");
const noteSpan = getBySelector("#note .note");
const octaveSup = getBySelector("#note .octave");

const tunerCanvas = getById("frequencies");

if (!(tunerCanvas instanceof HTMLCanvasElement)) {
  throw new Error("No tuner canvas found!");
}

const tuner = Tuner.create(tunerCanvas);

/**
 * @param {import('./tuner.mjs').Note | null} note
 */
const onNote = (note) => {
  if (note === null) {
    noteSpan.textContent = "\xa0";
    octaveSup.textContent = "\xa0";
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

    flatDiv.classList.remove("on");
    sharpDiv.classList.remove("on");
    inTuneDiv.classList.remove("on");

    if (error < -0.01) {
      flatDiv.classList.add("on");
    } else if (error > 0.01) {
      sharpDiv.classList.add("on");
    }

    if (Math.abs(error) < 0.05) {
      inTuneDiv.classList.add("on");
    }
  }
};

/** @type {WakeLock | null} */
let wakeLock = null;

goButton.onchange = async (event) => {
  try {
    if (event.target.checked) {
      wakeLock?.release();
      wakeLock = await requestWakeLock();
      tuner.start(onNote);
    } else {
      wakeLock?.release();
      tuner.stop();
      onNote(null);
    }
  } catch (e) {
    wakeLock?.release();
    throw e;
  }
};
