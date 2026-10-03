import { useI18n } from '@/i18n/I18nProvider';
import { PlaceholderScreen } from '@/ui/PlaceholderScreen';

export default function ExercisesScreen() {
  const { t } = useI18n();
  return <PlaceholderScreen title={t('exercises.libraryTitle')} body={t('common.comingSoon')} />;
}
