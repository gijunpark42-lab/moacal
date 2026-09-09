import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SwipeRow } from "../components/SwipeRow";
import { findConflicts } from "../conflicts";
import { formatShort, horizon } from "../dates";
import { connectGmail, disconnectGmail, getGmailConnection, hideMessage, loadHandled, loadScanCache, scanGmail, type GmailConnection } from "../gmail";
import { extractLinks } from "../mailTemplates";
import { ACCENT, useStyles } from "../styles";
import type { BusyBlock, ScannedMessage } from "../types";

export type MailAction = "reschedule" | "cancel";

const KEEP_DAYS = 7;

// Recent inbox messages that contain events. Everything shown here comes from the on-device cache;
// only the "새 메일 확인" button talks to the server (and spends tokens).
export function MailScreen({
  busy,
  onOpen,
  onAction,
}: {
  busy: BusyBlock[];
  onOpen: (message: ScannedMessage) => void;
  onAction: (message: ScannedMessage, action: MailAction) => void;
}) {
  const styles = useStyles();
  const [connection, setConnection] = useState<GmailConnection | null | undefined>(undefined);
  const [messages, setMessages] = useState<ScannedMessage[] | null>(null);
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [scanned, setScanned] = useState<number | null>(null);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const [cache, done] = await Promise.all([scanGmail(KEEP_DAYS), loadHandled()]);
      setMessages(cache.messages);
      setScanned(cache.lastScanned);
      setLastScanAt(cache.lastScanAt);
      setHandled(done);
    } catch (e) {
      Alert.alert("메일을 확인하지 못했어요", e instanceof Error ? e.message : "다시 시도해 주세요");
      // scanGmail clears the token when the server says the connection is gone.
      if (!(await getGmailConnection())) setConnection(null);
    } finally {
      setScanning(false);
    }
  }, []);

  // Show what the last scan found. Only scan automatically when there is no cache at all,
  // so opening this tab never re-reads (and re-pays for) mail on its own.
  useEffect(() => {
    Promise.all([getGmailConnection(), loadScanCache(), loadHandled()]).then(([c, cache, done]) => {
      setConnection(c);
      setHandled(done);
      if (!c) return;
      if (cache) {
        setMessages(cache.messages);
        setScanned(cache.lastScanned);
        setLastScanAt(cache.lastScanAt);
      } else {
        scan();
      }
    });
  }, [scan]);

  const connect = async () => {
    setConnecting(true);
    try {
      const c = await connectGmail();
      if (c) {
        setConnection(c);
        scan();
      }
    } catch (e) {
      Alert.alert("Gmail을 연결하지 못했어요", e instanceof Error ? e.message : "다시 시도해 주세요");
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    Alert.alert("Gmail 연결 해제", "저장된 Gmail 연결 정보와 메일 목록을 지울까요?", [
      { text: "취소", style: "cancel" },
      {
        text: "해제",
        style: "destructive",
        onPress: async () => {
          await disconnectGmail();
          setConnection(null);
          setMessages(null);
        },
      },
    ]);
  };

  const hide = async (id: string) => {
    const next = await hideMessage(id);
    if (next) setMessages(next.messages);
  };

  if (connection === undefined) return null;

  if (!connection) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>이메일에서 일정을 자동으로 찾아요</Text>
        <Text style={styles.emptyBody}>Gmail을 연결하면 최근 메일 중{"\n"}일정이 들어 있는 메일을 골라서 보여 드려요.</Text>
        <Pressable style={[styles.primaryBtn, { marginTop: 12 }, connecting && styles.disabled]} onPress={connect} disabled={connecting}>
          {connecting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Gmail 연결하기</Text>}
        </Pressable>
      </View>
    );
  }

  const { from, to } = horizon(120);
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  // Everything from the last week stays visible, handled or not; nothing here costs tokens.
  const visible = (messages ?? []).filter((m) => new Date(m.date).getTime() >= cutoff);

  return (
    <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: 100 }]}>
      <Text style={styles.h1}>메일</Text>
      <View style={[styles.row, { justifyContent: "space-between" }]}>
        <Text style={[styles.rowSub, styles.flex]} numberOfLines={1}>
          {connection.email}
        </Text>
        <Pressable onPress={disconnect} hitSlop={12}>
          <Text style={styles.link}>연결 해제</Text>
        </Pressable>
      </View>
      <Pressable style={[styles.secondaryBtn, scanning && styles.disabled]} onPress={scan} disabled={scanning}>
        {scanning ? (
          <>
            <ActivityIndicator color={ACCENT} />
            <Text style={[styles.hint, { marginTop: 8 }]}>새 메일을 읽고 일정을 찾는 중이에요.</Text>
          </>
        ) : (
          <Text style={styles.secondaryBtnText}>{lastScanAt ? "새 메일 확인" : "최근 7일 메일 확인"}</Text>
        )}
      </Pressable>
      {messages !== null && !scanning ? (
        <Text style={styles.hint}>
          {lastScanAt ? `마지막 확인 ${formatShort(new Date(lastScanAt))} · ` : ""}
          {lastScanAt ? "새 메일" : "최근 7일 메일"} {scanned ?? 0}통 읽음 · 일정 있는 메일 {visible.length}통
        </Text>
      ) : null}
      {messages !== null && visible.length === 0 && !scanning ? <Text style={styles.emptyBody}>일정이 있는 메일이 없어요</Text> : null}
      {visible.length > 0 ? <Text style={styles.hint}>← 옆으로 밀면 시간 변경 · 취소 메일 · 숨기기</Text> : null}
      {visible.map((m) => {
        const conflict = findConflicts(m.events, busy, from, to).size > 0;
        const done = handled.has(m.id);
        const d = new Date(m.date);
        const links = extractLinks(m.text);
        return (
          <SwipeRow
            key={m.id}
            actions={[
              { label: "시간 변경", color: ACCENT, onPress: () => onAction(m, "reschedule") },
              { label: "취소 메일", color: "#B54708", onPress: () => onAction(m, "cancel") },
              { label: "숨기기", color: "#667085", onPress: () => hide(m.id) },
            ]}
          >
            <Pressable style={[styles.card, { backgroundColor: "#fff" }, conflict && !done && styles.cardConflict, done && styles.muted]} onPress={() => onOpen(m)}>
              <View style={styles.flex}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {m.subject || "(제목 없음)"}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {m.from} · {d.getMonth() + 1}/{d.getDate()} · 일정 {m.events.length}개
                </Text>
                <Text style={styles.rowSub} numberOfLines={1} selectable>
                  {m.fromEmail}
                </Text>
                {links.length > 0 ? (
                  <View style={[styles.row, { gap: 6, marginTop: 6, flexWrap: "wrap" }]}>
                    {links.map((l) => (
                      <Pressable key={l.url} style={styles.linkChip} onPress={() => Linking.openURL(l.url).catch(() => Alert.alert("링크를 열지 못했어요", l.url))}>
                        <Text style={styles.linkChipText}>🔗 {l.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {conflict && !done ? <Text style={styles.warn}>⚠ 기존 일정과 겹침</Text> : null}
                {done ? <Text style={styles.badge}>처리됨</Text> : null}
              </View>
            </Pressable>
          </SwipeRow>
        );
      })}
    </ScrollView>
  );
}
