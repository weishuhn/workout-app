// Full-screen enlarged exercise picture. Tap anywhere, the close button or Escape to dismiss.

import { viewerFrames } from './photos.js';

const $ = (id) => document.getElementById(id);

let opener = null;

export function isViewerOpen() {
  return !$('viewer').hidden;
}

function frameFigure(exercise, { src, label }) {
  const figure = document.createElement('figure');
  figure.className = 'viewer-frame';
  const img = document.createElement('img');
  img.src = src;
  img.alt = label ? `${exercise.name} — ${label.toLowerCase()}` : exercise.name;
  if (label) {
    const caption = document.createElement('figcaption');
    caption.textContent = label;
    figure.append(caption);
  }
  figure.append(img);
  return figure;
}

export function openViewer(exercise) {
  const frames = viewerFrames(exercise.id);
  if (frames.length === 0) return;
  opener = document.activeElement;
  $('viewer-name').textContent = exercise.name;
  $('viewer-cue').textContent = exercise.cue;
  $('viewer-frames').replaceChildren(...frames.map((frame) => frameFigure(exercise, frame)));
  $('viewer').hidden = false;
  $('viewer-close').focus();
}

export function closeViewer() {
  if (!isViewerOpen()) return;
  $('viewer').hidden = true;
  $('viewer-frames').replaceChildren();
  // The opener may have been re-rendered or hidden meanwhile; focus() is then a harmless no-op.
  if (opener?.isConnected) opener.focus();
  opener = null;
}

// Any tap on the overlay closes it (the close button included, as its click bubbles up).
$('viewer').addEventListener('click', closeViewer);
document.addEventListener('keydown', (event) => {
  if (!isViewerOpen()) return;
  if (event.key === 'Escape') closeViewer();
  // Only the close button is focusable while the dialog is modal.
  else if (event.key === 'Tab') {
    event.preventDefault();
    $('viewer-close').focus();
  }
});
