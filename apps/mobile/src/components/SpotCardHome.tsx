import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SpotCard } from '@jeju/shared';
import { colors, fontWeight, fontSize, radius, spacing } from '../theme/tokens';

interface Props {
  spot: SpotCard;
  onPress: () => void;
}

export function SpotCardHome({ spot, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={styles.container}>
      {spot.thumbnailUrl !== null ? (
        <Image source={{ uri: spot.thumbnailUrl }} style={styles.thumbnail} resizeMode="cover" />
      ) : (
        <View style={[styles.thumbnail, styles.placeholder]}>
          <PhotoIcon size={28} />
        </View>
      )}
      <Text style={styles.name} numberOfLines={2}>{spot.name}</Text>
      {spot.curatorComment !== null && (
        <Text style={styles.comment} numberOfLines={1}>{spot.curatorComment}</Text>
      )}
    </Pressable>
  );
}

function PhotoIcon({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size * 0.82, borderWidth: 1.5, borderColor: colors.text.hint, borderRadius: 3, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.32, height: size * 0.32, borderRadius: size * 0.16, borderWidth: 1.5, borderColor: colors.text.hint }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 124,
  },
  thumbnail: {
    width: 124,
    height: 186,
    borderRadius: radius.sm,
  },
  placeholder: {
    backgroundColor: colors.bg.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    marginTop: spacing.xs,
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
    color: colors.text.primary,
  },
  comment: {
    marginTop: 2,
    fontSize: fontSize.hint,
    fontWeight: fontWeight.regular,
    color: colors.text.secondary,
  },
});
