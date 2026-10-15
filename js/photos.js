// Exercise pictures: 1-2 frames per exercise id (two frames alternate start/end; a GIF animates itself).
// Sources are listed in img/exercises/SOURCES.md.

export const PHOTOS = {
  'push-ups': ['img/exercises/push-ups-0.jpg', 'img/exercises/push-ups-1.jpg'],
  'wide-push-ups': ['img/exercises/wide-push-ups-0.gif'],
  'diamond-push-ups': ['img/exercises/diamond-push-ups-0.jpg'],
  'pike-push-ups': ['img/exercises/pike-push-ups-0.jpg'],
  'decline-push-ups': ['img/exercises/decline-push-ups-0.jpg', 'img/exercises/decline-push-ups-1.jpg'],
  'chair-dips': ['img/exercises/chair-dips-0.jpg', 'img/exercises/chair-dips-1.jpg'],
  'ring-push-ups': ['img/exercises/ring-push-ups-0.jpg', 'img/exercises/ring-push-ups-1.jpg'],
  'ring-dips': ['img/exercises/ring-dips-0.jpg', 'img/exercises/ring-dips-1.jpg'],
  'ring-support-hold': ['img/exercises/ring-support-hold-0.jpg'],
  'superman-hold': ['img/exercises/superman-hold-0.jpg', 'img/exercises/superman-hold-1.jpg'],
  'reverse-snow-angels': ['img/exercises/reverse-snow-angels-0.jpg'],
  'prone-ytw-raises': ['img/exercises/prone-ytw-raises-0.jpg', 'img/exercises/prone-ytw-raises-1.jpg'],
  'pull-ups': ['img/exercises/pull-ups-0.jpg', 'img/exercises/pull-ups-1.jpg'],
  'chin-ups': ['img/exercises/chin-ups-0.jpg', 'img/exercises/chin-ups-1.jpg'],
  'scapular-pull-ups': ['img/exercises/scapular-pull-ups-0.jpg', 'img/exercises/scapular-pull-ups-1.jpg'],
  'table-rows': ['img/exercises/table-rows-0.jpg', 'img/exercises/table-rows-1.jpg'],
  'steep-ring-rows': ['img/exercises/steep-ring-rows-0.jpg'],
  'ring-rows': ['img/exercises/ring-rows-0.jpg', 'img/exercises/ring-rows-1.jpg'],
  'ring-face-pulls': ['img/exercises/ring-face-pulls-0.jpg'],
  'ring-y-raises': ['img/exercises/ring-y-raises-0.jpg'],
  'squats': ['img/exercises/squats-0.jpg', 'img/exercises/squats-1.jpg'],
  'jump-squats': ['img/exercises/jump-squats-0.jpg', 'img/exercises/jump-squats-1.jpg'],
  'reverse-lunges': ['img/exercises/reverse-lunges-0.jpg'],
  'glute-bridges': ['img/exercises/glute-bridges-0.jpg', 'img/exercises/glute-bridges-1.jpg'],
  'single-leg-glute-bridge': ['img/exercises/single-leg-glute-bridge-0.jpg', 'img/exercises/single-leg-glute-bridge-1.jpg'],
  'wall-sit': ['img/exercises/wall-sit-0.jpg'],
  'bulgarian-split-squats': ['img/exercises/bulgarian-split-squats-0.jpg'],
  'step-ups': ['img/exercises/step-ups-0.jpg'],
  'ring-bulgarian-split-squat': ['img/exercises/ring-bulgarian-split-squat-0.jpg', 'img/exercises/ring-bulgarian-split-squat-1.jpg'],
  'ring-hamstring-curls': ['img/exercises/ring-hamstring-curls-0.jpg'],
  'plank': ['img/exercises/plank-0.jpg'],
  'hollow-hold': ['img/exercises/hollow-hold-0.jpg'],
  'mountain-climbers': ['img/exercises/mountain-climbers-0.jpg', 'img/exercises/mountain-climbers-1.jpg'],
  'bicycle-crunches': ['img/exercises/bicycle-crunches-0.jpg', 'img/exercises/bicycle-crunches-1.jpg'],
  'side-plank': ['img/exercises/side-plank-0.jpg', 'img/exercises/side-plank-1.jpg'],
  'hanging-knee-raises': ['img/exercises/hanging-knee-raises-0.gif'],
  'ring-fallouts': ['img/exercises/ring-fallouts-0.jpg'],
  'ring-knee-tucks': ['img/exercises/ring-knee-tucks-0.jpg', 'img/exercises/ring-knee-tucks-1.jpg'],
  'burpees': ['img/exercises/burpees-0.gif'],
  'jumping-jacks': ['img/exercises/jumping-jacks-0.jpg'],
  'high-knees': ['img/exercises/high-knees-0.jpg'],
  'skaters': ['img/exercises/skaters-0.gif'],
  'squat-thrusts': ['img/exercises/squat-thrusts-0.jpg'],
  'seal-jacks': ['img/exercises/seal-jacks-0.gif'],
};

export function photoFrames(exerciseId) {
  return Object.hasOwn(PHOTOS, exerciseId) ? PHOTOS[exerciseId] : [];
}

// The frame to show `elapsedSec` into a phase: two-frame sets flip every second, otherwise the only frame.
export function photoFrame(exerciseId, elapsedSec) {
  const frames = photoFrames(exerciseId);
  if (frames.length === 0) return null;
  const sec = Number.isFinite(elapsedSec) ? Math.max(0, Math.floor(elapsedSec)) : 0;
  return frames[sec % frames.length];
}
