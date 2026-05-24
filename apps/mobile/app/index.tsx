import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import type { SpotCard, SpotCategory } from '@jeju/shared';
import { BottomTabBar } from '../src/components/BottomTabBar';
import { SpotCardFeed } from '../src/components/SpotCardFeed';
import { getSpots } from '../src/data/spotRepository';
import { colors, fontSize, fontWeight, spacing } from '../src/theme/tokens';

const FILTER_TABS: Array<{ label: string; category: SpotCategory | null }> = [
  { label: '전체', category: null },
  { label: '관광', category: 'sightseeing' },
  { label: '맛집', category: 'restaurant' },
  { label: '카페', category: 'cafe' },
  { label: '문화', category: 'cultural_space' },
  { label: '체험', category: 'experience' },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [spots, setSpots] = useState<SpotCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getSpots()
      .then((res) => setSpots(res.spots))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = activeFilter === 0
    ? spots
    : spots.filter((s) => s.category === FILTER_TABS[activeFilter]!.category);

  const renderItem = useCallback(({ item }: { item: SpotCard }) => (
    <SpotCardFeed
      spot={item}
      onPress={() => router.push(`/spot/${item.id}` as Href)}
    />
  ), []);

  const keyExtractor = useCallback((item: SpotCard) => item.id, []);

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      {/* Filter tabs */}
      <View style={styles.filterWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {FILTER_TABS.map((tab, i) => (
            <Pressable
              key={tab.label}
              onPress={() => {
                if (tab.category !== null) {
                  router.push(`/category/${tab.category}` as Href);
                } else {
                  setActiveFilter(0);
                }
              }}
              style={[styles.filterChip, i === activeFilter && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, i === activeFilter && styles.filterTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Body */}
      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}
      {!loading && error !== null && (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={load} style={styles.retryBtn}>
            <Text style={styles.retryText}>다시 시도</Text>
          </Pressable>
        </View>
      )}
      {!loading && error === null && (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.feed}
          showsVerticalScrollIndicator={false}
          initialNumToRender={3}
          maxToRenderPerBatch={2}
          windowSize={5}
          removeClippedSubviews
          updateCellsBatchingPeriod={50}
        />
      )}

      <BottomTabBar
        activeIndex={0}
        onPress={(i) => {
          if (i === 2) router.push('/favorites' as Href);
        }}
        insetBottom={insets.bottom}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg.page,
  },
  filterWrap: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  filterScroll: {
    paddingHorizontal: spacing.lg,
    columnGap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: colors.bg.card,
  },
  filterChipActive: {
    backgroundColor: colors.accent,
  },
  filterText: {
    fontSize: fontSize.sub,
    fontWeight: fontWeight.regular,
    color: colors.text.secondary,
  },
  filterTextActive: {
    fontWeight: fontWeight.medium,
    color: '#FFFFFF',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
  },
  errorText: {
    color: colors.accent,
    textAlign: 'center',
    padding: spacing.lg,
    fontSize: fontSize.body,
  },
  retryBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 100,
    backgroundColor: colors.accent,
  },
  retryText: {
    fontSize: fontSize.sub,
    fontWeight: fontWeight.medium,
    color: '#FFFFFF',
  },
  feed: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
