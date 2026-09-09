import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  SectionList,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { MOCK, parse, reply as draftReply, type Source } from "./src/api";
import { addToDeviceCalendar, removeFromDeviceCalendar, requestPermission } from "./src/calendar";
import { describeRecurrence, expand, formatDateHeader, formatTimeRange, horizon, splitStart, toDateKey } from "./src/dates";
import { loadSettings, saveSettings, DEFAULT_SETTINGS, type Settings } from "./src/settings";
import { loadEvents, saveEvents } from "./src/storage";
import type { Occurrence, ParsedEvent, StoredEvent } from "./src/types";

type Screen =
  | { name: "home" }
  | { name: "add" }
  | { name: "review"; parsed: ParsedEvent[]; notes: string; source: Source }
  | { name: "reply"; accepted: ParsedEvent[]; declined: ParsedEvent[]; source: Source }
  | { name: "settings" };

const ACCENT = "#2D6CDF";
const BIG_FONT_SCALE = 1.3;

export default function App() {
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState<Screen>({ name: "home" });

  useEffect(() => {
    Promise.all([loadEvents(), loadSettings()]).then(([e, s]) => {
      setEvents(e);
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  const persist = useCallback((next: StoredEvent[]) => {
    setEvents(next);
    saveEvents(next);
  }, []);

  const updateSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };

  const addEvents = async (kept: ParsedEvent[], declined: ParsedEvent[], source: Source) => {
    const createdAt = new Date().toISOString();
    let added: StoredEvent[] = kept.map((p, i) => ({ ...p, id: `${Date.now()}-${i}`, createdAt }));
    persist([...events, ...added]);
    setScreen({ name: "reply", accepted: kept, declined, source });

    if (settings.syncCalendar && added.length > 0) {
      try {
        if (!(await requestPermission())) {
          Alert.alert("캘린더 권한이 없어요", "앱 안에만 저장했어요. 설정에서 캘린더 접근을 허용하면 폰 캘린더에도 넣어 드려요.");
          return;
        }
        const ids = await addToDeviceCalendar(added);
        added = added.map((e) => ({ ...e, calendarEventIds: ids[e.id] }));
        persist([...events, ...added]);
      } catch (e) {
        Alert.alert("캘린더에 넣지 못했어요", e instanceof Error ? e.message : "앱 안에는 저장됐어요.");
      }
    }
  };

  const removeEvent = (id: string) => {
    const target = events.find((e) => e.id === id);
    if (target?.calendarEventIds?.length) removeFromDeviceCalendar(target.calendarEventIds);
    persist(events.filter((e) => e.id !== id));
  };

  const styles = useMemo(() => makeStyles(settings.bigFont ? BIG_FONT_SCALE : 1), [settings.bigFont]);

  return (
    <StylesContext.Provider value={styles}>
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        {!loaded ? null : screen.name === "home" ? (
          <Home events={events} onAdd={() => setScreen({ name: "add" })} onSettings={() => setScreen({ name: "settings" })} onRemove={removeEvent} />
        ) : screen.name === "add" ? (
          <Add onBack={() => setScreen({ name: "home" })} onParsed={(parsed, notes, source) => setScreen({ name: "review", parsed, notes, source })} />
        ) : screen.name === "review" ? (
          <Review
            parsed={screen.parsed}
            notes={screen.notes}
            onBack={() => setScreen({ name: "add" })}
            onConfirm={(kept, declined) => addEvents(kept, declined, screen.source)}
          />
        ) : screen.name === "reply" ? (
          <Reply accepted={screen.accepted} declined={screen.declined} source={screen.source} onDone={() => setScreen({ name: "home" })} />
        ) : (
          <SettingsScreen settings={settings} onChange={updateSettings} onBack={() => setScreen({ name: "home" })} />
        )}
      </SafeAreaView>
    </StylesContext.Provider>
  );
}

// ---------- Home: agenda list ----------

function Home({
  events,
  onAdd,
  onSettings,
  onRemove,
}: {
  events: StoredEvent[];
  onAdd: () => void;
  onSettings: () => void;
  onRemove: (id: string) => void;
}) {
  const styles = useStyles();
  const today = toDateKey(new Date());
  const sections = useMemo(() => {
    const { from, to } = horizon(120);
    const rows = expand(events, from, to);
    const byDate = new Map<string, Occurrence[]>();
    for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
    return [...byDate.entries()].map(([date, data]) => ({ title: formatDateHeader(date, today), data }));
  }, [events, today]);

  const confirmRemove = (e: StoredEvent) =>
    Alert.alert("일정 삭제", `"${e.title}"${e.recurrence ? " (반복 전체)" : ""}을 삭제할까요?`, [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: () => onRemove(e.id) },
    ]);

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={onSettings} hitSlop={12}>
          <Text style={styles.link}>설정</Text>
        </Pressable>
        <Text style={styles.h1}>내 일정</Text>
        <Pressable style={styles.primaryBtn} onPress={onAdd}>
          <Text style={styles.primaryBtnText}>＋ 추가</Text>
        </Pressable>
      </View>
      {sections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>아직 일정이 없어요</Text>
          <Text style={styles.emptyBody}>카톡 대화, 시간표, 주보 사진을 올리면{"\n"}일정을 찾아서 넣어 드려요.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(o) => `${o.event.id}-${o.date}`}
          renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onLongPress={() => confirmRemove(item.event)}>
              <Text style={styles.rowTime}>{formatTimeRange(item.event)}</Text>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{item.event.title}</Text>
                {(item.event.location || describeRecurrence(item.event)) && (
                  <Text style={styles.rowSub}>{[item.event.location, describeRecurrence(item.event)].filter(Boolean).join(" · ")}</Text>
                )}
              </View>
            </Pressable>
          )}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </View>
  );
}

