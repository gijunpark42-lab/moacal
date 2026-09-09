import { useRef, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useStyles } from "../styles";

export interface SwipeAction {
  label: string;
  color: string;
  onPress: () => void;
}

// Swipe left to reveal actions (edit, delete, ...). Replaces long-press menus, which are hard to discover.
export function SwipeRow({ actions, children }: { actions: SwipeAction[]; children: ReactNode }) {
  const styles = useStyles();
  const ref = useRef<Swipeable>(null);
  return (
    <Swipeable
      ref={ref}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        <View style={styles.swipeActions}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              style={[styles.swipeAction, { backgroundColor: a.color }]}
              onPress={() => {
                ref.current?.close();
                a.onPress();
              }}
            >
              <Text style={styles.swipeActionText}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    >
      {children}
    </Swipeable>
  );
}
