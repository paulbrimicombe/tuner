// @ts-check

// TODO:
// - Make installable (icons)
// - Check tuning algorithm against different instruments
// - Improve dial contrast
// - Better display of error cents
// - Release audio context when stopped

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
    return;
  }

  const { noteString, octaveNumber, frequency, error } = note;
  // messageDiv.innerHTML = "";
  // const noteSpan = document.createElement("span");
  // noteSpan.classList.add("note");
  // const octaveSup = document.createElement("sup");
  // octaveSup.classList.add("octave");
  // const frequencySpan = document.createElement("span");
  // frequencySpan.classList.add("frequency");
  // const errorSpan = document.createElement("span");
  // errorSpan.classList.add("error");

  noteSpan.textContent = noteString;
  octaveSup.innerText = octaveNumber.toString();
  // frequencySpan.innerText = `${Math.round(frequency)}Hz`;
  errorSpan.innerText = `${Math.round(100 * 100 * error) / 100.0}`;

  // noteSpan.appendChild(octaveSup);
  // messageDiv.appendChild(noteSpan);
  // messageDiv.appendChild(frequencySpan);
  // messageDiv.appendChild(errorSpan);

  if (dialDiv && !Number.isNaN(error)) {
    dialDiv.style.setProperty("--tuner-error", String(error));
  }
};

goButton.onchange = (event) => {
  if (event.target.checked) {
    tuner.start(onNote);
  } else {
    tuner.stop();
  }
};
