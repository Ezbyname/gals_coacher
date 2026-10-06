import { useLocalSearchParams } from 'expo-router';

import { TemplateForm } from '@/features/training/TemplateForm';

export default function EditTemplateScreen() {
  const { templateId } = useLocalSearchParams<{ templateId: string }>();
  return <TemplateForm templateId={String(templateId)} />;
}
