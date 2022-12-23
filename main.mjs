// @ts-check

import * as Tuner from "./tuner.mjs";

const goButton = document.getElementById("go");

if (!goButton) {
  throw new Error("No go button found!");
}

const dialDiv = document.getElementById("tuner-dial");

if (!dialDiv) {
  throw new Error("No dial found!");
}

const messageDiv = document.getElementById("tuner-message");

if (!messageDiv) {
  throw new Error("No note message container found!");
}

const tunerCanvas = document.getElementById("frequencies");

if (!(tunerCanvas instanceof HTMLCanvasElement)) {
  throw new Error("No tuner canvas found!");
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
  messageDiv.innerHTML = "";
  const noteSpan = document.createElement("span");
  noteSpan.classList.add("note");
  const octaveSup = document.createElement("sup");
  octaveSup.classList.add("octave");
  const frequencySpan = document.createElement("span");
  frequencySpan.classList.add("frequency");
  const errorSpan = document.createElement("span");
  errorSpan.classList.add("error");

  noteSpan.innerText = noteString;
  octaveSup.innerText = String(octaveNumber);
  frequencySpan.innerText = `${Math.round(frequency)}Hz`;
  errorSpan.innerText = `${Math.round(100 * 100 * error) / 100.0}`;

  noteSpan.appendChild(octaveSup);
  messageDiv.appendChild(noteSpan);
  messageDiv.appendChild(frequencySpan);
  messageDiv.appendChild(errorSpan);

  if (dialDiv && !Number.isNaN(error)) {
    dialDiv.style.setProperty("--angle", String(60 * error));
  }
};

goButton.onchange = (event) => {
  if (event.target.checked) {
    tuner.start(onNote);
  } else {
    tuner.stop();
  }
};
