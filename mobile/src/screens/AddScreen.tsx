import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { parse, type Source } from "../api";
import { useStyles } from "../styles";
import type { ParsedEvent } from "../types";
import { ManualForm } from "./ManualForm";

type Mode = "manual" | "ai";

export function AddScreen({
  defaultDate,
  onBack,
  onParsed,
  onManual,
}: {
  defaultDate: string;
  onBack: () => void;
  onParsed: (parsed: ParsedEvent[], notes: string, source: Source) => void;
  onManual: (event: ParsedEvent) => void;
}) {
  const styles = useStyles();
  const [mode, setMode] = useState<Mode>("ai");

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.link}>‹ 뒤로</Text>
        </Pressable>
        <Text style={styles.h1}>일정 추가</Text>
        <View style={{ width: 48 }} />
      </View>
      <View style={[styles.row, { paddingHorizontal: 20, gap: 8, paddingBottom: 8 }]}>
        {(
          [
            ["ai", "이메일·카톡·사진에서 찾기"],
            ["manual", "직접 입력"],
          ] as [Mode, string][]
        ).map(([key, label]) => (
          <Pressable key={key} style={[styles.chip, mode === key && styles.chipOn]} onPress={() => setMode(key)}>
            <Text style={[styles.chipText, mode === key && styles.chipTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {mode === "manual" ? <ManualForm defaultDate={defaultDate} onSave={onManual} /> : <AiInput onParsed={onParsed} />}
    </KeyboardAvoidingView>
  );
}

// Paste text or pick a screenshot; the API finds the events.
function AiInput({ onParsed }: { onParsed: (parsed: ParsedEvent[], notes: string, source: Source) => void }) {
  const styles = useStyles();
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ uri: string; data: string; mediaType: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6, base64: true });
    const asset = result.assets?.[0];
    if (result.canceled || !asset?.base64) return;
    // The picker re-encodes as JPEG when quality < 1; the server checks the real bytes anyway.
    setImage({ uri: asset.uri, data: asset.base64, mediaType: "image/jpeg" });
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
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>이메일 · 카톡 붙여넣기</Text>
        <TextInput
          style={styles.input}
          multiline
          placeholder="이메일, 카톡 대화, 문자 내용을 붙여넣으세요"
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
    </View>
  );
}
