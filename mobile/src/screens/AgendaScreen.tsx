import { useMemo } from "react";
import { SectionList, Text, View } from "react-native";
import { groupByDate, mergedItems, type DayItem } from "../agenda";
import { formatDateHeader, horizon, toDateKey } from "../dates";
import { useStyles } from "../styles";
import type { BusyBlock, StoredEvent } from "../types";
import { DayRow } from "./CalendarScreen";

// Upcoming events as one scrolling list, app and phone calendar together.
export function AgendaScreen({ events, phone, onRemove }: { events: StoredEvent[]; phone: BusyBlock[]; onRemove: (id: string) => void }) {
  const styles = useStyles();
  const today = toDateKey(new Date());
  const sections = useMemo(() => {
    const { from, to } = horizon(120);
    return [...groupByDate(mergedItems(events, phone, from, to)).entries()].map(([date, data]) => ({
      title: formatDateHeader(date, today),
      data,
    }));
  }, [events, phone, today]);

  if (sections.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>다가오는 일정이 없어요</Text>
        <Text style={styles.emptyBody}>이메일, 카톡 대화, 시간표, 주보 사진을 올리면{"\n"}일정을 찾아서 넣어 드려요.</Text>
      </View>
    );
  }
  return (
    <SectionList<DayItem>
      sections={sections}
      keyExtractor={(item) => item.key}
      renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
      renderItem={({ item }) => <DayRow item={item} onRemove={onRemove} />}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingBottom: 100 }}
    />
  );
}
