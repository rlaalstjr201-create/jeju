import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SpotCard } from '@jeju/shared';
import { SpotCardDetailHeader } from '../src/components/SpotCardDetailHeader';
import { SpotCardHome } from '../src/components/SpotCardHome';
import { SpotCardList } from '../src/components/SpotCardList';
import { colors, fontSize, fontWeight, spacing } from '../src/theme/tokens';

const SAMPLE: SpotCard = {
  id: 'sample-1',
  name: '성산일출봉',
  category: 'sightseeing',
  lat: 33.458,
  lng: 126.943,
  thumbnailUrl: null,
  curatorComment: '제주 동쪽 끝, 일출로 유명한 분화구. 세계자연유산.',
  region: '서귀포시',
};

export default function ComponentSamples() {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Label>SpotCardDetailHeader</Label>
      <SpotCardDetailHeader spot={SAMPLE} onBack={() => {}} />

      <Label>SpotCardHome</Label>
      <View style={styles.padded}>
        <SpotCardHome spot={SAMPLE} onPress={() => {}} />
      </View>

      <Label>SpotCardList</Label>
      <View style={styles.padded}>
        <SpotCardList spot={SAMPLE} onPress={() => {}} />
      </View>
    </ScrollView>
  );
}

function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg.page },
  content: { paddingBottom: spacing.xl },
  padded: { paddingHorizontal: spacing.lg },
  label: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
    fontSize: fontSize.hint,
    fontWeight: fontWeight.medium,
    color: colors.text.hint,
    letterSpacing: 0.5,
  },
});
