// @ts-check

// TODO:
// - Make installable (icons)
// - Check tuning algorithm against different instruments
// - Better display of error cents

import * as Tuner from "./tuner.mjs";

if (window.location.host !== null && navigator.serviceWorker != null) {
  navigator.serviceWorker
    .register("service-worker.js")
    .then(function (registration) {
      console.log("Registered events at scope: ", registration.scope);
    })
    .catch((error) => {
      console.error("Failed to register service worker", error);
    });
}

const goButton = document.getElementById("go");

if (!goButton) {
  throw new Error("No go button found!");
}

const dialDiv = document.getElementById("tuner-dial");

if (!dialDiv) {
  throw new Error("No dial found!");
}

const tunerCanvas = document.getElementById("frequencies");

if (!(tunerCanvas instanceof HTMLCanvasElement)) {
  throw new Error("No tuner canvas found!");
}

const noteSpan = document.querySelector("#note .note");

if (!(noteSpan instanceof HTMLElement)) {
  throw new Error("No note container found!");
}

const octaveSup = document.querySelector("#note .octave");

if (!(octaveSup instanceof HTMLElement)) {
  throw new Error("No note octave number container found!");
}

const errorSpan = document.querySelector("#frequency .error");

if (!(errorSpan instanceof HTMLElement)) {
  throw new Error("No note error frequency container found!");
}

const tuner = Tuner.create(tunerCanvas);

/**
 * @param {import('./tuner.mjs').Note | null} note
 */
const onNote = (note) => {
  if (note === null) {
    noteSpan.textContent = "-";
    octaveSup.textContent = "\xa0";
    errorSpan.textContent = "\xa0";
    return;
  }

  const { noteString, octaveNumber, error } = note;

  noteSpan.textContent = noteString;
  octaveSup.textContent = octaveNumber.toString();
  errorSpan.textContent = `${Math.round(100 * 100 * error) / 100.0}`;

  if (dialDiv && !Number.isNaN(error)) {
    dialDiv.style.setProperty("--tuner-error", String(error));
  }
};

goButton.onchange = (event) => {
  if (event.target.checked) {
    tuner.start(onNote);
  } else {
    tuner.stop();
    onNote(null);
  }
};
