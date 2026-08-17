import i18n from "./i18n";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { Medication } from "./storage";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<
  string | null
> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#1a8e2d",
      });
    }

    // These reminders are local. Fetching an Expo push token here made local
    // reminders fail in development builds without a configured project ID.
    return "local-notifications-enabled";
  } catch (error) {
    console.error("Error getting push token:", error);
    return null;
  }
}

export async function scheduleMedicationReminder(
  medication: Medication
): Promise<string[] | undefined> {
  if (!medication.reminderEnabled) return;

  try {
    await cancelDoseReminders(medication.id);
    const identifiers: string[] = [];
    const start = new Date(medication.startDate);
    start.setHours(0, 0, 0, 0);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const durationDays =
      medication.durationDays ?? parseInt(medication.duration.split(" ")[0]);
    const isOngoing = !Number.isFinite(durationDays) || durationDays === -1;

    // Ongoing medication that has already started can use stable daily
    // reminders. Cancelling above prevents duplicates after app restarts.
    if (isOngoing && start <= today) {
      for (const time of medication.times) {
        const [hours, minutes] = time.split(":").map(Number);
        if (!Number.isInteger(hours) || !Number.isInteger(minutes)) continue;
        const identifier = await Notifications.scheduleNotificationAsync({
          content: reminderContent(medication),
          trigger: {
            type: "calendar",
            hour: hours,
            minute: minutes,
            repeats: true,
          } as Notifications.CalendarTriggerInput,
        });
        identifiers.push(identifier);
      }
    } else {
      // Finite or future medication must not notify before its start or after
      // its end. Schedule chronologically so every daily time is represented.
      const firstDay = start > today ? start : today;
      const end = isOngoing
        ? new Date(
            firstDay.getFullYear(),
            firstDay.getMonth(),
            firstDay.getDate() + 59
          )
        : new Date(
            start.getFullYear(),
            start.getMonth(),
            start.getDate() + Math.max(0, durationDays - 1)
          );
      for (
        let day = new Date(firstDay);
        day <= end && identifiers.length < 60;
        day.setDate(day.getDate() + 1)
      ) {
        for (const time of medication.times) {
          if (identifiers.length >= 60) break;
          const [hours, minutes] = time.split(":").map(Number);
          if (!Number.isInteger(hours) || !Number.isInteger(minutes)) continue;
          const scheduled = new Date(day);
          scheduled.setHours(hours, minutes, 0, 0);
          if (scheduled <= now) continue;
          const identifier = await Notifications.scheduleNotificationAsync({
            content: reminderContent(medication),
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: scheduled,
            },
          });
          identifiers.push(identifier);
        }
      }
    }

    return identifiers;
  } catch (error) {
    console.error("Error scheduling medication reminder:", error);
    return undefined;
  }
}

function reminderContent(medication: Medication) {
  return {
    title: i18n.t("notifications.medicationTitle"),
    body: i18n.t("notifications.medicationBody", {
      name: medication.name,
      dosage: medication.dosage,
    }),
    data: { medicationId: medication.id, type: "medication" },
  };
}

async function cancelDoseReminders(medicationId: string): Promise<void> {
  const scheduledNotifications =
    await Notifications.getAllScheduledNotificationsAsync();
  for (const notification of scheduledNotifications) {
    const data = notification.content.data as {
      medicationId?: string;
      type?: string;
    } | null;
    if (data?.medicationId === medicationId && data.type !== "refill") {
      await Notifications.cancelScheduledNotificationAsync(
        notification.identifier
      );
    }
  }
}

export async function scheduleRefillReminder(
  medication: Medication
): Promise<string | undefined> {
  if (!medication.refillReminder) return;

  try {
    // Schedule a notification when supply is low
    if (medication.currentSupply <= medication.refillAt) {
      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: i18n.t("notifications.refillTitle"),
          body: i18n.t("notifications.refillBody", {
            name: medication.name,
            current: medication.currentSupply,
          }),
          data: { medicationId: medication.id, type: "refill" },
        },
        trigger: null, // Show immediately
      });

      return identifier;
    }
  } catch (error) {
    console.error("Error scheduling refill reminder:", error);
    return undefined;
  }
}

export async function cancelMedicationReminders(
  medicationId: string
): Promise<void> {
  try {
    const scheduledNotifications =
      await Notifications.getAllScheduledNotificationsAsync();

    for (const notification of scheduledNotifications) {
      const data = notification.content.data as {
        medicationId?: string;
      } | null;
      if (data?.medicationId === medicationId) {
        await Notifications.cancelScheduledNotificationAsync(
          notification.identifier
        );
      }
    }
  } catch (error) {
    console.error("Error canceling medication reminders:", error);
  }
}

export async function updateMedicationReminders(
  medication: Medication
): Promise<void> {
  try {
    // Cancel existing reminders
    await cancelMedicationReminders(medication.id);

    // Schedule new reminders
    await scheduleMedicationReminder(medication);
    await scheduleRefillReminder(medication);
  } catch (error) {
    console.error("Error updating medication reminders:", error);
  }
}

export async function setAppBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch (error) {
    console.error("Error setting badge count:", error);
  }
}
