import { createContext, useContext } from "react";
import { Platform, StyleSheet } from "react-native";

export const ACCENT = "#2D6CDF";
export const PHONE_COLOR = "#7A5AF8"; // events that come from the phone calendar
export const HOLIDAY_COLOR = "#E05252"; // public holidays and Sundays
export const SATURDAY_COLOR = "#3B7DDD";
export const WARN = "#B54708";
export const BIG_FONT_SCALE = 1.3;

// Font sizes scale with the big-font setting; everything else stays fixed.
export function makeStyles(s: number) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#fff" },
    flex: { flex: 1 },
    row: { flexDirection: "row", alignItems: "center" },
    pad: { padding: 20, gap: 12 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 },
    h1: { fontSize: 24 * s, fontWeight: "700", color: "#0F1B2D" },
    h2: { fontSize: 18 * s, fontWeight: "700", color: "#0F1B2D" },
    link: { fontSize: 18 * s, color: ACCENT, minWidth: 48 },
    primaryBtn: { backgroundColor: ACCENT, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
    primaryBtnText: { color: "#fff", fontSize: 17 * s, fontWeight: "700" },
    secondaryBtn: { borderWidth: 1.5, borderColor: ACCENT, borderStyle: "dashed", padding: 22, borderRadius: 12, alignItems: "center" },
    secondaryBtnText: { color: ACCENT, fontSize: 16 * s, fontWeight: "600" },
    wide: { alignSelf: "stretch" },
    disabled: { opacity: 0.4 },
    footer: { padding: 20, borderTopWidth: StyleSheet.hairlineWidth, borderColor: "#E4E7EC" },
    label: { fontSize: 14 * s, color: "#667085", fontWeight: "600" },
    input: { minHeight: 140, borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 12, padding: 14, fontSize: 17 * s, color: "#0F1B2D" },
    preview: { width: "100%", height: 260, borderRadius: 12, backgroundColor: "#F2F4F7" },
    hint: { textAlign: "center", color: "#98A2B3", marginTop: 6, fontSize: 14 * s },
    sectionHeader: { fontSize: 15 * s, fontWeight: "700", color: "#667085", paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6 },
    eventRow: { flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingVertical: 12, alignItems: "flex-start" },
    eventBar: { width: 4, borderRadius: 2, alignSelf: "stretch", backgroundColor: ACCENT },
    rowTime: { width: 92 * s, fontSize: 16 * s, color: "#667085", paddingTop: 1 },
    rowTitle: { fontSize: 18 * s, color: "#0F1B2D", fontWeight: "600" },
    rowSub: { fontSize: 15 * s, color: "#667085", marginTop: 2 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
    emptyTitle: { fontSize: 20 * s, fontWeight: "700", color: "#0F1B2D" },
    emptyBody: { fontSize: 16 * s, color: "#667085", textAlign: "center", lineHeight: 24 * s },
    notes: { backgroundColor: "#FFF7E6", color: "#7A4B00", padding: 12, borderRadius: 10, fontSize: 15 * s },
    card: {
      flexDirection: "row",
      gap: 12,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: "#E4E7EC",
      backgroundColor: "#fff",
      shadowColor: "#0F1B2D",
      shadowOpacity: 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
    cardOn: { borderColor: ACCENT, backgroundColor: "#F0F5FF" },
    cardConflict: { borderColor: "#F79009", backgroundColor: "#FFFAEB" },
    check: { fontSize: 22 * s, color: ACCENT, paddingTop: 1 },
    warn: { fontSize: 13 * s, color: WARN, marginTop: 4 },
    settingRow: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 10 },
    swipeActions: { flexDirection: "row" },
    swipeAction: { width: 76 * s, alignItems: "center", justifyContent: "center" },
    swipeActionText: { color: "#fff", fontSize: 14 * s, fontWeight: "700" },
    badge: { alignSelf: "flex-start", backgroundColor: "#EAECF0", color: "#475467", fontSize: 12 * s, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: "hidden", marginTop: 4 },
    linkChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#F0F5FF" },
    linkChipText: { color: ACCENT, fontSize: 14 * s, fontWeight: "600" },
    muted: { opacity: 0.55 },
    fieldBtn: { borderWidth: 1, borderColor: "#D0D5DD", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
    fieldText: { fontSize: 17 * s, color: "#0F1B2D" },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "#D0D5DD" },
    chipOn: { backgroundColor: ACCENT, borderColor: ACCENT },
    chipText: { fontSize: 15 * s, color: "#0F1B2D" },
    chipTextOn: { color: "#fff", fontWeight: "700" },
    // Month grid
    monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 6 },
    monthTitle: { fontSize: 20 * s, fontWeight: "700", color: "#0F1B2D" },
    navBtn: { fontSize: 26 * s, color: ACCENT, paddingHorizontal: 14, paddingVertical: 2 },
    weekRow: { flexDirection: "row", paddingHorizontal: 8 },
    weekdayCell: { flex: 1, textAlign: "center", fontSize: 12 * s, color: "#98A2B3", fontWeight: "600", paddingBottom: 4 },
    dayCell: { flex: 1, alignItems: "center", paddingVertical: 4, minHeight: 44 * s },
    dayNum: { fontSize: 15 * s, color: "#0F1B2D", width: 30 * s, height: 30 * s, lineHeight: 30 * s, textAlign: "center", borderRadius: 15 * s, overflow: "hidden" },
    dayNumMuted: { color: "#C0C6D0" },
    dayNumHoliday: { color: HOLIDAY_COLOR },
    dayNumSaturday: { color: SATURDAY_COLOR },
    dayNumToday: { fontWeight: "800", borderWidth: 2, borderColor: ACCENT },
    dayNumSelected: { backgroundColor: ACCENT, color: "#fff", fontWeight: "700", borderColor: ACCENT },
    holidayLabel: { fontSize: 9 * s, color: HOLIDAY_COLOR, marginTop: 1, maxWidth: 44 * s, textAlign: "center" },
    dots: { flexDirection: "row", gap: 3, height: 6, marginTop: 2 },
    dot: { width: 5, height: 5, borderRadius: 3 },
    fab: { position: "absolute", right: 20, bottom: 24, backgroundColor: ACCENT, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", elevation: 4 },
    fabText: { color: "#fff", fontSize: 30, lineHeight: 34, fontWeight: "600" },
    tabBar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderColor: "#E4E7EC", backgroundColor: "#fff" },
    tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 10, paddingBottom: 8, minHeight: 68 * s, gap: 2 },
    tabIcon: { fontSize: 22 * s },
    tabText: { fontSize: 13 * s, color: "#98A2B3", fontWeight: "700" },
    tabTextOn: { color: ACCENT },
    tabOn: { backgroundColor: "#F0F5FF" },
  });
}

export type Styles = ReturnType<typeof makeStyles>;
export const StylesContext = createContext<Styles>(makeStyles(1));
export const useStyles = () => useContext(StylesContext);
