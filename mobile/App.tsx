import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, SafeAreaView, Text, View } from "react-native";
import type { Source } from "./src/api";
import { addToDeviceCalendar, removeFromDeviceCalendar, requestPermission } from "./src/calendar";
import { appBusyBlocks, describeConflict, durationMinutes, freeSlots } from "./src/conflicts";
import { addDays, horizon, toDateKey } from "./src/dates";
import { cancelReminders, requestNotificationPermission, scheduleReminders } from "./src/notifications";
import { listPhoneEvents } from "./src/phoneCalendar";
import { AddScreen } from "./src/screens/AddScreen";
import { AgendaScreen } from "./src/screens/AgendaScreen";
import { CalendarScreen } from "./src/screens/CalendarScreen";
import { ReplyScreen } from "./src/screens/ReplyScreen";
import { ReviewScreen, type Decision } from "./src/screens/ReviewScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "./src/settings";
import { loadEvents, saveEvents } from "./src/storage";
import { BIG_FONT_SCALE, makeStyles, StylesContext } from "./src/styles";
import type { BusyBlock, ParsedEvent, ReplyEvent, Slot, StoredEvent } from "./src/types";

type Tab = "calendar" | "agenda" | "settings";
type Flow =
  | null
  | { name: "add" }
  | { name: "review"; parsed: ParsedEvent[]; notes: string; source: Source }
  | { name: "reply"; accepted: ReplyEvent[]; declined: ReplyEvent[]; alternatives: Slot[]; source: Source };

const TABS: { key: Tab; label: string }[] = [
  { key: "calendar", label: "캘린더" },
  { key: "agenda", label: "목록" },
  { key: "settings", label: "설정" },
];

