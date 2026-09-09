import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { formatTime, KO_DAYS, toDate, toDateKey, toLocalString, WEEKDAYS } from "../dates";
import { ACCENT, useStyles } from "../styles";
import type { ParsedEvent, Weekday } from "../types";

type Picker = "date" | "start" | "end" | null;

// Type an event in by hand. Produces the same ParsedEvent shape the AI path does, so saving,
// calendar sync, reminders and conflict checks all work the same way.
export function ManualForm({ defaultDate, onSave }: { defaultDate: string; onSave: (event: ParsedEvent) => void }) {
  const styles = useStyles();
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [date, setDate] = useState<Date>(() => toDate(defaultDate));
  const [start, setStart] = useState<Date>(() => nextFullHour());
  const [end, setEnd] = useState<Date>(() => new Date(nextFullHour().getTime() + 60 * 60 * 1000));
  const [location, setLocation] = useState("");
  const [days, setDays] = useState<Weekday[]>([]);
  const [picker, setPicker] = useState<Picker>(null);

  const toggleDay = (d: Weekday) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  const onPick = (e: DateTimePickerEvent, value?: Date) => {
    if (Platform.OS === "android") setPicker(null); // Android shows a dialog; close it after any answer
    if (e.type !== "set" || !value) return;
    if (picker === "date") setDate(value);
    if (picker === "start") {
      setStart(value);
      if (end <= value) setEnd(new Date(value.getTime() + 60 * 60 * 1000));
    }
    if (picker === "end") setEnd(value);
  };

  const save = () => {
    const dateKey = toDateKey(date);
    const at = (t: Date) => toLocalString(new Date(date.getFullYear(), date.getMonth(), date.getDate(), t.getHours(), t.getMinutes()));
    onSave({
      title: title.trim(),
      start: allDay ? dateKey : at(start),
      end: allDay ? null : at(end),
      all_day: allDay,
      location: location.trim() || null,
      description: null,
      recurrence: days.length > 0 ? { freq: "weekly", by_day: WEEKDAYS.filter((d) => days.includes(d)), until: null } : null,
      confidence: 1,
      source_excerpt: "직접 입력",
    });
  };

  const dateLabel = `${date.getMonth() + 1}월 ${date.getDate()}일 (${KO_DAYS[date.getDay()]})`;
  const canSave = title.trim().length > 0 && (allDay || end > start);

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>제목</Text>
        <TextInput
          style={[styles.input, { minHeight: 0 }]}
          placeholder="예: 팀플 회의"
          placeholderTextColor="#98A2B3"
          value={title}
          onChangeText={setTitle}
          returnKeyType="done"
        />

        <Text style={styles.label}>날짜</Text>
        <Pressable style={styles.fieldBtn} onPress={() => setPicker(picker === "date" ? null : "date")}>
          <Text style={styles.fieldText}>{dateLabel}</Text>
        </Pressable>

        <View style={styles.settingRow}>
          <Text style={[styles.rowTitle, styles.flex]}>종일</Text>
          <Switch value={allDay} onValueChange={setAllDay} trackColor={{ true: ACCENT }} />
        </View>

        {!allDay && (
          <View style={[styles.row, { gap: 12 }]}>
            <View style={styles.flex}>
              <Text style={styles.label}>시작</Text>
              <Pressable style={styles.fieldBtn} onPress={() => setPicker(picker === "start" ? null : "start")}>
                <Text style={styles.fieldText}>{formatTime(start)}</Text>
              </Pressable>
            </View>
            <View style={styles.flex}>
              <Text style={styles.label}>종료</Text>
              <Pressable style={styles.fieldBtn} onPress={() => setPicker(picker === "end" ? null : "end")}>
                <Text style={[styles.fieldText, end <= start && { color: "#B54708" }]}>{formatTime(end)}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {picker && (
          <DateTimePicker
            value={picker === "date" ? date : picker === "start" ? start : end}
            mode={picker === "date" ? "date" : "time"}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            minuteInterval={5}
            locale="ko-KR"
            onChange={onPick}
          />
        )}
        {picker && Platform.OS === "ios" && (
          <Pressable style={[styles.secondaryBtn, { padding: 10 }]} onPress={() => setPicker(null)}>
            <Text style={styles.secondaryBtnText}>확인</Text>
          </Pressable>
        )}

        <Text style={styles.label}>장소 (선택)</Text>
        <TextInput
          style={[styles.input, { minHeight: 0 }]}
          placeholder="예: 도서관 3층"
          placeholderTextColor="#98A2B3"
          value={location}
          onChangeText={setLocation}
          returnKeyType="done"
        />

        <Text style={styles.label}>매주 반복 (선택)</Text>
        <View style={[styles.row, { gap: 6, flexWrap: "wrap" }]}>
          {WEEKDAYS.map((d, i) => {
            const on = days.includes(d);
            return (
              <Pressable key={d} style={[styles.chip, on && styles.chipOn]} onPress={() => toggleDay(d)}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{KO_DAYS[i]}</Text>
              </Pressable>
            );
          })}
        </View>
        {days.length > 0 ? <Text style={styles.hint}>선택한 요일마다 반복돼요. 위 날짜부터 시작.</Text> : null}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable style={[styles.primaryBtn, styles.wide, !canSave && styles.disabled]} onPress={save} disabled={!canSave}>
          <Text style={styles.primaryBtnText}>캘린더에 추가</Text>
        </Pressable>
      </View>
    </View>
  );
}

function nextFullHour(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}
