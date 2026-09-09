import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { describeConflict, findConflicts, type Conflict } from "../conflicts";
import { describeRecurrence, formatTimeRange, horizon, splitStart } from "../dates";
import { useStyles } from "../styles";
import type { BusyBlock, ParsedEvent } from "../types";

export interface Decision {
  event: ParsedEvent;
  conflict?: Conflict;
}

// Pick which found events to keep. Events that clash with the existing calendar start unchecked and are flagged.
export function ReviewScreen({
  parsed,
  notes,
  busy,
  onBack,
  onConfirm,
}: {
  parsed: ParsedEvent[];
  notes: string;
  busy: BusyBlock[];
  onBack: () => void;
  onConfirm: (kept: Decision[], declined: Decision[]) => void;
}) {
  const styles = useStyles();
  const conflicts = useMemo(() => {
    const { from, to } = horizon(120);
    return findConflicts(parsed, busy, from, to);
  }, [parsed, busy]);
  const [checked, setChecked] = useState<boolean[]>(() => parsed.map((p, i) => p.confidence >= 0.5 && !conflicts.has(i)));
  const toggle = (i: number) => setChecked((c) => c.map((v, j) => (j === i ? !v : v)));

  useEffect(() => {
    if (conflicts.size > 0) {
      const lines = [...conflicts.entries()].map(([i, c]) => `• ${parsed[i].title}: ${describeConflict(c)}`);
      Alert.alert(`기존 일정과 겹치는 게 ${conflicts.size}개 있어요`, `${lines.join("\n")}\n\n체크를 풀어두면 답장에서 다른 시간을 제안해 드려요.`);
    }
    // Only on first render for this batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decisions: Decision[] = parsed.map((event, i) => ({ event, conflict: conflicts.get(i) }));
  const kept = decisions.filter((_, i) => checked[i]);
  const declined = decisions.filter((_, i) => !checked[i]);

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
        {decisions.map(({ event, conflict }, i) => (
          <Pressable key={i} style={[styles.card, checked[i] && styles.cardOn, conflict && !checked[i] && styles.cardConflict]} onPress={() => toggle(i)}>
            <Text style={styles.check}>{checked[i] ? "☑" : "☐"}</Text>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>{event.title}</Text>
              <Text style={styles.rowSub}>
                {splitStart(event.start).date} {formatTimeRange(event)}
                {describeRecurrence(event) ? ` · ${describeRecurrence(event)}` : ""}
              </Text>
              {event.location ? <Text style={styles.rowSub}>{event.location}</Text> : null}
              {conflict ? <Text style={styles.warn}>⚠ {describeConflict(conflict)}</Text> : null}
              {event.confidence < 0.5 ? <Text style={styles.warn}>날짜가 확실하지 않아요 · "{event.source_excerpt}"</Text> : null}
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          style={[styles.primaryBtn, styles.wide, parsed.length === 0 && styles.disabled]}
          onPress={() => onConfirm(kept, declined)}
          disabled={parsed.length === 0}
        >
          <Text style={styles.primaryBtnText}>{kept.length > 0 ? `${kept.length}개 캘린더에 추가` : "추가하지 않고 답장만"}</Text>
        </Pressable>
      </View>
    </View>
  );
}
