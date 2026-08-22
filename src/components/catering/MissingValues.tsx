import {
  Alert,
  Button,
  Card,
  Chip,
  CircleDashedIcon,
  IconChevronLeft,
  IconChevronRight,
  SuccessIcon,
  Typography,
} from '@heroui/react';
import type { GatheringData } from '../../types/gathering';
import { QUESTION_ORDER, formatAnswer, questionLabel, type QuestionId } from './fields';
import type { Language, Strings } from './strings';

interface MissingValuesProps {
  t: Strings;
  language: Language;
  data: GatheringData;
  openQuestionCount: number;
  usedLocalExtraction: boolean;
  onBack: () => void;
  onContinue: () => void;
  onEdit: (question: QuestionId) => void;
}

/**
 * View 2 — "Missing values". One row per top-level property of the schema, so the
 * brief and `gatheringConfig.json` stay readable against each other.
 */
export function MissingValues({
  t,
  language,
  data,
  openQuestionCount,
  usedLocalExtraction,
  onBack,
  onContinue,
  onEdit,
}: MissingValuesProps) {
  const rows = QUESTION_ORDER.map((question) => ({
    question,
    label: questionLabel(question, t),
    value: formatAnswer(question, data, t, language),
  }));
  const foundCount = rows.filter((row) => row.value !== null).length;
  const isComplete = openQuestionCount === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" className="-ml-3 w-fit text-muted" onPress={onBack}>
          <IconChevronLeft />
          {t.back}
        </Button>
        <Typography.Heading level={1} className="text-2xl font-bold tracking-tight">
          {t.briefTitle}
        </Typography.Heading>
        <Typography.Paragraph className="text-muted">
          {isComplete ? t.briefComplete : t.briefSubtitle(foundCount, rows.length - foundCount)}
        </Typography.Paragraph>
      </div>

      {usedLocalExtraction ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t.offlineNotice}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <Card className="gap-0 overflow-hidden p-0">
        {rows.map((row) => (
          <button
            key={row.question}
            type="button"
            onClick={() => onEdit(row.question)}
            className="flex w-full cursor-[var(--cursor-interactive)] items-center gap-3 border-b border-separator px-4 py-3 text-left last:border-b-0 hover:bg-surface-secondary focus-visible:focus-ring"
          >
            {row.value === null ? (
              <CircleDashedIcon className="size-4 shrink-0 text-muted" />
            ) : (
              <SuccessIcon className="size-4 shrink-0 text-success" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-muted">{row.label}</span>
              <span
                className={`block truncate text-sm font-medium tabular-nums ${
                  row.value === null ? 'text-muted' : 'text-foreground'
                }`}
              >
                {row.value ?? t.missing}
              </span>
            </span>
            <IconChevronRight className="size-4 shrink-0 text-muted" />
          </button>
        ))}
      </Card>

      <div className="flex flex-col items-stretch gap-2">
        <Button fullWidth onPress={onContinue}>
          {isComplete ? t.toResult : t.answerQuestions(openQuestionCount)}
        </Button>
        <Chip color={isComplete ? 'success' : 'default'} variant="soft" className="mx-auto">
          {isComplete
            ? t.briefComplete
            : `${foundCount}/${rows.length} ${t.recognised}`}
        </Chip>
      </div>
    </div>
  );
}
