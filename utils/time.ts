import { Medication } from "./storage";

/**
 * Check if a medication can be taken at the given date/time.
 * It returns false for future dates or when the scheduled
 * time has not yet passed on the current day.
 */
export function isMedicationDue(
  medication: Medication,
  date: Date = new Date()
): boolean {
  const now = new Date();

  // Compare only the date portions
  const selectedDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Future dates are not due
  if (selectedDate > today) {
    return false;
  }

  // If there are no scheduled times (as needed) or date is in the past
  if (medication.times.length === 0 || selectedDate < today) {
    return true;
  }

  // Same day: check if any scheduled time has passed
  return medication.times.some((t) => {
    const [h, m] = t.split(":").map(Number);
    const due = new Date(selectedDate);
    due.setHours(h, m, 0, 0);
    return now >= due;
  });
}

/**
 * Determine if a medication is active on the provided date based on its
 * start date and duration. Durations that don't begin with a number are
 * treated as ongoing.
 */
export function isMedicationActiveOnDate(
  medication: Medication,
  date: Date = new Date()
): boolean {
  const start = new Date(medication.startDate);
  start.setHours(0, 0, 0, 0);

  const check = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const durationDays = parseInt(medication.duration.split(" ")[0]);

  // Non-numeric durations are considered ongoing (-1)
  if (isNaN(durationDays) || durationDays === -1) {
    return check >= start;
  }

  const end = new Date(start);
  // Inclusive of the last day
  end.setDate(end.getDate() + durationDays - 1);

  return check >= start && check <= end;
}