export default function App() {
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("calendar");
  const [flow, setFlow] = useState<Flow>(null);

  // Phone-calendar events, keyed by id, loaded per visible range and refreshed when the app saves something.
  const [phone, setPhone] = useState<Map<string, BusyBlock>>(new Map());
  const loadedRanges = useRef<Set<string>>(new Set());
  const ownIds = useMemo(() => new Set(events.flatMap((e) => e.calendarEventIds ?? [])), [events]);

  const loadPhoneRange = useCallback(
    async (from: string, to: string, force = false) => {
      if (!settings.syncCalendar) return;
      const key = `${from}~${to}`;
      if (!force && loadedRanges.current.has(key)) return;
      loadedRanges.current.add(key);
      try {
        const found = await listPhoneEvents(new Date(from), new Date(addDays(to, 1)), ownIds);
        setPhone((prev) => {
          const next = new Map(prev);
          for (const b of found) next.set(b.id, b);
          return next;
        });
      } catch {
        // Calendar unavailable (no permission yet); the app still works with its own events.
      }
    },
    [settings.syncCalendar, ownIds],
  );

  useEffect(() => {
    Promise.all([loadEvents(), loadSettings()]).then(([e, s]) => {
      setEvents(e);
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  // Conflict checks look 120 days ahead, so keep that window loaded.
  useEffect(() => {
    if (!loaded) return;
    const { from, to } = horizon(120);
    loadPhoneRange(from, to);
  }, [loaded, loadPhoneRange]);

  const persist = useCallback((next: StoredEvent[]) => {
    setEvents(next);
    saveEvents(next);
  }, []);

  const updateSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };

  const { from: windowFrom, to: windowTo } = horizon(120);
  const busy: BusyBlock[] = useMemo(
    () => [...appBusyBlocks(events, windowFrom, windowTo), ...(settings.syncCalendar ? [...phone.values()] : [])],
    [events, phone, settings.syncCalendar, windowFrom, windowTo],
  );

  const confirm = async (kept: Decision[], declined: Decision[], source: Source) => {
    const createdAt = new Date().toISOString();
    let added: StoredEvent[] = kept.map((d, i) => ({ ...d.event, id: `${Date.now()}-${i}`, createdAt }));
    persist([...events, ...added]);

    // Free slots to offer instead of each declined event that clashed.
    const alternatives: Slot[] = [];
    for (const d of declined) {
      if (!d.conflict) continue;
      for (const s of freeSlots(busy, durationMinutes(d.event), d.conflict.at, 7, 3)) {
        if (!alternatives.some((a) => a.start === s.start)) alternatives.push(s);
      }
    }
    const toReply = (d: Decision): ReplyEvent => ({
      title: d.event.title,
      start: d.event.start,
      conflict: d.conflict ? describeConflict(d.conflict) : undefined,
    });
    setFlow({ name: "reply", accepted: kept.map(toReply), declined: declined.map(toReply), alternatives: alternatives.slice(0, 3), source });

    if (added.length === 0) return;
    if (settings.syncCalendar) {
      try {
        if (await requestPermission()) {
          const ids = await addToDeviceCalendar(added);
          added = added.map((e) => ({ ...e, calendarEventIds: ids[e.id] }));
        } else {
          Alert.alert("캘린더 권한이 없어요", "앱 안에만 저장했어요. 설정에서 캘린더 접근을 허용하면 폰 캘린더에도 넣어 드려요.");
        }
      } catch (e) {
        Alert.alert("캘린더에 넣지 못했어요", e instanceof Error ? e.message : "앱 안에는 저장됐어요.");
      }
    }
    if (settings.reminderMinutes > 0) {
      try {
        if (await requestNotificationPermission()) {
          const withIds: StoredEvent[] = [];
          for (const e of added) withIds.push({ ...e, notificationIds: await scheduleReminders(e, settings.reminderMinutes) });
          added = withIds;
        }
      } catch {
        // Notifications unavailable on this device; skip silently.
      }
    }
    persist([...events, ...added]);
  };

  const removeEvent = (id: string) => {
    const target = events.find((e) => e.id === id);
    if (target?.calendarEventIds?.length) removeFromDeviceCalendar(target.calendarEventIds);
    if (target?.notificationIds?.length) cancelReminders(target.notificationIds);
    persist(events.filter((e) => e.id !== id));
  };

  const styles = useMemo(() => makeStyles(settings.bigFont ? BIG_FONT_SCALE : 1), [settings.bigFont]);
  const phoneList = useMemo(() => (settings.syncCalendar ? [...phone.values()] : []), [phone, settings.syncCalendar]);

  const renderFlow = () => {
    if (!flow) return null;
    if (flow.name === "add") return <AddScreen onBack={() => setFlow(null)} onParsed={(parsed, notes, source) => setFlow({ name: "review", parsed, notes, source })} />;
    if (flow.name === "review")
      return (
        <ReviewScreen
          parsed={flow.parsed}
          notes={flow.notes}
          busy={busy}
          onBack={() => setFlow({ name: "add" })}
          onConfirm={(kept, declined) => confirm(kept, declined, flow.source)}
        />
      );
    return <ReplyScreen accepted={flow.accepted} declined={flow.declined} alternatives={flow.alternatives} source={flow.source} onDone={() => setFlow(null)} />;
  };

  return (
    <StylesContext.Provider value={styles}>
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        {!loaded ? null : flow ? (
          renderFlow()
        ) : (
          <>
            <View style={styles.flex}>
              {tab === "calendar" && <CalendarScreen events={events} phone={phoneList} onVisibleRange={loadPhoneRange} onRemove={removeEvent} />}
              {tab === "agenda" && <AgendaScreen events={events} phone={phoneList} onRemove={removeEvent} />}
              {tab === "settings" && <SettingsScreen settings={settings} onChange={updateSettings} />}
              {tab !== "settings" && (
                <Pressable style={styles.fab} onPress={() => setFlow({ name: "add" })} accessibilityLabel="일정 추가">
                  <Text style={styles.fabText}>＋</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.tabBar}>
              {TABS.map((t) => (
                <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
                  <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </SafeAreaView>
    </StylesContext.Provider>
  );
}
