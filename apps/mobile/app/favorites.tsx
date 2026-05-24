import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import type { SpotCard } from '@jeju/shared';
import { BottomTabBar } from '../src/components/BottomTabBar';
import { SpotCardList } from '../src/components/SpotCardList';
import { useFavorites } from '../src/context/FavoritesContext';
import { getSpots } from '../src/data/spotRepository';
import { colors, fontSize, fontWeight, spacing } from '../src/theme/tokens';

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const { favorites } = useFavorites();
  const [allSpots, setAllSpots] = useState<SpotCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSpots()
      .then((res) => setAllSpots(res.spots))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const favSpots = allSpots.filter((s) => favorites.includes(s.id));

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>찜한 곳</Text>
      </View>

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
      {!loading && error === null && favSpots.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.emptyText}>아직 찜한 곳이 없어요</Text>
        </View>
      )}
      {!loading && error === null && favSpots.length > 0 && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        >
          {favSpots.map((spot) => (
            <SpotCardList
              key={spot.id}
              spot={spot}
              onPress={() => router.push(`/spot/${spot.id}` as Href)}
            />
          ))}
        </ScrollView>
      )}

      <BottomTabBar
        activeIndex={2}
        onPress={(i) => {
          if (i === 0) router.push('/' as Href);
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
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: {
    fontSize: fontSize.titleLg,
    fontWeight: fontWeight.medium,
    color: colors.text.primary,
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
  emptyText: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.regular,
    color: colors.text.hint,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
