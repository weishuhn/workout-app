// Exercise library — data only. See docs/superpowers/specs/2026-10-15-workout-timer-design.md.

export const GROUPS = ['push', 'pull', 'legs', 'core', 'cardio'];
export const EQUIPMENT = ['none', 'bar', 'chair', 'rings'];
export const RING_HEIGHTS = ['low', 'waist'];

export const GROUP_LABELS = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  core: 'Core',
  cardio: 'Cardio',
};

// `target` is { reps: n } or { holdSec: n } — the default goal in reps mode.
function exercise(group, equipment, id, name, cue, target, { ringHeight, sided = false } = {}) {
  const record = { id, name, group, equipment, sided, cue, ...target };
  if (ringHeight) record.ringHeight = ringHeight;
  return record;
}

export const EXERCISES = [
  // Push
  exercise('push', 'none', 'push-ups', 'Push-ups', 'Body in one straight line, chest to the floor', { reps: 15 }),
  exercise('push', 'none', 'wide-push-ups', 'Wide push-ups', 'Hands wider than shoulders, lower slowly', { reps: 12 }),
  exercise('push', 'none', 'diamond-push-ups', 'Diamond push-ups', 'Hands together under chest, elbows tight', { reps: 10 }),
  exercise('push', 'none', 'pike-push-ups', 'Pike push-ups', 'Hips high, lower your head toward the floor', { reps: 10 }),
  exercise('push', 'chair', 'decline-push-ups', 'Decline push-ups', 'Feet on the chair, core braced', { reps: 12 }),
  exercise('push', 'chair', 'chair-dips', 'Chair dips', 'Shoulders down, elbows straight back', { reps: 15 }),
  exercise('push', 'rings', 'ring-push-ups', 'Ring push-ups', 'Rings close to your body, turn out at the top', { reps: 10 }, { ringHeight: 'low' }),
  exercise('push', 'rings', 'ring-dips', 'Ring dips', 'Knees bent, lean forward slightly, lock out at the top', { reps: 8 }, { ringHeight: 'waist' }),
  exercise('push', 'rings', 'ring-support-hold', 'Ring support hold', 'Arms locked, shoulders down, rings by your hips', { holdSec: 30 }, { ringHeight: 'waist' }),

  // Pull
  exercise('pull', 'none', 'superman-hold', 'Superman hold', 'Lift chest and legs, squeeze your glutes', { holdSec: 30 }),
  exercise('pull', 'none', 'reverse-snow-angels', 'Reverse snow angels', 'Face down, sweep arms from hips to overhead', { reps: 12 }),
  exercise('pull', 'none', 'prone-ytw-raises', 'Prone Y-T-W raises', 'Face down, thumbs up, squeeze shoulder blades', { reps: 8 }),
  exercise('pull', 'bar', 'pull-ups', 'Pull-ups', 'From a full hang to chin over the bar', { reps: 6 }),
  exercise('pull', 'bar', 'chin-ups', 'Chin-ups', 'Palms facing you, chest to the bar', { reps: 6 }),
  exercise('pull', 'bar', 'scapular-pull-ups', 'Scapular pull-ups', 'Straight arms, pull shoulders down and back', { reps: 10 }),
  exercise('pull', 'chair', 'table-rows', 'Table rows', 'Under the table, body straight, chest to the edge', { reps: 12 }),
  exercise('pull', 'rings', 'steep-ring-rows', 'Steep ring rows', 'Walk feet forward, body straight, rings to ribs', { reps: 10 }, { ringHeight: 'low' }),
  exercise('pull', 'rings', 'ring-rows', 'Ring rows', 'Body straight, pull the rings to your ribs', { reps: 12 }, { ringHeight: 'waist' }),
  exercise('pull', 'rings', 'ring-face-pulls', 'Ring face pulls', 'Pull rings to your forehead, elbows high', { reps: 12 }, { ringHeight: 'waist' }),
  exercise('pull', 'rings', 'ring-y-raises', 'Ring Y-raises', 'Straight arms, raise into a Y overhead', { reps: 10 }, { ringHeight: 'waist' }),

  // Legs
  exercise('legs', 'none', 'squats', 'Squats', 'Chest up, hips below knees', { reps: 20 }),
  exercise('legs', 'none', 'jump-squats', 'Jump squats', 'Squat deep, explode up, land softly', { reps: 12 }),
  exercise('legs', 'none', 'reverse-lunges', 'Reverse lunges', 'Alternate legs, back knee just off the floor', { reps: 16 }),
  exercise('legs', 'none', 'glute-bridges', 'Glute bridges', 'Drive through heels, squeeze at the top', { reps: 20 }),
  exercise('legs', 'none', 'single-leg-glute-bridge', 'Single-leg glute bridge', 'Hips level, drive through one heel', { reps: 10 }, { sided: true }),
  exercise('legs', 'none', 'wall-sit', 'Wall sit', 'Thighs parallel to the floor, back flat on the wall', { holdSec: 45 }),
  exercise('legs', 'chair', 'bulgarian-split-squats', 'Bulgarian split squats', 'Back foot on the chair, front knee over toes', { reps: 10 }, { sided: true }),
  exercise('legs', 'chair', 'step-ups', 'Step-ups', 'Drive through the top foot, stand tall', { reps: 12 }, { sided: true }),
  exercise('legs', 'rings', 'ring-bulgarian-split-squat', 'Ring Bulgarian split squat', 'Back foot in a ring, sink straight down', { reps: 10 }, { ringHeight: 'low', sided: true }),
  exercise('legs', 'rings', 'ring-hamstring-curls', 'Ring hamstring curls', 'Heels in the rings, hips up, curl heels in', { reps: 10 }, { ringHeight: 'low' }),

  // Core
  exercise('core', 'none', 'plank', 'Plank', 'Elbows under shoulders, squeeze glutes', { holdSec: 45 }),
  exercise('core', 'none', 'hollow-hold', 'Hollow hold', 'Lower back pressed down, arms and legs long', { holdSec: 30 }),
  exercise('core', 'none', 'mountain-climbers', 'Mountain climbers', 'Hips low, drive knees fast', { reps: 30 }),
  exercise('core', 'none', 'bicycle-crunches', 'Bicycle crunches', 'Elbow to opposite knee, slow and controlled', { reps: 20 }),
  exercise('core', 'none', 'side-plank', 'Side plank', 'Hips high, body in one line', { holdSec: 30 }, { sided: true }),
  exercise('core', 'bar', 'hanging-knee-raises', 'Hanging knee raises', 'No swinging, knees to chest', { reps: 10 }),
  exercise('core', 'rings', 'ring-fallouts', 'Ring fallouts', 'From your knees, roll out with a tight core', { reps: 10 }, { ringHeight: 'low' }),
  exercise('core', 'rings', 'ring-knee-tucks', 'Ring knee tucks', 'Feet in the rings, plank, pull knees to chest', { reps: 12 }, { ringHeight: 'low' }),

  // Cardio
  exercise('cardio', 'none', 'burpees', 'Burpees', 'Chest to the floor, jump at the top', { reps: 10 }),
  exercise('cardio', 'none', 'jumping-jacks', 'Jumping jacks', 'Stay light on the balls of your feet', { reps: 40 }),
  exercise('cardio', 'none', 'high-knees', 'High knees', 'Knees to hip height, pump your arms', { reps: 40 }),
  exercise('cardio', 'none', 'skaters', 'Skaters', 'Leap side to side, land soft on one foot', { reps: 20 }),
  exercise('cardio', 'none', 'squat-thrusts', 'Squat thrusts', 'Hands down, kick back to plank, jump in', { reps: 15 }),
  exercise('cardio', 'none', 'seal-jacks', 'Seal jacks', 'Clap arms wide in front, jump feet out', { reps: 30 }),
];
