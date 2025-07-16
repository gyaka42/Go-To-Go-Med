import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

const MEDICATIONS_KEY = "@medications";
const DOSE_HISTORY_KEY = "@dose_history";

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  times: string[];
  startDate: string;
  duration: string;
  color: string;
  reminderEnabled: boolean;
  currentSupply: number;
  totalSupply: number;
  refillAt: number;
  refillReminder: boolean;
  lastRefillDate?: string;
}

export interface DoseHistory {
  id: string;
  medicationId: string;
  scheduledTime: string;
  timestamp: string;
  taken: boolean;
}

export async function getMedications(): Promise<Medication[]> {
  try {
    const data = await AsyncStorage.getItem(MEDICATIONS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error getting medications:", error);
    return [];
  }
}

export async function addMedication(medication: Medication): Promise<void> {
  try {
    const medications = await getMedications();
    medications.push(medication);
    await AsyncStorage.setItem(MEDICATIONS_KEY, JSON.stringify(medications));
  } catch (error) {
    console.error("Error adding medication:", error);
    throw error;
  }
}

export async function updateMedication(
  updatedMedication: Medication
): Promise<void> {
  try {
    const medications = await getMedications();
    const index = medications.findIndex(
      (med) => med.id === updatedMedication.id
    );
    if (index !== -1) {
      medications[index] = updatedMedication;
      await AsyncStorage.setItem(MEDICATIONS_KEY, JSON.stringify(medications));
    }
  } catch (error) {
    console.error("Error updating medication:", error);
    throw error;
  }
}

export async function deleteMedication(id: string): Promise<void> {
  try {
    const medications = await getMedications();
    const updatedMedications = medications.filter((med) => med.id !== id);
    await AsyncStorage.setItem(
      MEDICATIONS_KEY,
      JSON.stringify(updatedMedications)
    );
  } catch (error) {
    console.error("Error deleting medication:", error);
    throw error;
  }
}

export async function getDoseHistory(): Promise<DoseHistory[]> {
  try {
    const data = await AsyncStorage.getItem(DOSE_HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error getting dose history:", error);
    return [];
  }
}

export async function getTodaysDoses(): Promise<DoseHistory[]> {
  try {
    const history = await getDoseHistory();
    const today = new Date().toDateString();
    return history.filter(
      (dose) => new Date(dose.timestamp).toDateString() === today
    );
  } catch (error) {
    console.error("Error getting today's doses:", error);
    return [];
  }
}

export async function recordDose(
  medicationId: string,
  scheduledTime: string,
  taken: boolean,
  timestamp: string
): Promise<void> {
  try {
    const history = await getDoseHistory();
    const existingIndex = history.findIndex(
      (dose) =>
        dose.medicationId === medicationId &&
        dose.scheduledTime === scheduledTime &&
        new Date(dose.timestamp).toDateString() ===
          new Date(timestamp).toDateString()
    );

    let decrementSupply = false;
    if (existingIndex !== -1) {
      decrementSupply = taken && !history[existingIndex].taken;
      history[existingIndex] = {
        ...history[existingIndex],
        taken,
        timestamp,
      };
    } else {
      history.push({
        id: Math.random().toString(36).substr(2, 9),
        medicationId,
        scheduledTime,
        timestamp,
        taken,
      });
      decrementSupply = taken;
    }

    history.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    await AsyncStorage.setItem(DOSE_HISTORY_KEY, JSON.stringify(history));

    // Update medication supply if taken
    if (decrementSupply) {
      const medications = await getMedications();
      const medication = medications.find((med) => med.id === medicationId);
      if (medication && medication.currentSupply > 0) {
        medication.currentSupply -= 1;
        await updateMedication(medication);
      }
    }
  } catch (error) {
    console.error("Error recording dose:", error);
    throw error;
  }
}

export async function clearAllData(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.multiRemove([MEDICATIONS_KEY, DOSE_HISTORY_KEY]);
  } catch (error) {
    console.error("Error clearing data:", error);
    throw error;
  }
}
/**
 * Ensure missed doses are recorded in history.
 * This creates a history entry with `taken: false` for any
 * scheduled dose that has passed without being marked as taken.
 */
export async function syncMissedDoses(): Promise<void> {
  const [medications, history] = await Promise.all([
    getMedications(),
    getDoseHistory(),
  ]);

  const now = new Date();
  let updated = false;

  for (const medication of medications) {
    const start = new Date(medication.startDate);
    start.setHours(0, 0, 0, 0);

    const durationDays = parseInt(medication.duration.split(" ")[0]);
    const totalDays =
      isNaN(durationDays) || durationDays === -1
        ? Math.floor((now.getTime() - start.getTime()) / 86400000) + 1
        : Math.min(
            durationDays,
            Math.floor((now.getTime() - start.getTime()) / 86400000) + 1
          );

    for (let d = 0; d < totalDays; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + d);
      if (date > now) break;

      if (medication.times.length === 0) {
        continue; // as-needed medications cannot be automatically missed
      }

      for (const time of medication.times) {
        const [h, m] = time.split(":").map(Number);
        const scheduled = new Date(date);
        scheduled.setHours(h, m, 0, 0);
        if (scheduled > now) continue;

        const exists = history.find(
          (dose) =>
            dose.medicationId === medication.id &&
            dose.scheduledTime === time &&
            new Date(dose.timestamp).toDateString() === scheduled.toDateString()
        );

        if (!exists) {
          history.push({
            id: Math.random().toString(36).substr(2, 9),
            medicationId: medication.id,
            scheduledTime: time,
            timestamp: scheduled.toISOString(),
            taken: false,
          });
          updated = true;
        }
      }
    }
  }

  if (updated) {
    history.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    await AsyncStorage.setItem(DOSE_HISTORY_KEY, JSON.stringify(history));
  }
}
