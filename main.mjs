// @ts-check

import * as Tuner from "./tuner.mjs";

if (window.location.host !== null && navigator.serviceWorker != null) {
  navigator.serviceWorker.register("service-worker.js").catch((error) => {
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

const flatDiv = document.querySelector("#lights .flat");
const sharpDiv = document.querySelector("#lights .sharp");
const inTuneDiv = document.querySelector("#lights .in-tune");

if (!flatDiv || !sharpDiv || !inTuneDiv) {
  throw new Error("One or more tuning lights not found!");
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

const tuner = Tuner.create(tunerCanvas);

/**
 * @param {import('./tuner.mjs').Note | null} note
 */
const onNote = (note) => {
  if (note === null) {
    noteSpan.textContent = "-";
    octaveSup.textContent = "\xa0";
    return;
  }

  const { noteString, octaveNumber, error } = note;

  noteSpan.textContent = noteString;
  octaveSup.textContent = octaveNumber.toString();

  if (dialDiv && !Number.isNaN(error)) {
    dialDiv.style.setProperty("--tuner-error", String(error));

    flatDiv.classList.remove("on");
    sharpDiv.classList.remove("on");
    inTuneDiv.classList.remove("on");

    if (error < -0.01) {
      flatDiv.classList.add("on");
    } else if (error > 0.01) {
      sharpDiv.classList.add("on");
    }

    if (Math.abs(error) < 0.02) {
      inTuneDiv.classList.add("on");
    }
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
