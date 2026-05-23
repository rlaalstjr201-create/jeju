import type { ComponentProps } from 'react';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, spacing } from '../theme/tokens';

type FeatherName = ComponentProps<typeof Feather>['name'];

const TABS: Array<{ label: string; icon: FeatherName }> = [
  { label: '홈', icon: 'home' },
  { label: '검색', icon: 'search' },
  { label: '찜', icon: 'heart' },
  { label: '플랜', icon: 'map-pin' },
  { label: '마이', icon: 'user' },
];

interface Props {
  activeIndex?: number;
  onPress?: (index: number) => void;
  insetBottom: number;
}

export function BottomTabBar({ activeIndex = 0, onPress, insetBottom }: Props) {
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insetBottom, spacing.sm) }]}>
      {TABS.map((tab, i) => {
        const active = i === activeIndex;
        const color = active ? colors.accent : colors.text.hint;
        return (
          <Pressable key={tab.label} style={styles.tab} onPress={() => onPress?.(i)}>
            <Feather name={tab.icon} size={22} color={color} />
            <Text style={[styles.label, { color }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.bg.card,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.sm,
  },
  label: {
    fontSize: fontSize.hint,
    fontWeight: fontWeight.medium,
    marginTop: 3,
    marginBottom: spacing.xs,
  },
});
