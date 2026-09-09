import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { parse } from "./src/api";
import { describeRecurrence, expand, formatDateHeader, formatTimeRange, horizon, splitStart, toDateKey } from "./src/dates";
import { loadEvents, saveEvents } from "./src/storage";
import type { Occurrence, ParsedEvent, StoredEvent } from "./src/types";

type Screen = { name: "home" } | { name: "add" } | { name: "review"; parsed: ParsedEvent[]; notes: string };

const ACCENT = "#2D6CDF";

export default function App() {
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState<Screen>({ name: "home" });

  useEffect(() => {
    loadEvents().then((e) => {
      setEvents(e);
      setLoaded(true);
    });
  }, []);

  const persist = useCallback((next: StoredEvent[]) => {
    setEvents(next);
    saveEvents(next);
  }, []);

  const addEvents = (parsed: ParsedEvent[]) => {
    const createdAt = new Date().toISOString();
    const added = parsed.map((p, i) => ({ ...p, id: `${Date.now()}-${i}`, createdAt }));
    persist([...events, ...added]);
    setScreen({ name: "home" });
  };

  const removeEvent = (id: string) => persist(events.filter((e) => e.id !== id));

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      {!loaded ? null : screen.name === "home" ? (
        <Home events={events} onAdd={() => setScreen({ name: "add" })} onRemove={removeEvent} />
      ) : screen.name === "add" ? (
        <Add onBack={() => setScreen({ name: "home" })} onParsed={(parsed, notes) => setScreen({ name: "review", parsed, notes })} />
      ) : (
        <Review parsed={screen.parsed} notes={screen.notes} onBack={() => setScreen({ name: "add" })} onConfirm={addEvents} />
      )}
    </SafeAreaView>
  );
}

// ---------- Home: agenda list ----------

function Home({ events, onAdd, onRemove }: { events: StoredEvent[]; onAdd: () => void; onRemove: (id: string) => void }) {
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

function Add({ onBack, onParsed }: { onBack: () => void; onParsed: (parsed: ParsedEvent[], notes: string) => void }) {
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
    try {
      const result = await parse({ text: text.trim() || undefined, image: image ? { data: image.data, mediaType: image.mediaType } : undefined });
      onParsed(result.events, result.notes);
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

function Review({ parsed, notes, onBack, onConfirm }: { parsed: ParsedEvent[]; notes: string; onBack: () => void; onConfirm: (kept: ParsedEvent[]) => void }) {
  const [checked, setChecked] = useState<boolean[]>(() => parsed.map((p) => p.confidence >= 0.5));
  const kept = parsed.filter((_, i) => checked[i]);
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
        <Pressable style={[styles.primaryBtn, styles.wide, kept.length === 0 && styles.disabled]} onPress={() => onConfirm(kept)} disabled={kept.length === 0}>
          <Text style={styles.primaryBtnText}>{kept.length}개 캘린더에 추가</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff", paddingTop: Platform.OS === "android" ? 32 : 0 },
  flex: { flex: 1 },
  pad: { padding: 20, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 },
  h1: { fontSize: 24, fontWeight: "700", color: "#0F1B2D" },
  link: { fontSize: 18, color: ACCENT, width: 48 },
  primaryBtn: { backgroundColor: ACCENT, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  secondaryBtn: { borderWidth: 1.5, borderColor: ACCENT, borderStyle: "dashed", padding: 22, borderRadius: 12, alignItems: "center" },
  secondaryBtnText: { color: ACCENT, fontSize: 16, fontWeight: "600" },
  wide: { alignSelf: "stretch" },
  disabled: { opacity: 0.4 },
  footer: { padding: 20, borderTopWidth: StyleSheet.hairlineWidth, borderColor: "#E4E7EC" },
  label: { fontSize: 14, color: "#667085", fontWeight: "600" },
  input: { minHeight: 140, borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 12, padding: 14, fontSize: 17, color: "#0F1B2D" },
  preview: { width: "100%", height: 260, borderRadius: 12, backgroundColor: "#F2F4F7" },
  hint: { textAlign: "center", color: "#98A2B3", marginTop: 6 },
  sectionHeader: { fontSize: 15, fontWeight: "700", color: "#667085", paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6 },
  row: { flexDirection: "row", gap: 14, paddingHorizontal: 20, paddingVertical: 12 },
  rowTime: { width: 92, fontSize: 16, color: "#667085", paddingTop: 1 },
  rowTitle: { fontSize: 18, color: "#0F1B2D", fontWeight: "600" },
  rowSub: { fontSize: 15, color: "#667085", marginTop: 2 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#0F1B2D" },
  emptyBody: { fontSize: 16, color: "#667085", textAlign: "center", lineHeight: 24 },
  notes: { backgroundColor: "#FFF7E6", color: "#7A4B00", padding: 12, borderRadius: 10, fontSize: 15 },
  card: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#E4E7EC" },
  cardOn: { borderColor: ACCENT, backgroundColor: "#F0F5FF" },
  check: { fontSize: 22, color: ACCENT, paddingTop: 1 },
  warn: { fontSize: 13, color: "#B54708", marginTop: 4 },
});
