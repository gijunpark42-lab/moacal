import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { MOCK } from "../api";
import { REMINDER_OPTIONS, type Settings } from "../settings";
import { ACCENT, useStyles } from "../styles";

export function SettingsScreen({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
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
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={styles.h1}>설정</Text>
      <Row label="큰 글씨" hint="글자를 크게 보여줘요" value={settings.bigFont} onValueChange={(v) => onChange({ ...settings, bigFont: v })} />
      <Row
        label="폰 캘린더와 연동"
        hint="폰 캘린더 일정을 함께 보여주고, 추가한 일정을 폰 캘린더에도 넣어요"
        value={settings.syncCalendar}
        onValueChange={(v) => onChange({ ...settings, syncCalendar: v })}
      />
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
      {MOCK ? <Text style={styles.notes}>개발 모드: 샘플 데이터를 사용하고 서버에 연결하지 않아요.</Text> : null}
    </ScrollView>
  );
}
