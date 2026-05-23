import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import type { SpotCard, SpotCategory } from '@jeju/shared';
import { BottomTabBar } from '../../src/components/BottomTabBar';
import { SpotCardList } from '../../src/components/SpotCardList';
import { SPOT_CATEGORY_LABELS } from '../../src/constants/categories';
import { getSpots } from '../../src/data/spotRepository';
import { colors, fontSize, fontWeight, spacing } from '../../src/theme/tokens';

export default function CategoryScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const cat = category as SpotCategory;
  const insets = useSafeAreaInsets();
  const [spots, setSpots] = useState<SpotCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSpots(cat)
      .then((res) => setSpots(res.spots))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [cat]);

  const title = SPOT_CATEGORY_LABELS[cat] ?? cat;

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-left" size={24} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerEnd} />
      </View>
      <View style={styles.divider} />

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
        <FlatList
          data={spots}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SpotCardList
              spot={item}
              onPress={() => router.push(`/spot/${item.id}` as Href)}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <BottomTabBar insetBottom={insets.bottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg.page,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: spacing.sm,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.title,
    fontWeight: fontWeight.medium,
    color: colors.text.primary,
  },
  headerEnd: {
    width: 44,
  },
  divider: {
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
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
