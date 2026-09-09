import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { groupByDate, mergedItems, type DayItem } from "../agenda";
import { formatDateHeader, KO_DAYS, monthGrid, toDateKey } from "../dates";
import { SwipeRow } from "../components/SwipeRow";
import { HOLIDAYS } from "../holidays";
import { ACCENT, HOLIDAY_COLOR, PHONE_COLOR, SATURDAY_COLOR, useStyles } from "../styles";
import type { BusyBlock, StoredEvent } from "../types";

export function CalendarScreen({
  events,
  phone,
  onVisibleRange,
  onRemove,
  onEdit,
  onSelectDate,
}: {
  events: StoredEvent[];
  phone: BusyBlock[];
  onVisibleRange: (from: string, to: string) => void;
  onRemove: (id: string) => void;
  onEdit: (event: StoredEvent) => void;
  onSelectDate: (date: string) => void; // so "+" can default to the tapped day
}) {
  const styles = useStyles();
  const today = toDateKey(new Date());
  const [cursor, setCursor] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const [selected, setSelectedState] = useState(today);
  const setSelected = (key: string) => {
    setSelectedState(key);
    onSelectDate(key);
  };

  const grid = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const from = grid[0][0];
  const to = grid[5][6];
  useEffect(() => {
    onVisibleRange(from, to);
  }, [from, to, onVisibleRange]);

  const byDate = useMemo(() => groupByDate(mergedItems(events, phone, from, to)), [events, phone, from, to]);
  const dayItems = byDate.get(selected) ?? [];
  const inMonth = (key: string) => Number(key.slice(5, 7)) - 1 === cursor.m;

  const move = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };
  const goToday = () => {
    const d = new Date();
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(today);
  };

  return (
    <View style={styles.flex}>
      <View style={styles.monthNav}>
        <Pressable onPress={() => move(-1)} hitSlop={8}>
          <Text style={styles.navBtn}>‹</Text>
        </Pressable>
        <Pressable onPress={goToday}>
          <Text style={styles.monthTitle}>
            {cursor.y}년 {cursor.m + 1}월
          </Text>
        </Pressable>
        <Pressable onPress={() => move(1)} hitSlop={8}>
          <Text style={styles.navBtn}>›</Text>
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {KO_DAYS.map((d, i) => (
          <Text key={d} style={[styles.weekdayCell, i === 0 && { color: HOLIDAY_COLOR }, i === 6 && { color: SATURDAY_COLOR }]}>
            {d}
          </Text>
        ))}
      </View>
      {grid.map((row, r) => (
        <View key={r} style={styles.weekRow}>
          {row.map((key, col) => {
            const items = byDate.get(key) ?? [];
            const hasApp = items.some((i) => i.source === "app");
            const hasPhone = items.some((i) => i.source === "phone");
            const holiday = HOLIDAYS[key];
            const isSelected = key === selected;
            return (
              <Pressable key={key} style={styles.dayCell} onPress={() => setSelected(key)}>
                <Text
                  style={[
                    styles.dayNum,
                    (holiday || col === 0) && styles.dayNumHoliday,
                    col === 6 && !holiday && styles.dayNumSaturday,
                    !inMonth(key) && styles.dayNumMuted,
                    key === today && styles.dayNumToday,
                    isSelected && styles.dayNumSelected,
                  ]}
                >
                  {Number(key.slice(8, 10))}
                </Text>
                {holiday && inMonth(key) ? (
                  <Text style={styles.holidayLabel} numberOfLines={1}>
                    {holiday.replace(/^대체공휴일.*$/, "대체휴일")}
                  </Text>
                ) : (
                  <View style={styles.dots}>
                    {hasApp && <View style={[styles.dot, { backgroundColor: ACCENT }]} />}
                    {hasPhone && <View style={[styles.dot, { backgroundColor: PHONE_COLOR }]} />}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
      <Text style={styles.sectionHeader}>{formatDateHeader(selected, today)}</Text>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {dayItems.length === 0 ? (
          <Text style={[styles.emptyBody, { padding: 20 }]}>이 날은 일정이 없어요.</Text>
        ) : (
          dayItems.map((item) => <DayRow key={item.key} item={item} onRemove={onRemove} onEdit={onEdit} />)
        )}
      </ScrollView>
    </View>
  );
}

// Swipe left on an app event for 수정 / 삭제. Phone-calendar rows are read-only here (edit them in the calendar app).
export function DayRow({ item, onRemove, onEdit }: { item: DayItem; onRemove: (id: string) => void; onEdit: (event: StoredEvent) => void }) {
  const styles = useStyles();
  const row = (
    <View style={[styles.eventRow, { backgroundColor: "#fff" }]}>
      <View style={[styles.eventBar, item.source === "phone" && { backgroundColor: PHONE_COLOR }, item.source === "holiday" && { backgroundColor: HOLIDAY_COLOR }]} />
      <Text style={styles.rowTime}>{item.time}</Text>
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        {item.sub ? <Text style={styles.rowSub}>{item.sub}</Text> : null}
      </View>
    </View>
  );
  const e = item.event;
  if (!e) return row;
  const confirmRemove = () =>
    Alert.alert("일정 삭제", `"${e.title}"${e.recurrence ? " (반복 전체)" : ""}을 삭제할까요?`, [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: () => onRemove(e.id) },
    ]);
  return (
    <SwipeRow
      actions={[
        { label: "수정", color: ACCENT, onPress: () => onEdit(e) },
        { label: "삭제", color: "#D92D20", onPress: confirmRemove },
      ]}
    >
      {row}
    </SwipeRow>
  );
}