// ---------- Add: paste text or pick a screenshot ----------

function Add({ onBack, onParsed }: { onBack: () => void; onParsed: (parsed: ParsedEvent[], notes: string, source: Source) => void }) {
  const styles = useStyles();
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ uri: string; data: string; mediaType: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6, base64: true });
    const asset = result.assets?.[0];
    if (result.canceled || !asset?.base64) return;
    setImage({ uri: asset.uri, data: asset.base64, mediaType: asset.mimeType ?? "image/jpeg" });
  };

  const submit = async () => {
    if (!text.trim() && !image) return;
    setBusy(true);
    const source: Source = { text: text.trim() || undefined, image: image ? { data: image.data, mediaType: image.mediaType } : undefined };
    try {
      const result = await parse(source);
      onParsed(result.events, result.notes, source);
    } catch (e) {
      Alert.alert("일정을 찾지 못했어요", e instanceof Error ? e.message : "다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.link}>‹ 뒤로</Text>
        </Pressable>
        <Text style={styles.h1}>일정 추가</Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>붙여넣기</Text>
        <TextInput
          style={styles.input}
          multiline
          placeholder="카톡 대화, 문자, 이메일 내용을 붙여넣으세요"
          placeholderTextColor="#98A2B3"
          value={text}
          onChangeText={setText}
          textAlignVertical="top"
        />
        <Text style={styles.label}>또는 사진</Text>
        {image ? (
          <Pressable onPress={() => setImage(null)}>
            <Image source={{ uri: image.uri }} style={styles.preview} resizeMode="contain" />
            <Text style={styles.hint}>탭하면 사진을 지워요</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.secondaryBtn} onPress={pickImage}>
            <Text style={styles.secondaryBtnText}>스크린샷 · 시간표 · 주보 사진 고르기</Text>
          </Pressable>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable style={[styles.primaryBtn, styles.wide, (busy || (!text.trim() && !image)) && styles.disabled]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>일정 찾기</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------- Review: pick which found events to keep ----------

function Review({
  parsed,
  notes,
  onBack,
  onConfirm,
}: {
  parsed: ParsedEvent[];
  notes: string;
  onBack: () => void;
  onConfirm: (kept: ParsedEvent[], declined: ParsedEvent[]) => void;
}) {
  const styles = useStyles();
  const [checked, setChecked] = useState<boolean[]>(() => parsed.map((p) => p.confidence >= 0.5));
  const kept = parsed.filter((_, i) => checked[i]);
  const declined = parsed.filter((_, i) => !checked[i]);
  const toggle = (i: number) => setChecked((c) => c.map((v, j) => (j === i ? !v : v)));

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.link}>‹ 뒤로</Text>
        </Pressable>
        <Text style={styles.h1}>찾은 일정 {parsed.length}개</Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView contentContainerStyle={styles.pad}>
        {notes ? <Text style={styles.notes}>{notes}</Text> : null}
        {parsed.length === 0 && <Text style={styles.emptyBody}>날짜가 있는 일정을 찾지 못했어요.</Text>}
        {parsed.map((p, i) => {
          const { date, time } = splitStart(p.start);
          const rec = p.recurrence
            ? p.recurrence.freq === "daily"
              ? "매일"
              : `매주 ${p.recurrence.by_day.join("·")}`
            : null;
          return (
            <Pressable key={i} style={[styles.card, checked[i] && styles.cardOn]} onPress={() => toggle(i)}>
              <Text style={styles.check}>{checked[i] ? "☑" : "☐"}</Text>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{p.title}</Text>
                <Text style={styles.rowSub}>
                  {date}
                  {time ? ` ${time}` : " 종일"}
                  {p.end ? ` – ${splitStart(p.end).time ?? ""}` : ""}
                  {rec ? ` · ${rec}` : ""}
                </Text>
                {p.location ? <Text style={styles.rowSub}>{p.location}</Text> : null}
                {p.confidence < 0.5 ? <Text style={styles.warn}>날짜가 확실하지 않아요 · "{p.source_excerpt}"</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          style={[styles.primaryBtn, styles.wide, kept.length === 0 && styles.disabled]}
          onPress={() => onConfirm(kept, declined)}
          disabled={kept.length === 0}
        >
          <Text style={styles.primaryBtnText}>{kept.length}개 캘린더에 추가</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------- Reply: draft a message back to whoever sent the schedule ----------

function Reply({ accepted, declined, source, onDone }: { accepted: ParsedEvent[]; declined: ParsedEvent[]; source: Source; onDone: () => void }) {
  const styles = useStyles();
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      setDraft(await draftReply(source, accepted, declined));
    } catch (e) {
      Alert.alert("답장을 만들지 못했어요", e instanceof Error ? e.message : "다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  };

  // The share sheet lets the user pick KakaoTalk, Messages, Mail, etc. Sending is always their tap.
  const share = () => draft && Share.share({ message: draft });

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <View style={{ width: 48 }} />
        <Text style={styles.h1}>저장 완료</Text>
        <Pressable onPress={onDone} hitSlop={12}>
          <Text style={styles.link}>완료</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <Text style={styles.emptyBody}>
          {accepted.length}개 일정을 넣었어요{declined.length ? `, ${declined.length}개는 뺐어요` : ""}.
        </Text>
        <Text style={styles.label}>보낸 사람에게 답장</Text>
        {draft === null ? (
          <Pressable style={[styles.secondaryBtn, busy && styles.disabled]} onPress={generate} disabled={busy}>
            {busy ? <ActivityIndicator color={ACCENT} /> : <Text style={styles.secondaryBtnText}>답장 초안 만들기</Text>}
          </Pressable>
        ) : (
          <>
            <TextInput style={styles.input} multiline value={draft} onChangeText={setDraft} textAlignVertical="top" />
            <Text style={styles.hint}>고쳐서 보내도 돼요. 전송은 카톡·문자 앱에서 직접 눌러요.</Text>
          </>
        )}
      </ScrollView>
      {draft !== null && (
        <View style={styles.footer}>
          <Pressable style={[styles.primaryBtn, styles.wide]} onPress={share}>
            <Text style={styles.primaryBtnText}>카톡 · 문자로 보내기</Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

// ---------- Settings ----------

function SettingsScreen({ settings, onChange, onBack }: { settings: Settings; onChange: (s: Settings) => void; onBack: () => void }) {
  const styles = useStyles();
  const Row = ({ label, hint, value, onValueChange }: { label: string; hint: string; value: boolean; onValueChange: (v: boolean) => void }) => (
    <View style={styles.settingRow}>
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowSub}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: ACCENT }} />
    </View>
  );

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.link}>‹ 뒤로</Text>
        </Pressable>
        <Text style={styles.h1}>설정</Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView contentContainerStyle={styles.pad}>
        <Row label="큰 글씨" hint="글자를 크게 보여줘요" value={settings.bigFont} onValueChange={(v) => onChange({ ...settings, bigFont: v })} />
        <Row
          label="폰 캘린더에도 넣기"
          hint="추가한 일정을 구글·삼성·아이폰 캘린더에도 넣어요"
          value={settings.syncCalendar}
          onValueChange={(v) => onChange({ ...settings, syncCalendar: v })}
        />
        {MOCK ? <Text style={styles.notes}>개발 모드: 샘플 데이터를 사용하고 서버에 연결하지 않아요.</Text> : null}
      </ScrollView>
    </View>
  );
}

// ---------- Styles (font sizes scale with the big-font setting) ----------

function makeStyles(s: number) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#fff", paddingTop: Platform.OS === "android" ? 32 : 0 },
    flex: { flex: 1 },
    pad: { padding: 20, gap: 12 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 },
    h1: { fontSize: 24 * s, fontWeight: "700", color: "#0F1B2D" },
    link: { fontSize: 18 * s, color: ACCENT, minWidth: 48 },
    primaryBtn: { backgroundColor: ACCENT, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
    primaryBtnText: { color: "#fff", fontSize: 17 * s, fontWeight: "700" },
    secondaryBtn: { borderWidth: 1.5, borderColor: ACCENT, borderStyle: "dashed", padding: 22, borderRadius: 12, alignItems: "center" },
    secondaryBtnText: { color: ACCENT, fontSize: 16 * s, fontWeight: "600" },
    wide: { alignSelf: "stretch" },
    disabled: { opacity: 0.4 },
    footer: { padding: 20, borderTopWidth: StyleSheet.hairlineWidth, borderColor: "#E4E7EC" },
    label: { fontSize: 14 * s, color: "#667085", fontWeight: "600" },
    input: { minHeight: 140, borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 12, padding: 14, fontSize: 17 * s, color: "#0F1B2D" },
    preview: { width: "100%", height: 260, borderRadius: 12, backgroundColor: "#F2F4F7" },
    hint: { textAlign: "center", color: "#98A2B3", marginTop: 6, fontSize: 14 * s },
    sectionHeader: { fontSize: 15 * s, fontWeight: "700", color: "#667085", paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6 },
    row: { flexDirection: "row", gap: 14, paddingHorizontal: 20, paddingVertical: 12 },
    rowTime: { width: 92 * s, fontSize: 16 * s, color: "#667085", paddingTop: 1 },
    rowTitle: { fontSize: 18 * s, color: "#0F1B2D", fontWeight: "600" },
    rowSub: { fontSize: 15 * s, color: "#667085", marginTop: 2 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
    emptyTitle: { fontSize: 20 * s, fontWeight: "700", color: "#0F1B2D" },
    emptyBody: { fontSize: 16 * s, color: "#667085", textAlign: "center", lineHeight: 24 * s },
    notes: { backgroundColor: "#FFF7E6", color: "#7A4B00", padding: 12, borderRadius: 10, fontSize: 15 * s },
    card: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#E4E7EC" },
    cardOn: { borderColor: ACCENT, backgroundColor: "#F0F5FF" },
    check: { fontSize: 22 * s, color: ACCENT, paddingTop: 1 },
    warn: { fontSize: 13 * s, color: "#B54708", marginTop: 4 },
    settingRow: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 10 },
  });
}

type Styles = ReturnType<typeof makeStyles>;
const StylesContext = createContext<Styles>(makeStyles(1));
const useStyles = () => useContext(StylesContext);
