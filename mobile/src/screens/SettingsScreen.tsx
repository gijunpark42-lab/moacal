import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { MOCK } from "../api";
import { requestPermission, targetIsGoogle } from "../calendar";
import { connectGmail, disconnectGmail, getGmailConnection, type GmailConnection } from "../gmail";
import { calendarStatus, type CalendarStatus } from "../phoneCalendar";
import { REMINDER_OPTIONS, TONE_LABELS, type Settings, type Tone } from "../settings";
import { ACCENT, useStyles } from "../styles";

export function SettingsScreen({
  settings,
  onChange,
  onRefreshCalendar,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onRefreshCalendar: () => Promise<void>;
}) {
  const styles = useStyles();
  const [gmail, setGmail] = useState<GmailConnection | null>(null);
  const [cal, setCal] = useState<CalendarStatus | null>(null);
  const [googleTarget, setGoogleTarget] = useState(false);
  useEffect(() => {
    getGmailConnection().then(setGmail);
    calendarStatus().then(setCal);
    targetIsGoogle()
      .then(setGoogleTarget)
      .catch(() => setGoogleTarget(false));
  }, []);
  const fixCalendar = async () => {
    if (cal?.permission === "denied") {
      Linking.openSettings();
      return;
    }
    await requestPermission();
    await onRefreshCalendar();
    setCal(await calendarStatus());
  };
  const calendarLine = !cal
    ? "확인 중…"
    : cal.permission === "granted"
      ? cal.writable
        ? `권한 허용됨 · 폰 캘린더 ${cal.calendars}개 · 새 일정은 "${cal.writable}"에 들어가요`
        : "권한은 있는데 쓸 수 있는 캘린더가 없어요. 폰 캘린더 앱에서 계정(iCloud/구글)을 켜주세요"
      : cal.permission === "denied"
        ? "권한이 거부돼 있어요. 설정 열기를 눌러 캘린더 접근을 허용해 주세요"
        : "아직 권한을 묻지 않았어요. 권한 요청을 눌러주세요";
  const toggleGmail = async () => {
    try {
      if (gmail) {
        await disconnectGmail();
        setGmail(null);
      } else {
        setGmail(await connectGmail());
      }
    } catch (e) {
      Alert.alert("Gmail 연결에 실패했어요", e instanceof Error ? e.message : "다시 시도해 주세요");
    }
  };
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
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={styles.h1}>설정</Text>
      <Row label="큰 글씨" hint="글자를 크게 보여줘요" value={settings.bigFont} onValueChange={(v) => onChange({ ...settings, bigFont: v })} />
      <Row
        label="폰 캘린더와 연동"
        hint="폰 캘린더 일정을 함께 보여주고, 추가한 일정을 폰 캘린더에도 넣어요"
        value={settings.syncCalendar}
        onValueChange={(v) => {
          onChange({ ...settings, syncCalendar: v });
          if (v) fixCalendar();
        }}
      />
      {settings.syncCalendar ? (
        <View style={{ gap: 6, paddingLeft: 4 }}>
          <View style={[styles.row, { gap: 12 }]}>
            <Text style={[styles.rowSub, styles.flex]}>{calendarLine}</Text>
            {cal && (cal.permission !== "granted" || !cal.writable) ? (
              <Pressable onPress={fixCalendar} hitSlop={12}>
                <Text style={styles.link}>{cal.permission === "denied" ? "설정 열기" : "권한 요청"}</Text>
              </Pressable>
            ) : null}
          </View>
          {cal?.writable ? (
            <Pressable onPress={() => Linking.openURL("https://calendar.google.com/")} hitSlop={8}>
              <Text style={[styles.rowSub, { color: ACCENT }]}>
                {googleTarget ? "구글 캘린더에 저장돼요 → 웹(calendar.google.com)에서도 같은 일정을 볼 수 있어요" : "구글 계정 캘린더를 폰에 추가하면 웹에서도 같은 일정을 볼 수 있어요 · calendar.google.com"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={{ paddingVertical: 10 }}>
        <Text style={styles.rowTitle}>일정 알림</Text>
        <Text style={styles.rowSub}>시간이 되기 전에 알려줘요</Text>
        <View style={[styles.row, { gap: 8, marginTop: 10, flexWrap: "wrap" }]}>
          {REMINDER_OPTIONS.map((m) => {
            const on = settings.reminderMinutes === m;
            return (
              <Pressable key={m} style={[styles.chip, on && styles.chipOn]} onPress={() => onChange({ ...settings, reminderMinutes: m })}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{m === 0 ? "끄기" : `${m}분 전`}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={{ paddingVertical: 10 }}>
        <Text style={styles.rowTitle}>답장 말투</Text>
        <Text style={styles.rowSub}>답장 초안과 시간 변경·취소 메일의 기본 말투예요. 언어는 받은 메일의 언어를 따라가요.</Text>
        <View style={[styles.row, { gap: 8, marginTop: 10 }]}>
          {(["formal", "casual"] as Tone[]).map((t) => {
            const on = settings.tone === t;
            return (
              <Pressable key={t} style={[styles.chip, on && styles.chipOn]} onPress={() => onChange({ ...settings, tone: t })}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{TONE_LABELS[t]}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.settingRow}>
        <View style={styles.flex}>
          <Text style={styles.rowTitle}>Gmail</Text>
          <Text style={styles.rowSub}>{gmail ? `연결됨 · ${gmail.email}` : "연결 안 됨"}</Text>
        </View>
        <Pressable onPress={toggleGmail} hitSlop={12}>
          <Text style={styles.link}>{gmail ? "연결 해제" : "연결"}</Text>
        </Pressable>
      </View>
      {MOCK ? <Text style={styles.notes}>개발 모드: 샘플 데이터를 사용하고 서버에 연결하지 않아요.</Text> : null}
    </ScrollView>
  );
}
