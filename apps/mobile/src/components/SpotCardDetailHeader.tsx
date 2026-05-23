import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SpotCard } from '@jeju/shared';
import { colors, spacing } from '../theme/tokens';

interface Props {
  spot: SpotCard;
  onBack: () => void;
}

export function SpotCardDetailHeader({ spot, onBack }: Props) {
  return (
    <View style={styles.container}>
      {spot.thumbnailUrl !== null ? (
        <Image source={{ uri: spot.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <PhotoIcon size={48} />
        </View>
      )}
      <Pressable onPress={onBack} style={[styles.iconBtn, styles.backBtn]}>
        <Text style={styles.iconText}>‹</Text>
      </Pressable>
      <Pressable onPress={() => {}} style={[styles.iconBtn, styles.heartBtn]}>
        <Text style={styles.iconText}>♡</Text>
      </Pressable>
    </View>
  );
}

function PhotoIcon({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size * 0.82, borderWidth: 2, borderColor: colors.text.hint, borderRadius: 4, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.32, height: size * 0.32, borderRadius: size * 0.16, borderWidth: 2, borderColor: colors.text.hint }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 210,
    backgroundColor: colors.bg.placeholder,
    overflow: 'hidden',
  },
  placeholder: {
    backgroundColor: colors.bg.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    position: 'absolute',
    top: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    left: spacing.lg,
  },
  heartBtn: {
    right: spacing.lg,
  },
  iconText: {
    fontSize: 22,
    color: '#FFFFFF',
    lineHeight: 28,
  },
});
