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
