import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from "react-native";
import { durationMinutes, freeSlots } from "../conflicts";
import { formatShort, toDate, toLocalString } from "../dates";
import { cancelMail, detectLanguage, openCompose, rescheduleMail } from "../mailTemplates";
import { TONE_LABELS, type Tone } from "../settings";
import { useStyles } from "../styles";
import type { BusyBlock, ScannedMessage } from "../types";
import type { MailAction } from "./MailScreen";

// Reschedule or cancel by mail, from a template: no AI, no tokens. The user edits the text and sends it from the mail app.
export function MailActionScreen({
  message,
  action,
  busy,
  defaultTone,
  onDone,
}: {
  message: ScannedMessage;
  action: MailAction;
  busy: BusyBlock[];
  defaultTone: Tone;
  onDone: () => void;
}) {
  const styles = useStyles();
  const [tone, setTone] = useState<Tone>(defaultTone);
  const [newStart, setNewStart] = useState<string | null>(null);
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const [custom, setCustom] = useState<Date>(() => new Date());
  const [edited, setEdited] = useState<string | null>(null); // user's own edits win over the template

  const event = message.events[0];
  const lang = detectLanguage(`${message.subject}\n${message.text}`);
  const suggestions = useMemo(() => {
    if (!event || !event.start.includes("T")) return [];
    return freeSlots(busy, durationMinutes(event), toDate(event.start), 7, 3);
  }, [event, busy]);

  const template = action === "reschedule" ? rescheduleMail(message, tone, newStart) : cancelMail(message, tone);
  const body = edited ?? template.body;

  const onPick = (e: DateTimePickerEvent, value?: Date) => {
    if (Platform.OS === "android") setPicker(null);
    if (e.type !== "set" || !value) return;
    if (Platform.OS === "android" && picker === "date") {
      // Android: date dialog first, then time dialog.
      const merged = new Date(value.getFullYear(), value.getMonth(), value.getDate(), custom.getHours(), custom.getMinutes());
      setCustom(merged);
      setPicker("time");
      return;
    }
    setCustom(value);
    setNewStart(toLocalString(value));
    setEdited(null);
  };

  const send = () =>
    openCompose(message.fromEmail, { subject: template.subject, body }).catch(() =>
      Share.share({ message: body }).catch(() => Alert.alert("메일 앱을 열지 못했어요", "본문을 복사해서 보내주세요")),
    );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <Pressable onPress={onDone} hitSlop={12}>
          <Text style={styles.link}>‹ 뒤로</Text>
        </Pressable>
        <Text style={styles.h1}>{action === "reschedule" ? "시간 변경 메일" : "취소 메일"}</Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <Text style={styles.rowSub}>받는 사람: {message.fromEmail}</Text>
        <Text style={styles.rowSub}>
          {event ? `${event.title} · ${formatShort(toDate(event.start))}` : message.subject} · {lang === "ko" ? "한국어" : "English"}로 작성
        </Text>

        <Text style={styles.label}>말투</Text>
        <View style={[styles.row, { gap: 8 }]}>
          {(["formal", "casual"] as Tone[]).map((t) => (
            <Pressable
              key={t}
              style={[styles.chip, tone === t && styles.chipOn]}
              onPress={() => {
                setTone(t);
                setEdited(null);
              }}
            >
              <Text style={[styles.chipText, tone === t && styles.chipTextOn]}>{TONE_LABELS[t]}</Text>
            </Pressable>
          ))}
        </View>

        {action === "reschedule" && (
          <>
            <Text style={styles.label}>제안할 새 시간 (내 일정과 안 겹치는 시간)</Text>
            <View style={[styles.row, { gap: 8, flexWrap: "wrap" }]}>
              {suggestions.map((s) => (
                <Pressable
                  key={s.start}
                  style={[styles.chip, newStart === s.start && styles.chipOn]}
                  onPress={() => {
                    setNewStart(s.start);
                    setEdited(null);
                  }}
                >
                  <Text style={[styles.chipText, newStart === s.start && styles.chipTextOn]}>{formatShort(toDate(s.start))}</Text>
                </Pressable>
              ))}
              <Pressable style={[styles.chip, newStart !== null && !suggestions.some((s) => s.start === newStart) && styles.chipOn]} onPress={() => setPicker("date")}>
                <Text style={[styles.chipText, newStart !== null && !suggestions.some((s) => s.start === newStart) && styles.chipTextOn]}>
                  {newStart && !suggestions.some((s) => s.start === newStart) ? formatShort(toDate(newStart)) : "직접 고르기"}
                </Text>
              </Pressable>
            </View>
            {picker && (
              <DateTimePicker
                value={custom}
                mode={Platform.OS === "ios" ? "datetime" : picker}
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
            {!newStart ? <Text style={styles.hint}>시간을 고르지 않으면 "가능한 시간을 알려달라"는 내용으로 보내요.</Text> : null}
          </>
        )}

        <Text style={styles.label}>메일 내용 (고쳐도 돼요)</Text>
        <TextInput style={styles.input} multiline value={body} onChangeText={setEdited} textAlignVertical="top" />
        <Text style={styles.hint}>제목: {template.subject}</Text>
      </ScrollView>
      <View style={styles.footer}>
        <Pressable style={[styles.primaryBtn, styles.wide]} onPress={send}>
          <Text style={styles.primaryBtnText}>메일 앱에서 보내기</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
