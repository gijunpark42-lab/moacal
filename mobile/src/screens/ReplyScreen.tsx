import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from "react-native";
import { reply as draftReply, type Source } from "../api";
import { formatShort, toDate } from "../dates";
import { ACCENT, useStyles } from "../styles";
import type { ReplyEvent, Slot } from "../types";

// After saving: draft a message back to whoever sent the schedule, offering free slots for anything declined.
export function ReplyScreen({
  accepted,
  declined,
  alternatives,
  source,
  onDone,
}: {
  accepted: ReplyEvent[];
  declined: ReplyEvent[];
  alternatives: Slot[];
  source: Source;
  onDone: () => void;
}) {
  const styles = useStyles();
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const conflicted = declined.filter((d) => d.conflict);

  const generate = async () => {
    setBusy(true);
    try {
      setDraft(await draftReply(source, accepted, declined, alternatives));
    } catch (e) {
      Alert.alert("답장을 만들지 못했어요", e instanceof Error ? e.message : "다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  };

  // The share sheet lets the user pick Gmail, KakaoTalk, Messages, etc. Sending is always their tap.
  const share = () => draft && Share.share({ message: draft });

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
            <Text style={styles.notes}>
              {conflicted.map((d) => `"${d.title}"은 ${d.conflict}`).join("\n")}
            </Text>
            {alternatives.length > 0 ? (
              <Text style={[styles.rowSub, { marginTop: 8 }]}>
                대신 제안할 빈 시간: {alternatives.map((s) => formatShort(toDate(s.start))).join(", ")}
              </Text>
            ) : null}
          </View>
        )}
        <Text style={styles.label}>보낸 사람에게 답장</Text>
        {draft === null ? (
          <Pressable style={[styles.secondaryBtn, busy && styles.disabled]} onPress={generate} disabled={busy}>
            {busy ? <ActivityIndicator color={ACCENT} /> : <Text style={styles.secondaryBtnText}>답장 초안 만들기</Text>}
          </Pressable>
        ) : (
          <>
            <TextInput style={styles.input} multiline value={draft} onChangeText={setDraft} textAlignVertical="top" />
            <Text style={styles.hint}>고쳐서 보내도 돼요. 전송은 이메일·카톡 앱에서 직접 눌러요.</Text>
          </>
        )}
      </ScrollView>
      {draft !== null && (
        <View style={styles.footer}>
          <Pressable style={[styles.primaryBtn, styles.wide]} onPress={share}>
            <Text style={styles.primaryBtnText}>이메일 · 카톡으로 보내기</Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
