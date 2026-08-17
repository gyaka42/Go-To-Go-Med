import React, { useState, useCallback, JSX } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import i18n from "../../utils/i18n";
import {
  getMedications,
  getDoseHistory,
  recordDose,
  Medication,
  DoseHistory,
} from "../../utils/storage";
import { isMedicationDue, isMedicationActiveOnDate } from "../../utils/time";
import { scheduleRefillReminder } from "../../utils/notifications";
import { useFocusEffect } from "@react-navigation/native";

const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  new Date(2021, 0, 4 + i).toLocaleDateString(i18n.locale, { weekday: "short" })
);

export default function CalendarScreen() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [medications, setMedications] = useState<Medication[]>([]);
  const [doseHistory, setDoseHistory] = useState<DoseHistory[]>([]);
  const [savingDoseKey, setSavingDoseKey] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [meds, history] = await Promise.all([
        getMedications(),
        getDoseHistory(),
      ]);
      setMedications(meds);
      setDoseHistory(history);
    } catch (error) {
      console.error("Error loading calendar data:", error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    // Adjust so the week starts on Monday instead of Sunday
    const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
    return { days, firstDay };
  };

  const { days, firstDay } = getDaysInMonth(selectedDate);

  const renderCalendar = () => {
    const calendar: JSX.Element[] = [];
    let week: JSX.Element[] = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      week.push(<View key={`empty-${i}`} style={styles.calendarDay} />);
    }

    // Add days of the month
    for (let day = 1; day <= days; day++) {
      const date = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        day
      );
      const isToday = new Date().toDateString() === date.toDateString();
      const isSelected = selectedDate.toDateString() === date.toDateString();
      const hasDoses =
        medications.some(
          (medication) =>
            medication.times.length > 0 &&
            isMedicationActiveOnDate(medication, date)
        ) ||
        doseHistory.some(
          (dose) =>
            new Date(dose.timestamp).toDateString() === date.toDateString()
        );

      week.push(
        <TouchableOpacity
          key={day}
          style={[
            styles.calendarDay,
            isToday && styles.today,
            isSelected && styles.selectedDay,
            hasDoses && styles.hasEvents,
          ]}
          onPress={() => setSelectedDate(date)}
        >
          <Text
            style={[
              styles.dayText,
              isToday && styles.todayText,
              isSelected && styles.selectedDayText,
            ]}
          >
            {day}
          </Text>
          {hasDoses && (
            <View
              style={[styles.eventDot, isSelected && styles.selectedEventDot]}
            />
          )}
        </TouchableOpacity>
      );

      if (day === days) {
        while (week.length < 7) {
          week.push(
            <View
              key={`empty-end-${week.length}`}
              style={styles.calendarDay}
            />
          );
        }
      }

      if ((firstDay + day) % 7 === 0 || day === days) {
        calendar.push(
          <View key={day} style={styles.calendarWeek}>
            {week}
          </View>
        );
        week = [];
      }
    }

    return calendar;
  };

  const renderMedicationsForDate = () => {
    const dateStr = selectedDate.toDateString();
    const dayDoses = doseHistory.filter(
      (dose) => new Date(dose.timestamp).toDateString() === dateStr
    );

    const activeMeds = medications.filter((med) =>
      isMedicationActiveOnDate(med, selectedDate)
    );

    const schedule = activeMeds.flatMap((med) =>
      med.times.length > 0
        ? med.times.map((t) => ({ medication: med, time: t }))
        : [{ medication: med, time: "" }]
    );
    schedule.sort((a, b) => {
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });

    if (schedule.length === 0) {
      return (
        <View style={styles.emptySchedule}>
          <Ionicons name="calendar-outline" size={32} color="#a0a0a0" />
          <Text style={styles.emptyScheduleText}>
            {i18n.t("noMedicationsToday")}
          </Text>
        </View>
      );
    }

    return schedule.map(({ medication, time }) => {
      const taken = dayDoses.some(
        (dose) =>
          dose.medicationId === medication.id &&
          dose.scheduledTime === time &&
          dose.taken
      );
      const doseKey = `${medication.id}-${time}`;

      return (
        <View key={`${medication.id}-${time}`} style={styles.medicationCard}>
          <View
            style={[
              styles.medicationColor,
              { backgroundColor: medication.color },
            ]}
          />
          <View style={styles.medicationInfo}>
            <Text style={styles.medicationName}>{medication.name}</Text>
            <Text style={styles.medicationDosage}>{medication.dosage}</Text>
            <Text style={styles.medicationTime}>
              {time || i18n.t("asNeeded")}
            </Text>
          </View>
          {taken ? (
            <View style={styles.takenBadge}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.takenText}>{i18n.t("taken")}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.takeDoseButton,
                { backgroundColor: medication.color },
                savingDoseKey !== null && styles.takeDoseButtonDisabled,
              ]}
              onPress={async () => {
                if (savingDoseKey) return;
                if (!isMedicationDue(medication, selectedDate, time)) {
                  Alert.alert(i18n.t("error"), i18n.t("medicationTooEarly"));
                  return;
                }
                try {
                  setSavingDoseKey(doseKey);
                  const recordedAt = new Date(selectedDate);
                  const now = new Date();
                  recordedAt.setHours(
                    now.getHours(),
                    now.getMinutes(),
                    now.getSeconds(),
                    0
                  );
                  const updatedMedication = await recordDose(
                    medication.id,
                    time,
                    true,
                    recordedAt.toISOString()
                  );
                  if (updatedMedication?.refillReminder) {
                    await scheduleRefillReminder(updatedMedication);
                  }
                  await loadData();
                } catch (error) {
                  console.error("Error recording calendar dose:", error);
                  Alert.alert(
                    i18n.t("error"),
                    i18n.t("failedToSaveMedication")
                  );
                } finally {
                  setSavingDoseKey(null);
                }
              }}
              disabled={savingDoseKey !== null}
            >
              <Text style={styles.takeDoseText}>{i18n.t("take")}</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    });
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#168A7D", "#76E3D4"]}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      />

      <View style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={28} color="#168A7D" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{i18n.t("calendar")}</Text>
        </View>

        <View style={styles.calendarContainer}>
          <View style={styles.monthHeader}>
            <TouchableOpacity
              onPress={() =>
                setSelectedDate(
                  new Date(
                    selectedDate.getFullYear(),
                    selectedDate.getMonth() - 1,
                    1
                  )
                )
              }
            >
              <Ionicons name="chevron-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.monthText}>
              {selectedDate.toLocaleString(i18n.locale, {
                month: "long",
                year: "numeric",
              })}
            </Text>
            <TouchableOpacity
              onPress={() =>
                setSelectedDate(
                  new Date(
                    selectedDate.getFullYear(),
                    selectedDate.getMonth() + 1,
                    1
                  )
                )
              }
            >
              <Ionicons name="chevron-forward" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <View style={styles.weekdayHeader}>
            {WEEKDAYS.map((day) => (
              <Text key={day} style={styles.weekdayText}>
                {day}
              </Text>
            ))}
          </View>

          {renderCalendar()}
        </View>

        <View style={styles.scheduleContainer}>
          <Text style={styles.scheduleTitle}>
            {selectedDate.toLocaleDateString(i18n.locale, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {renderMedicationsForDate()}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: Platform.OS === "ios" ? 140 : 120,
  },
  content: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 50 : 30,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
    zIndex: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "white",
    marginLeft: 15,
  },
  calendarContainer: {
    backgroundColor: "white",
    borderRadius: 16,
    margin: 20,
    padding: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  monthHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  monthText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  weekdayHeader: {
    flexDirection: "row",
    marginBottom: 10,
  },
  weekdayText: {
    flex: 1,
    textAlign: "center",
    color: "#666",
    fontWeight: "500",
  },
  calendarWeek: {
    flexDirection: "row",
    marginBottom: 5,
  },
  calendarDay: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  dayText: {
    fontSize: 16,
    color: "#333",
  },
  today: {
    backgroundColor: "#1a8e2d15",
  },
  todayText: {
    color: "#1a8e2d",
    fontWeight: "600",
  },
  selectedDay: {
    backgroundColor: "#168A7D",
  },
  selectedDayText: {
    color: "white",
    fontWeight: "700",
  },
  hasEvents: {
    position: "relative",
  },
  eventDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#1a8e2d",
    position: "absolute",
    bottom: "15%",
  },
  selectedEventDot: {
    backgroundColor: "white",
  },
  scheduleContainer: {
    flex: 1,
    backgroundColor: "white",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  scheduleTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
    marginBottom: 15,
  },
  emptySchedule: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
  },
  emptyScheduleText: {
    color: "#777",
    fontSize: 15,
    marginTop: 8,
    textAlign: "center",
  },
  medicationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 16,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  medicationColor: {
    width: 12,
    height: 40,
    borderRadius: 6,
    marginRight: 15,
  },
  medicationInfo: {
    flex: 1,
  },
  medicationName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  medicationDosage: {
    fontSize: 14,
    color: "#666",
    marginBottom: 2,
  },
  medicationTime: {
    fontSize: 14,
    color: "#666",
  },
  takeDoseButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 12,
  },
  takeDoseButtonDisabled: {
    opacity: 0.55,
  },
  takeDoseText: {
    color: "white",
    fontWeight: "600",
    fontSize: 14,
  },
  takenBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  takenText: {
    color: "#4CAF50",
    fontWeight: "600",
    fontSize: 14,
    marginLeft: 4,
  },
});
