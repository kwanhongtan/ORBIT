const standardTimes = { sleep_duration: "08:00", heart_rate: "09:00", mood: "18:00" };
const surfaceTimes = { sleep_duration: "07:00", heart_rate: "08:00", mood: "19:00" };

const presets = {
  station: standardTimes,
  spacecraft: standardTimes,
  lunar_orbit: standardTimes,
  lunar_surface: surfaceTimes,
  mars_surface: surfaceTimes,
  surface_rover: surfaceTimes,
  earth_analog: standardTimes
};

export const activities = ["routine", "post_exercise", "pre_eva", "post_eva"];

export function validEnvironment(environment) {
  return typeof environment === "string" && Object.hasOwn(presets, environment);
}

export function validRoutineTimes(times) {
  const metrics = Object.keys(presets.station);
  return times && Object.keys(times).length === metrics.length &&
    metrics.every((metric) =>
      typeof times[metric] === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(times[metric]));
}

export function missionRoutine(state, member, now = new Date()) {
  const environment = member.environment ?? "station";
  const day = now.toISOString().slice(0, 10);
  const completed = new Set(state.measurements.filter((row) =>
    row.crew_id === member.crew_id && row.routine_day === day).map((row) => row.metric_type));
  const savedTimes = environment === "station" ? member.routine_times : undefined;
  const times = member.routine_schedules?.[environment] ?? savedTimes ?? presets[environment];
  const tasks = Object.entries(times).map(([metric, time]) => {
    const due = `${day}T${time}:00.000Z`;
    return { metric, time, status: completed.has(metric) ? "Completed" : now >= new Date(due) ? "Overdue" : "Upcoming" };
  }).sort((first, second) => first.time.localeCompare(second.time));
  return { day, tasks, environment };
}
