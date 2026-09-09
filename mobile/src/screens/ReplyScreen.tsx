import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from "react-native";
import { reply as draftReply, type Source } from "../api";
import { formatShort, toDate } from "../dates";
import { detectLanguage } from "../mailTemplates";
import { TONE_LABELS, type Tone } from "../settings";
import { ACCENT, useStyles } from "../styles";
import type { ReplyEvent, Slot } from "../types";

// After saving: draft a message back to whoever sent the schedule, offering free slots for anything declined.
// Drafting costs tokens, so it only happens when the user presses the button.
export function ReplyScreen({
  accepted,
  declined,
  alternatives,
  source,
  defaultTone,
  onDone,
}: {
  accepted: ReplyEvent[];
  declined: ReplyEvent[];
  alternatives: Slot[];
  source: Source;
  defaultTone: Tone;
  onDone: () => void;
}) {
  const styles = useStyles();
  const [tone, setTone] = useState<Tone>(defaultTone);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const conflicted = declined.filter((d) => d.conflict);
  const lang = source.text ? detectLanguage(source.text) : null;

  const generate = async () => {
    setBusy(true);
    try {
      setDraft(await draftReply(source, accepted, declined, alternatives, tone));
    } catch (e) {
      Alert.alert("답장을 만들지 못했어요", e instanceof Error ? e.message : "다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  };

  // The share sheet lets the user pick Gmail, KakaoTalk, Messages, etc. Sending is always their tap.
  const share = () => draft && Share.share({ message: draft });
  // Reply to the original mail: opens the mail app prefilled, the user still hits send.
  const email = source.email;
  const replyByMail = () =>
    draft &&
    email &&
    Linking.openURL(`mailto:${email.to}?subject=${encodeURIComponent(`Re: ${email.subject}`)}&body=${encodeURIComponent(draft)}`).catch(() =>
      Alert.alert("메일 앱을 열지 못했어요", "다른 앱으로 보내기를 이용해 주세요"),
    );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <View style={{ width: 48 }} />
        <Text style={styles.h1}>{accepted.length > 0 ? "저장 완료" : "답장"}</Text>
        <Pressable onPress={onDone} hitSlop={12}>
          <Text style={styles.link}>완료</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <Text style={styles.emptyBody}>
          {accepted.length}개 일정을 넣었어요{declined.length ? `, ${declined.length}개는 뺐어요` : ""}.
        </Text>
        {conflicted.length > 0 && (
          <View style={styles.notes}>
            <Text style={styles.notes}>{conflicted.map((d) => `"${d.title}"은 ${d.conflict}`).join("\n")}</Text>
            {alternatives.length > 0 ? (
              <Text style={[styles.rowSub, { marginTop: 8 }]}>대신 제안할 빈 시간: {alternatives.map((s) => formatShort(toDate(s.start))).join(", ")}</Text>
            ) : null}
          </View>
        )}
        <Text style={styles.label}>보낸 사람에게 답장{lang ? ` · ${lang === "ko" ? "한국어" : "English"}로 작성` : ""}</Text>
        <View style={[styles.row, { gap: 8 }]}>
          {(["formal", "casual"] as Tone[]).map((t) => (
            <Pressable key={t} style={[styles.chip, tone === t && styles.chipOn]} onPress={() => setTone(t)}>
              <Text style={[styles.chipText, tone === t && styles.chipTextOn]}>{TONE_LABELS[t]}</Text>
            </Pressable>
          ))}
        </View>
        {draft === null ? (
          <Pressable style={[styles.secondaryBtn, busy && styles.disabled]} onPress={generate} disabled={busy}>
            {busy ? <ActivityIndicator color={ACCENT} /> : <Text style={styles.secondaryBtnText}>답장 초안 만들기</Text>}
          </Pressable>
        ) : (
          <>
            <TextInput style={styles.input} multiline value={draft} onChangeText={setDraft} textAlignVertical="top" />
            <Text style={styles.hint}>고쳐서 보내도 돼요. 전송은 이메일·카톡 앱에서 직접 눌러요.</Text>
            <Pressable onPress={generate} disabled={busy} hitSlop={8}>
              <Text style={[styles.hint, { color: ACCENT }]}>{busy ? "다시 만드는 중…" : "지금 말투로 다시 만들기"}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
      {draft !== null && (
        <View style={[styles.footer, { gap: 10 }]}>
          {email ? (
            <Pressable style={[styles.primaryBtn, styles.wide]} onPress={replyByMail}>
              <Text style={styles.primaryBtnText}>Gmail로 답장하기</Text>
            </Pressable>
          ) : null}
          <Pressable style={[email ? styles.secondaryBtn : styles.primaryBtn, styles.wide]} onPress={share}>
            <Text style={email ? styles.secondaryBtnText : styles.primaryBtnText}>{email ? "다른 앱으로 보내기" : "이메일 · 카톡으로 보내기"}</Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
