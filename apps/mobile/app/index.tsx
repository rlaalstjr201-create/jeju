import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import type { SpotCard, SpotCategory } from '@jeju/shared';
import { BottomTabBar } from '../src/components/BottomTabBar';
import { SpotCardHome } from '../src/components/SpotCardHome';
import { CATEGORY_ORDER, SPOT_CATEGORY_LABELS } from '../src/constants/categories';
import { getSpots } from '../src/data/spotRepository';
import { colors, fontSize, fontWeight, spacing } from '../src/theme/tokens';

const TOP_TABS: Array<{ label: string; category: SpotCategory | null }> = [
  { label: '홈', category: null },
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
  const [activeTopTab, setActiveTopTab] = useState(0);
  const [activeBottomTab, setActiveBottomTab] = useState(0);

  useEffect(() => {
    getSpots()
      .then((res) => setSpots(res.spots))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const grouped = spots.reduce<Partial<Record<SpotCategory, SpotCard[]>>>((acc, spot) => {
    (acc[spot.category] ??= []).push(spot);
    return acc;
  }, {});

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      {/* Top tab row */}
      <View style={styles.tabRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScroll}
          style={styles.tabScrollOuter}
        >
          {TOP_TABS.map((tab, i) => (
            <Pressable
              key={tab.label}
              onPress={() => {
                if (tab.category !== null) {
                  router.push(`/category/${tab.category}` as Href);
                } else {
                  setActiveTopTab(0);
                }
              }}
              style={styles.tabItem}
            >
              <Text style={i === activeTopTab ? styles.tabActive : styles.tabInactive}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.bellWrap}>
          <Feather name="bell" size={20} color={colors.text.secondary} />
        </View>
      </View>
      <View style={styles.tabDivider} />

      {/* Body */}
      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}
      {!loading && error !== null && (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {!loading && error === null && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
          {CATEGORY_ORDER.map((cat) =>
            (grouped[cat]?.length ?? 0) > 0 ? (
              <View key={cat} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{SPOT_CATEGORY_LABELS[cat]}</Text>
                  <Pressable onPress={() => router.push(`/category/${cat}` as Href)}>
                    <Feather name="chevron-right" size={18} color={colors.accent} />
                  </Pressable>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cardList}
                >
                  {(grouped[cat] ?? []).map((spot) => (
                    <SpotCardHome
                      key={spot.id}
                      spot={spot}
                      onPress={() => router.push(`/spot/${spot.id}` as Href)}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null
          )}
        </ScrollView>
      )}

      {/* Bottom tab bar */}
      <BottomTabBar
        activeIndex={activeBottomTab}
        onPress={(i) => { if (i === 0) setActiveBottomTab(0); }}
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
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
  },
  tabScrollOuter: {
    flex: 1,
  },
  tabScroll: {
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    columnGap: spacing.lg,
  },
  tabItem: {
    paddingVertical: spacing.sm,
  },
  tabActive: {
    fontSize: fontSize.sub,
    fontWeight: fontWeight.medium,
    color: colors.text.primary,
  },
  tabInactive: {
    fontSize: fontSize.sub,
    fontWeight: fontWeight.regular,
    color: colors.text.hint,
  },
  bellWrap: {
    paddingRight: spacing.lg,
    paddingLeft: spacing.sm,
    justifyContent: 'center',
  },
  tabDivider: {
    height: 1,
    backgroundColor: colors.divider,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: colors.accent,
    textAlign: 'center',
    padding: spacing.lg,
  },
  body: {
    paddingBottom: spacing.xl,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.titleLg,
    fontWeight: fontWeight.medium,
    color: colors.text.primary,
  },
  cardList: {
    paddingHorizontal: spacing.lg,
    columnGap: spacing.md,
    paddingRight: spacing.xl + spacing.lg,
  },
});
