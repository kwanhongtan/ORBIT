export const environments = {
  station: "Space station",
  lunar_surface: "Lunar surface"
};

export const activities = {
  routine: "Routine",
  post_exercise: "After exercise",
  pre_eva: "Before EVA",
  post_eva: "After EVA"
};

export type Environment = keyof typeof environments;
export type Activity = keyof typeof activities;

export function readingContext(reading: { activity?: Activity; environment?: Environment }) {
  return [
    reading.environment && environments[reading.environment],
    reading.activity && activities[reading.activity]
  ].filter(Boolean).join(" · ");
}
