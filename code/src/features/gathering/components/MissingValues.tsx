import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CircleDashedIcon,
  IconChevronLeft,
  IconChevronRight,
  SuccessIcon,
  TextArea,
  TextField,
  Typography,
} from '@heroui/react';
import type { GatheringData, GatheringUncertainty } from '../types';
import { QUESTION_ORDER, formatAnswer, questionLabel, type QuestionId } from '../questions';
import type { Language, Strings } from '@/shared/i18n/strings';

interface MissingValuesProps {
  t: Strings;
  language: Language;
  data: GatheringData;
  openQuestionCount: number;
  usedLocalExtraction: boolean;
  uncertain: GatheringUncertainty[];
  onBack: () => void;
  onContinue: () => void;
  onEdit: (question: QuestionId) => void;
  onUpdateContext?: (context: string | null) => void;
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
  uncertain,
  onBack,
  onContinue,
  onEdit,
  onUpdateContext,
}: MissingValuesProps) {
  const [isEditingContext, setIsEditingContext] = useState(false);
  const [contextDraft, setContextDraft] = useState(data.context ?? '');

  const rows = QUESTION_ORDER.map((question) => ({
    question,
    label: questionLabel(question, t),
    value: formatAnswer(question, data, t, language),
  }));
  const foundCount = rows.filter((row) => row.value !== null).length;
  const isComplete = openQuestionCount === 0;

  const handleSaveContext = () => {
    if (onUpdateContext) {
      onUpdateContext(contextDraft.trim() ? contextDraft.trim() : null);
      setIsEditingContext(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 w-fit text-primary hover:underline hover:bg-transparent p-0 text-sm font-medium"
          onPress={onBack}
        >
          <IconChevronLeft />
          {t.back}
        </Button>
        <Typography.Heading level={1} className="text-2xl font-bold tracking-tight text-neutral-900">
          {t.briefTitle}
        </Typography.Heading>
        <Typography.Paragraph className="text-sm text-neutral-600">
          {isComplete ? t.briefComplete : t.briefSubtitle(foundCount, rows.length - foundCount)}
        </Typography.Paragraph>
      </div>

      {usedLocalExtraction ? (
        <Alert status="warning" className="border-amber-200 bg-amber-50 text-amber-900 rounded-lg">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t.offlineNotice}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      {uncertain.length > 0 ? (
        <Alert status="warning" className="border-amber-200 bg-amber-50 text-amber-900 rounded-lg">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title className="font-semibold">{t.uncertainTitle}</Alert.Title>
            {uncertain.map((item, index) => (
              <Alert.Description key={`${item.field ?? 'unknown'}-${index}`}>
                {item.reason}
              </Alert.Description>
            ))}
          </Alert.Content>
        </Alert>
      ) : null}

      {/* Structured Schema Properties */}
      <Card className="gap-0 overflow-hidden p-0 bg-white border border-neutral-200 rounded-lg shadow-xs divide-y divide-neutral-100">
        {rows.map((row) => (
          <button
            key={row.question}
            type="button"
            onClick={() => onEdit(row.question)}
            className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left hover:bg-neutral-50 transition-colors focus:outline-none"
          >
            {row.value === null ? (
              <CircleDashedIcon className="size-5 shrink-0 text-neutral-400" />
            ) : (
              <SuccessIcon className="size-5 shrink-0 text-primary" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">{row.label}</span>
              <span
                className={`block truncate text-sm font-semibold mt-0.5 tabular-nums ${
                  row.value === null ? 'text-neutral-400 italic font-normal' : 'text-neutral-900'
                }`}
              >
                {row.value ?? t.missing}
              </span>
            </span>
            <IconChevronRight className="size-4 shrink-0 text-neutral-400" />
          </button>
        ))}
      </Card>

      {/* Free-form Context & Constraints Section */}
      <Card className="border border-neutral-200 bg-[#f8f8f8] rounded-lg shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-700">
              {t.labelContext}
            </span>
            {!isEditingContext ? (
              <Button
                variant="ghost"
                size="sm"
                onPress={() => {
                  setContextDraft(data.context ?? '');
                  setIsEditingContext(true);
                }}
                className="text-xs font-semibold text-primary hover:underline p-0 h-auto"
              >
                {language === 'de' ? 'Bearbeiten' : 'Edit'}
              </Button>
            ) : null}
          </div>

          {isEditingContext ? (
            <div className="flex flex-col gap-3">
              <TextField aria-label={t.labelContext} className="w-full">
                <TextArea
                  value={contextDraft}
                  onChange={(e) => setContextDraft(e.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-md border border-neutral-200 bg-neutral-50/60 p-3 text-sm focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                  placeholder={t.contextPlaceholder}
                />
              </TextField>
              <div className="flex items-center gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    setContextDraft(data.context ?? '');
                    setIsEditingContext(false);
                  }}
                  className="border-neutral-300 text-xs font-medium text-neutral-700"
                >
                  {language === 'de' ? 'Abbrechen' : 'Cancel'}
                </Button>
                <Button
                  size="sm"
                  onPress={handleSaveContext}
                  className="bg-primary text-white hover:bg-primary/90 text-xs font-medium rounded px-3 py-1.5"
                >
                  {t.saveContext}
                </Button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => {
                setContextDraft(data.context ?? '');
                setIsEditingContext(true);
              }}
              className="cursor-pointer group"
            >
              {data.context ? (
                <p className="text-sm text-neutral-800 bg-white p-3 rounded border border-neutral-200 whitespace-pre-wrap leading-relaxed group-hover:border-primary/50 transition-colors">
                  {data.context}
                </p>
              ) : (
                <p className="text-sm text-neutral-400 italic bg-white p-3 rounded border border-dashed border-neutral-300 group-hover:border-primary/50 transition-colors">
                  {language === 'de'
                    ? 'Keine zusätzlichen Einschränkungen oder Wünsche angegeben (klicken zum Bearbeiten).'
                    : 'No additional constraints or preferences specified (click to edit).'}
                </p>
              )}
            </div>
          )}
        </div>
      </Card>

      <div className="flex flex-col items-stretch gap-3">
        <Button
          fullWidth
          onPress={onContinue}
          className="bg-primary text-white hover:bg-primary/90 rounded px-4 py-3 text-base font-semibold transition-colors shadow-xs"
        >
          {isComplete ? t.toResult : t.answerQuestions(openQuestionCount)}
        </Button>
        <div className="text-center text-xs font-medium text-neutral-500">
          {isComplete
            ? t.briefComplete
            : `${foundCount}/${rows.length} ${t.recognised}`}
        </div>
      </div>
    </div>
  );
}
