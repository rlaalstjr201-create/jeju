import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { AntDesign, Feather } from '@expo/vector-icons';
import type { SpotDetail } from '@jeju/shared';
import { BottomTabBar } from '../../src/components/BottomTabBar';
import { useFavorites } from '../../src/context/FavoritesContext';
import { SPOT_CATEGORY_LABELS } from '../../src/constants/categories';
import { getSpotById } from '../../src/data/spotRepository';
import { colors, fontSize, fontWeight, radius, spacing } from '../../src/theme/tokens';

const REGION_LABELS: Record<string, string> = {
  'jeju-city': '제주시',
  eastern: '동부',
  seogwipo: '서귀포시',
  western: '서부',
  hallasan: '한라산',
};

export default function SpotDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { isFavorite, toggleFavorite } = useFavorites();
  const [spot, setSpot] = useState<SpotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFullscreen, setShowFullscreen] = useState(false);

  useEffect(() => {
    getSpotById(id)
      .then((res) => setSpot(res.spot))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id]);

  const fav = spot !== null ? isFavorite(spot.id) : false;

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
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
      {!loading && spot !== null && (
        <ScrollView showsVerticalScrollIndicator={false} bounces>
          {/* Hero */}
          <Pressable style={styles.hero} onPress={() => spot.thumbnailUrl !== null && setShowFullscreen(true)}>
            {spot.thumbnailUrl !== null ? (
              <Image source={{ uri: spot.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.heroPlaceholder]} />
            )}
            <Pressable onPress={() => router.back()} style={[styles.overlayBtn, styles.backBtn]}>
              <Feather name="chevron-left" size={22} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => { void toggleFavorite(spot.id); }}
              style={[styles.overlayBtn, styles.heartBtn]}
            >
              <AntDesign
                name={fav ? 'heart' : 'hearto'}
                size={18}
                color={fav ? colors.accent : '#fff'}
              />
            </Pressable>
            {spot.thumbnailUrl !== null && (
              <View style={styles.fullscreenChip}>
                <Text style={styles.fullscreenChipText}>전체화면</Text>
              </View>
            )}
          </Pressable>

          {/* White body overlapping hero */}
          <View style={styles.body}>
            <Text style={styles.spotName}>{spot.name}</Text>
            <Text style={styles.metaLine}>
              {SPOT_CATEGORY_LABELS[spot.category] ?? spot.category}
              {'  ·  '}
              {REGION_LABELS[spot.region] ?? spot.region}
            </Text>

            {spot.curatorComment !== null && (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionLabel}>큐레이터 노트</Text>
                <Text style={styles.commentText}>{spot.curatorComment}</Text>
              </>
            )}

            <View style={styles.divider} />
            <View style={styles.grid}>
              <GridItem label="지역" value={REGION_LABELS[spot.region] ?? spot.region} />
              <View style={styles.gridSep} />
              <GridItem label="카테고리" value={SPOT_CATEGORY_LABELS[spot.category] ?? spot.category} />
              <View style={styles.gridSep} />
              <GridItem label="출처" value="비짓제주" />
            </View>
          </View>

          {/* Map section */}
          <View style={styles.mapSection}>
            <Text style={styles.mapLabel}>위치</Text>
            <View style={styles.mapPlaceholder}>
              <Feather name="map-pin" size={28} color={colors.accent} />
              <Text style={styles.coordText}>
                {spot.lat.toFixed(5)}, {spot.lng.toFixed(5)}
              </Text>
              <Text style={styles.mapNote}>지도는 개발 빌드에서 표시됩니다</Text>
            </View>
          </View>

          <View style={{ height: spacing.xl }} />
        </ScrollView>
      )}

      <BottomTabBar
        activeIndex={0}
        insetBottom={insets.bottom}
        onPress={(i) => {
          if (i === 2) router.push('/favorites' as Href);
          else if (i === 0) router.push('/' as Href);
        }}
      />

      {/* Fullscreen modal */}
      {spot?.thumbnailUrl !== null && (
        <Modal visible={showFullscreen} animationType="fade" statusBarTranslucent>
          <View style={styles.modal}>
            <Image
              source={{ uri: spot?.thumbnailUrl ?? '' }}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
            />
            <Pressable
              onPress={() => setShowFullscreen(false)}
              style={[styles.overlayBtn, { top: insets.top + spacing.lg, right: spacing.lg }]}
            >
              <Feather name="x" size={22} color="#fff" />
            </Pressable>
          </View>
        </Modal>
      )}
    </View>
  );
}

function GridItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.gridItem}>
      <Text style={styles.gridLabel}>{label}</Text>
      <Text style={styles.gridValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg.page },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: colors.accent, textAlign: 'center', padding: spacing.lg },

  hero: {
    width: '100%',
    height: 280,
    backgroundColor: colors.bg.placeholder,
    overflow: 'hidden',
  },
  heroPlaceholder: { backgroundColor: colors.bg.placeholder },
  overlayBtn: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: { top: spacing.lg, left: spacing.lg },
  heartBtn: { top: spacing.lg, right: spacing.lg },
  fullscreenChip: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  fullscreenChipText: {
    fontSize: fontSize.hint,
    color: '#fff',
    fontWeight: fontWeight.medium,
  },

  body: {
    marginTop: -16,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: colors.bg.card,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  spotName: {
    fontSize: 22,
    fontWeight: fontWeight.medium,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  metaLine: {
    fontSize: fontSize.sub,
    color: colors.accent,
    fontWeight: fontWeight.regular,
    marginBottom: spacing.sm,
  },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.lg },
  sectionLabel: {
    fontSize: fontSize.hint,
    fontWeight: fontWeight.medium,
    color: colors.text.hint,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  commentText: {
    fontSize: fontSize.body,
    color: colors.text.primary,
    lineHeight: 22,
    fontWeight: fontWeight.regular,
  },

  grid: { flexDirection: 'row', paddingBottom: spacing.lg },
  gridSep: { width: 1, backgroundColor: colors.divider, marginHorizontal: spacing.md },
  gridItem: { flex: 1, alignItems: 'center' },
  gridLabel: { fontSize: fontSize.hint, color: colors.text.hint, marginBottom: spacing.xs },
  gridValue: { fontSize: fontSize.sub, fontWeight: fontWeight.medium, color: colors.text.primary, textAlign: 'center' },

  mapSection: {
    backgroundColor: colors.bg.card,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  mapLabel: {
    fontSize: fontSize.title,
    fontWeight: fontWeight.medium,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  mapPlaceholder: {
    height: 160,
    borderRadius: radius.md,
    backgroundColor: colors.bg.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  coordText: {
    fontSize: fontSize.sub,
    color: colors.text.secondary,
    fontWeight: fontWeight.regular,
  },
  mapNote: {
    fontSize: fontSize.hint,
    color: colors.text.hint,
  },

  modal: { flex: 1, backgroundColor: '#000' },
});
