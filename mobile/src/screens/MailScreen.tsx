import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { findConflicts } from "../conflicts";
import { horizon } from "../dates";
import { connectGmail, disconnectGmail, getGmailConnection, loadHandled, scanGmail, type GmailConnection } from "../gmail";
import { ACCENT, useStyles } from "../styles";
import type { BusyBlock, ScannedMessage } from "../types";

// Recent inbox messages that contain events. Tap one to review its events like pasted text.
export function MailScreen({ busy, onOpen }: { busy: BusyBlock[]; onOpen: (message: ScannedMessage) => void }) {
  const styles = useStyles();
  const [connection, setConnection] = useState<GmailConnection | null | undefined>(undefined);
  const [messages, setMessages] = useState<ScannedMessage[] | null>(null);
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [scanned, setScanned] = useState<number | null>(null);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const [found, done] = await Promise.all([scanGmail(7), loadHandled()]);
      setMessages(found.messages);
      setScanned(found.scanned);
      setHandled(done);
    } catch (e) {
      Alert.alert("메일을 확인하지 못했어요", e instanceof Error ? e.message : "다시 시도해 주세요");
      // scanGmail clears the token when the server says the connection is gone.
      if (!(await getGmailConnection())) setConnection(null);
    } finally {
      setScanning(false);
    }
  }, []);

  // Auto-scan once if already connected.
  useEffect(() => {
    getGmailConnection().then((c) => {
      setConnection(c);
      if (c) scan();
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
    Alert.alert("Gmail 연결 해제", "저장된 Gmail 연결 정보를 지울까요?", [
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
  const visible = (messages ?? []).filter((m) => !handled.has(m.id));

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
            <Text style={[styles.hint, { marginTop: 8 }]}>메일을 읽고 일정을 찾는 중이에요. 1분 정도 걸릴 수 있어요.</Text>
          </>
        ) : (
          <Text style={styles.secondaryBtnText}>최근 7일 메일 확인</Text>
        )}
      </Pressable>
      {messages !== null && !scanning ? (
        <Text style={styles.hint}>
          최근 7일 메일 {scanned ?? 0}통 확인 · 일정 있는 메일 {messages.length}통{visible.length < messages.length ? ` · 처리한 메일 ${messages.length - visible.length}통 숨김` : ""}
        </Text>
      ) : null}
      {messages !== null && visible.length === 0 && !scanning ? <Text style={styles.emptyBody}>일정이 있는 메일이 없어요</Text> : null}
      {visible.map((m) => {
        const conflict = findConflicts(m.events, busy, from, to).size > 0;
        const d = new Date(m.date);
        return (
          <Pressable key={m.id} style={[styles.card, conflict && styles.cardConflict]} onPress={() => onOpen(m)}>
            <View style={styles.flex}>
              <Text style={styles.rowTitle} numberOfLines={2}>
                {m.subject || "(제목 없음)"}
              </Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {m.from} · {d.getMonth() + 1}/{d.getDate()} · 일정 {m.events.length}개
              </Text>
              {conflict ? <Text style={styles.warn}>⚠ 기존 일정과 겹침</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
