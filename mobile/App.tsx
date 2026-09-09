import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { Source } from "./src/api";
import { addToDeviceCalendar, removeFromDeviceCalendar, requestPermission } from "./src/calendar";
import { appBusyBlocks, describeConflict, durationMinutes, findConflicts, freeSlots } from "./src/conflicts";
import { addDays, horizon, toDateKey } from "./src/dates";
import { cancelReminders, requestNotificationPermission, scheduleReminders } from "./src/notifications";
import { markHandled } from "./src/gmail";
import { listPhoneEvents } from "./src/phoneCalendar";
import { AddScreen } from "./src/screens/AddScreen";
import { AgendaScreen } from "./src/screens/AgendaScreen";
import { CalendarScreen } from "./src/screens/CalendarScreen";
import { MailActionScreen } from "./src/screens/MailActionScreen";
import { MailScreen, type MailAction } from "./src/screens/MailScreen";
import { ManualForm } from "./src/screens/ManualForm";
import { ReplyScreen } from "./src/screens/ReplyScreen";
import { ReviewScreen, type Decision } from "./src/screens/ReviewScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "./src/settings";
import { loadEvents, saveEvents } from "./src/storage";
import { BIG_FONT_SCALE, makeStyles, StylesContext } from "./src/styles";
import type { BusyBlock, ParsedEvent, ReplyEvent, ScannedMessage, Slot, StoredEvent } from "./src/types";

type Tab = "calendar" | "agenda" | "mail" | "settings";
type Flow =
  | null
  | { name: "add" }
  | { name: "review"; parsed: ParsedEvent[]; notes: string; source: Source }
  | { name: "reply"; accepted: ReplyEvent[]; declined: ReplyEvent[]; alternatives: Slot[]; source: Source }
  | { name: "edit"; event: StoredEvent }
  | { name: "mailAction"; message: ScannedMessage; action: MailAction };

const TABS: { key: Tab; label: string }[] = [
  { key: "calendar", label: "캘린더" },
  { key: "agenda", label: "목록" },
  { key: "mail", label: "메일" },
  { key: "settings", label: "설정" },
];

export default function App() {
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("calendar");
  const [flow, setFlow] = useState<Flow>(null);
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date())); // day tapped in the calendar; "+" defaults to it

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

  // Conflict checks look 120 days ahead, so keep that window loaded. Ask for calendar access up front:
  // without it the phone's own events never show up, which reads as "sync is broken".
  const refreshPhone = useCallback(async () => {
    const { from, to } = horizon(120);
    if (settings.syncCalendar) await requestPermission().catch(() => false);
    loadedRanges.current.clear();
    await loadPhoneRange(from, to, true);
  }, [settings.syncCalendar, loadPhoneRange]);

  useEffect(() => {
    if (!loaded) return;
    refreshPhone();
  }, [loaded, refreshPhone]);

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

  // Phone calendar entries and reminders for freshly saved events (each best-effort). Returns the events with ids attached.
  const attach = async (added: StoredEvent[]): Promise<StoredEvent[]> => {
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
    return added;
  };

  // Save new events: app storage first, then the phone calendar and reminders.
  const store = async (parsed: ParsedEvent[]) => {
    const createdAt = new Date().toISOString();
    const added: StoredEvent[] = parsed.map((p, i) => ({ ...p, id: `${Date.now()}-${i}`, createdAt }));
    if (added.length === 0) return;
    persist([...events, ...added]);
    const attached = await attach(added);
    persist([...events, ...attached]);
  };

  // Edit an existing event: drop its old calendar entries and reminders, save the new version, re-attach.
  const updateEvent = async (id: string, parsed: ParsedEvent) => {
    const old = events.find((e) => e.id === id);
    if (!old) return;
    if (old.calendarEventIds?.length) await removeFromDeviceCalendar(old.calendarEventIds);
    if (old.notificationIds?.length) await cancelReminders(old.notificationIds);
    const updated: StoredEvent = { ...parsed, id, createdAt: old.createdAt };
    const rest = events.filter((e) => e.id !== id);
    persist([...rest, updated]);
    const [attached] = await attach([updated]);
    persist([...rest, attached]);
  };

  // Hand-typed event: warn about clashes, then save and go straight back to the calendar.
  const saveManual = (event: ParsedEvent) => {
    const { from, to } = horizon(120);
    const conflict = findConflicts([event], busy, from, to).get(0);
    const commit = () => {
      store([event]);
      setFlow(null);
      setTab("calendar");
    };
    if (!conflict) return commit();
    Alert.alert("기존 일정과 겹쳐요", describeConflict(conflict), [
      { text: "취소", style: "cancel" },
      { text: "그래도 추가", onPress: commit },
    ]);
  };

  const confirm = async (kept: Decision[], declined: Decision[], source: Source) => {
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
    await store(kept.map((d) => d.event));
  };

  // Review a mail's events; the reply can then go straight back to the sender.
  const openMail = (message: ScannedMessage) => {
    markHandled(message.id);
    setFlow({
      name: "review",
      parsed: message.events,
      notes: message.notes,
      source: { text: message.text, email: { to: message.fromEmail, subject: message.subject } },
    });
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
    if (flow.name === "add")
      return (
        <AddScreen
          defaultDate={selectedDate}
          onBack={() => setFlow(null)}
          onParsed={(parsed, notes, source) => setFlow({ name: "review", parsed, notes, source })}
          onManual={saveManual}
        />
      );
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
    if (flow.name === "reply")
      return (
        <ReplyScreen
          accepted={flow.accepted}
          declined={flow.declined}
          alternatives={flow.alternatives}
          source={flow.source}
          defaultTone={settings.tone}
          onDone={() => setFlow(null)}
        />
      );
    if (flow.name === "edit")
      return (
        <View style={styles.flex}>
          <View style={styles.header}>
            <Pressable onPress={() => setFlow(null)} hitSlop={12}>
              <Text style={styles.link}>‹ 뒤로</Text>
            </Pressable>
            <Text style={styles.h1}>일정 수정</Text>
            <View style={{ width: 48 }} />
          </View>
          <ManualForm
            defaultDate={selectedDate}
            initial={flow.event}
            onSave={(parsed) => {
              updateEvent(flow.event.id, parsed);
              setFlow(null);
            }}
          />
        </View>
      );
    return <MailActionScreen message={flow.message} action={flow.action} busy={busy} defaultTone={settings.tone} onDone={() => setFlow(null)} />;
  };

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
      <StylesContext.Provider value={styles}>
        <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
          <StatusBar style="dark" />
        {!loaded ? null : flow ? (
          renderFlow()
        ) : (
          <>
            <View style={styles.flex}>
              {tab === "calendar" && (
                <CalendarScreen
                  events={events}
                  phone={phoneList}
                  onVisibleRange={loadPhoneRange}
                  onRemove={removeEvent}
                  onEdit={(event) => setFlow({ name: "edit", event })}
                  onSelectDate={setSelectedDate}
                />
              )}
              {tab === "agenda" && <AgendaScreen events={events} phone={phoneList} onRemove={removeEvent} onEdit={(event) => setFlow({ name: "edit", event })} />}
              {tab === "mail" && <MailScreen busy={busy} onOpen={openMail} onAction={(message, action) => setFlow({ name: "mailAction", message, action })} />}
              {tab === "settings" && <SettingsScreen settings={settings} onChange={updateSettings} onRefreshCalendar={refreshPhone} />}
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
