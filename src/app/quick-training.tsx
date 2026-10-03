import { useI18n } from '@/i18n/I18nProvider';
import { PlaceholderScreen } from '@/ui/PlaceholderScreen';

export default function QuickTrainingScreen() {
  const { t } = useI18n();
  return <PlaceholderScreen title={t('nav.quickTraining')} body={t('common.comingSoon')} />;
}
