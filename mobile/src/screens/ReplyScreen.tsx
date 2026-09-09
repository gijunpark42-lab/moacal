import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from "react-native";
import { reply as draftReply, type Source } from "../api";
import { formatShort, toDate } from "../dates";
import { detectLanguage, LANG_LABELS, LANGS, openCompose, type Lang } from "../mailTemplates";
import { TONE_LABELS, type Tone } from "../settings";
import { ACCENT, useStyles } from "../styles";
import type { ReplyEvent, Slot } from "../types";

// After saving: draft a message back to whoever sent the schedule, offering free slots for anything declined.
// Drafting costs tokens, so it only happens when the user taps a language chip (or "다시 만들기").
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
  const [lang, setLang] = useState<Lang>(() => (source.text ? detectLanguage(source.text) : "ko"));
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const conflicted = declined.filter((d) => d.conflict);

  const generate = async (useLang: Lang = lang, useTone: Tone = tone) => {
    setBusy(true);
    try {
      setDraft(await draftReply(source, accepted, declined, alternatives, useTone, useLang));
    } catch (e) {
      Alert.alert("답장을 만들지 못했어요", e instanceof Error ? e.message : "다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  };

  // Tapping a language generates right away in that language (one token spend per tap).
  const pickLang = (l: Lang) => {
    setLang(l);
    generate(l, tone);
  };

  // The share sheet lets the user pick Gmail, KakaoTalk, Messages, etc. Sending is always their tap.
  const share = () => draft && Share.share({ message: draft });
  // Reply to the original mail in the Gmail app (falls back to the default mail app).
  const email = source.email;
  const replyByMail = () =>
    draft &&
    email &&
    openCompose(email.to, { subject: `Re: ${email.subject}`, body: draft }).catch(() => Alert.alert("메일 앱을 열지 못했어요", "다른 앱으로 보내기를 이용해 주세요"));

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

        <Text style={styles.label}>말투</Text>
        <View style={[styles.row, { gap: 8 }]}>
          {(["formal", "casual"] as Tone[]).map((t) => (
            <Pressable key={t} style={[styles.chip, tone === t && styles.chipOn]} onPress={() => setTone(t)} disabled={busy}>
              <Text style={[styles.chipText, tone === t && styles.chipTextOn]}>{TONE_LABELS[t]}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>답장 언어 · 누르면 그 언어로 만들어요</Text>
        <View style={[styles.row, { gap: 8, flexWrap: "wrap" }]}>
          {LANGS.map((l) => (
            <Pressable key={l} style={[styles.chip, lang === l && draft !== null && styles.chipOn, busy && styles.disabled]} onPress={() => pickLang(l)} disabled={busy}>
              <Text style={[styles.chipText, lang === l && draft !== null && styles.chipTextOn]}>{LANG_LABELS[l]}</Text>
            </Pressable>
          ))}
        </View>
        {busy ? (
          <View style={[styles.row, { gap: 10, justifyContent: "center", paddingVertical: 12 }]}>
            <ActivityIndicator color={ACCENT} />
            <Text style={styles.hint}>{LANG_LABELS[lang]}로 답장을 쓰는 중…</Text>
          </View>
        ) : null}
        {draft === null && !busy ? <Text style={styles.hint}>위에서 언어를 누르면 답장 초안이 만들어져요. (추천: {LANG_LABELS[lang]})</Text> : null}
        {draft !== null && !busy ? (
          <>
            <TextInput style={styles.input} multiline value={draft} onChangeText={setDraft} textAlignVertical="top" />
            <Text style={styles.hint}>고쳐서 보내도 돼요. 전송은 이메일·카톡 앱에서 직접 눌러요.</Text>
            <Pressable onPress={() => generate()} hitSlop={8}>
              <Text style={[styles.hint, { color: ACCENT }]}>지금 말투·언어로 다시 만들기</Text>
            </Pressable>
          </>
        ) : null}
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
