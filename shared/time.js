export function zonedInput(value, timeZone) {
  if (!value) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map((p) => [p.type, p.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function zonedISO(value, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Enter a valid date and time.");
  const target = Date.parse(value + "Z");
  let result = target;
  for (let i = 0; i < 3; i++) {
    const observed = Date.parse(zonedInput(new Date(result), timeZone) + "Z");
    result += target - observed;
  }
  if (zonedInput(new Date(result), timeZone) !== value)
    throw new Error("That local time does not exist in the selected timezone.");
  return new Date(result).toISOString();
}
