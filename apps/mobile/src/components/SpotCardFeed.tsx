import type { ComponentType } from 'react';
import { Dimensions, Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient as _LG } from 'expo-linear-gradient';
import { AntDesign } from '@expo/vector-icons';

const LinearGradient = _LG as unknown as ComponentType<{
  colors: readonly string[];
  locations?: number[];
  style?: StyleProp<ViewStyle>;
}>;
import type { SpotCard } from '@jeju/shared';
import { colors, fontSize, fontWeight, spacing } from '../theme/tokens';
import { SPOT_CATEGORY_LABELS } from '../constants/categories';
import { useFavorites } from '../context/FavoritesContext';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const PHOTO_HEIGHT = Math.round(SCREEN_HEIGHT * 0.55);

const REGION_LABELS: Record<string, string> = {
  'jeju-city': '제주시',
  eastern: '동부',
  seogwipo: '서귀포시',
  western: '서부',
  hallasan: '한라산',
};

interface Props {
  spot: SpotCard;
  onPress: () => void;
}

export function SpotCardFeed({ spot, onPress }: Props) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const fav = isFavorite(spot.id);

  return (
    <Pressable onPress={onPress} style={styles.card}>
      {/* Photo + overlays */}
      <View style={styles.photoWrap}>
        {(spot.imageUrl ?? spot.thumbnailUrl) !== null ? (
          <Image
            source={{ uri: (spot.imageUrl ?? spot.thumbnailUrl)! }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.photoPlaceholder]} />
        )}

        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.72)']}
          locations={[0.35, 0.62, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* Bottom text overlay */}
        <View style={styles.overlay}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>
              {SPOT_CATEGORY_LABELS[spot.category] ?? spot.category}
            </Text>
          </View>
          <Text style={styles.name} numberOfLines={1}>{spot.name}</Text>
          {spot.curatorComment !== null && (
            <Text style={styles.comment} numberOfLines={1}>{spot.curatorComment}</Text>
          )}
        </View>

        {/* Heart — top-right */}
        <Pressable
          onPress={() => { void toggleFavorite(spot.id); }}
          style={styles.heartBtn}
          hitSlop={8}
        >
          <AntDesign
            name={fav ? 'heart' : 'hearto'}
            size={18}
            color={fav ? colors.accent : '#fff'}
          />
        </Pressable>
      </View>

      {/* Info row below photo */}
      <View style={styles.infoRow}>
        <Text style={styles.infoText}>
          {REGION_LABELS[spot.region] ?? spot.region}
          {'  ·  '}
          {SPOT_CATEGORY_LABELS[spot.category] ?? spot.category}
          {'  ·  비짓제주'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: colors.bg.card,
    marginBottom: spacing.lg,
  },
  photoWrap: {
    width: '100%',
    height: PHOTO_HEIGHT,
  },
  photoPlaceholder: {
    backgroundColor: colors.bg.placeholder,
  },
  overlay: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg + 48,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 100,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    marginBottom: spacing.xs,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: fontWeight.medium,
    color: colors.accent,
    letterSpacing: 0.5,
  },
  name: {
    fontSize: fontSize.title,
    fontWeight: fontWeight.medium,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  comment: {
    fontSize: fontSize.hint,
    fontWeight: fontWeight.regular,
    color: 'rgba(255,255,255,0.75)',
  },
  heartBtn: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  infoText: {
    fontSize: fontSize.hint,
    fontWeight: fontWeight.regular,
    color: colors.text.secondary,
  },
});
