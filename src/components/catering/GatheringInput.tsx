import { useState } from 'react';
import {
  Button,
  Card,
  IconChevronLeft,
  Input,
  NumberField,
  ProgressBar,
  Spinner,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@heroui/react';
import type { GatheringData, GatheringField, GatheringUpdates } from '../../types/gathering';
import {
  BUDGET_PRESETS,
  CURRENCY_OPTIONS,
  EVENT_TYPE_OPTIONS,
  MEAL_OPTIONS,
  PARTICIPANT_PRESETS,
  formatAnswer,
  questionPrompt,
  type QuestionId,
} from './fields';
import type { Language, Strings } from './strings';

/** Leaf field a free-text answer should be interpreted against, per question. */
const EXPECTED_FIELD: Record<QuestionId, GatheringField> = {
  eventType: 'eventType',
  date: 'date.month',
  participantCount: 'participantCount',
  meal: 'meal',
  budget: 'budget.amount',
};

interface AnsweredTurn {
  question: QuestionId;
  answer: string;
}

interface GatheringInputProps {
  t: Strings;
  language: Language;
  data: GatheringData;
  /** Questions to walk through, fixed when the view is entered. */
  questions: QuestionId[];
  isAnalysing: boolean;
  /** Applies structured answers and returns the resulting data. */
  onApply: (updates: GatheringUpdates) => GatheringData;
  /** Resolves with the resulting data and the fields the extractor understood. */
  onAnalyse: (
    message: string,
    expectedField: GatheringField
  ) => Promise<{ data: GatheringData; updates: GatheringUpdates }>;
  onBack: () => void;
  onDone: (data: GatheringData) => void;
}

/**
 * View 3 — "Input". Walks the still-open questions one at a time. Structured
 * answers are applied locally; the free-text box routes through the extractor.
 */
export function GatheringInput({
  t,
  language,
  data,
  questions,
  isAnalysing,
  onApply,
  onAnalyse,
  onBack,
  onDone,
}: GatheringInputProps) {
  const [index, setIndex] = useState(0);
  const [log, setLog] = useState<AnsweredTurn[]>([]);
  const [freeText, setFreeText] = useState('');

  const question = questions[index];
  if (!question) return null;

  const advance = (label: string, nextData: GatheringData) => {
    setLog((previous) => [...previous, { question, answer: label }]);
    setFreeText('');
    if (index + 1 >= questions.length) onDone(nextData);
    else setIndex(index + 1);
  };

  const answer = (updates: GatheringUpdates, label: string) => {
    advance(label, onApply(updates));
  };

  const submitFreeText = async () => {
    const text = freeText.trim();
    if (!text) return;
    const { data: nextData, updates } = await onAnalyse(text, EXPECTED_FIELD[question]);
    // Nothing was understood — keep the question open rather than skipping it.
    if (Object.keys(updates).length === 0) return;
    advance(text, nextData);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" className="-ml-3 w-fit text-muted" onPress={onBack}>
          <IconChevronLeft />
          {t.back}
        </Button>
        <div className="flex items-center gap-3">
          <ProgressBar
            value={index}
            maxValue={questions.length}
            aria-label={t.questionOf(index + 1, questions.length)}
            className="flex-1"
          >
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
          <span className="font-mono text-xs text-muted tabular-nums">
            {t.questionOf(index + 1, questions.length)}
          </span>
        </div>
      </div>

      {log.length > 0 ? (
        <div className="flex flex-col gap-3">
          {log.map((turn) => (
            <div key={turn.question} className="flex flex-col gap-1.5">
              <p className="max-w-[80%] self-start rounded-2xl rounded-bl-sm bg-surface-secondary px-3.5 py-2 text-sm text-foreground">
                {questionPrompt(turn.question, t)}
              </p>
              <p className="max-w-[80%] self-end rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-sm text-accent-foreground">
                {formatAnswer(turn.question, data, t, language) ?? turn.answer}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        <Typography.Heading level={1} className="text-xl font-semibold tracking-tight text-balance">
          {questionPrompt(question, t)}
        </Typography.Heading>

        <QuestionControls
          question={question}
          t={t}
          data={data}
          isDisabled={isAnalysing}
          onAnswer={answer}
        />
      </div>

      <Card className="gap-2">
        <Card.Content>
          <TextField
            aria-label={t.freeTextLabel}
            variant="secondary"
            value={freeText}
            onChange={setFreeText}
            isDisabled={isAnalysing}
            className="w-full"
          >
            <div className="flex items-center gap-2">
              <Input placeholder={t.freeTextPlaceholder} className="flex-1" />
              <Button
                variant="outline"
                isDisabled={freeText.trim().length === 0 || isAnalysing}
                onPress={() => void submitFreeText()}
              >
                {isAnalysing ? <Spinner size="sm" /> : null}
                {t.send}
              </Button>
            </div>
          </TextField>
        </Card.Content>
        <Card.Footer>
          <Typography.Paragraph size="sm" className="text-muted">
            {t.freeTextHint}
          </Typography.Paragraph>
        </Card.Footer>
      </Card>
    </div>
  );
}

interface QuestionControlsProps {
  question: QuestionId;
  t: Strings;
  data: GatheringData;
  isDisabled: boolean;
  onAnswer: (updates: GatheringUpdates, label: string) => void;
}

function QuestionControls({ question, t, data, isDisabled, onAnswer }: QuestionControlsProps) {
  switch (question) {
    case 'eventType':
      return (
        <OptionPills
          isDisabled={isDisabled}
          options={EVENT_TYPE_OPTIONS.map((value) => ({ value, label: t.eventType[value] }))}
          onPick={(value, label) => onAnswer({ eventType: value }, label)}
        />
      );
    case 'meal':
      return (
        <OptionPills
          isDisabled={isDisabled}
          options={MEAL_OPTIONS.map((value) => ({ value, label: t.meal[value] }))}
          onPick={(value, label) => onAnswer({ meal: value }, label)}
        />
      );
    case 'date':
      return <DateControl t={t} isDisabled={isDisabled} onAnswer={onAnswer} />;
    case 'participantCount':
      return <ParticipantControl t={t} isDisabled={isDisabled} onAnswer={onAnswer} />;
    case 'budget':
      return <BudgetControl t={t} data={data} isDisabled={isDisabled} onAnswer={onAnswer} />;
  }
}

interface OptionPillsProps<T extends string> {
  options: { value: T; label: string }[];
  isDisabled: boolean;
  onPick: (value: T, label: string) => void;
}

/** Enum answers advance immediately, so these are actions rather than toggles. */
function OptionPills<T extends string>({ options, isDisabled, onPick }: OptionPillsProps<T>) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Button
          key={option.value}
          variant="outline"
          isDisabled={isDisabled}
          onPress={() => onPick(option.value, option.label)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

interface ControlProps {
  t: Strings;
  isDisabled: boolean;
  onAnswer: (updates: GatheringUpdates, label: string) => void;
}

function DateControl({ t, isDisabled, onAnswer }: ControlProps) {
  // The native date input provides a real calendar picker while keeping the
  // date in the browser's stable ISO format (YYYY-MM-DD).
  const [value, setValue] = useState('');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          aria-label={t.labelDate}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={isDisabled}
          className="min-h-10 rounded-lg border border-border bg-surface-secondary px-3 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <Button
          isDisabled={isDisabled || value === ''}
          onPress={() => {
            if (!value) return;
            const [year, month, day] = value.split('-').map(Number);
            onAnswer(
              { 'date.day': day, 'date.month': month, 'date.year': year },
              `${day}.${month}.${year}`
            );
          }}
        >
          {t.send}
        </Button>
      </div>
      <Typography.Paragraph size="sm" className="text-muted">
        {t.labelYearOptional}
      </Typography.Paragraph>
    </div>
  );
}

function ParticipantControl({ t, isDisabled, onAnswer }: ControlProps) {
  const [count, setCount] = useState<number>(Number.NaN);
  const isValid = Number.isInteger(count) && count > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <NumberField
          aria-label={t.labelParticipants}
          variant="secondary"
          value={count}
          onChange={setCount}
          minValue={1}
          step={1}
          isDisabled={isDisabled}
          className="w-40"
        >
          <NumberField.Group>
            <NumberField.DecrementButton />
            <NumberField.Input />
            <NumberField.IncrementButton />
          </NumberField.Group>
        </NumberField>
        <Button
          isDisabled={isDisabled || !isValid}
          onPress={() => onAnswer({ participantCount: count }, String(count))}
        >
          {t.send}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {PARTICIPANT_PRESETS.map((preset) => (
          <Button
            key={preset}
            variant="outline"
            size="sm"
            isDisabled={isDisabled}
            onPress={() => onAnswer({ participantCount: preset }, String(preset))}
          >
            {preset}
          </Button>
        ))}
      </div>
    </div>
  );
}

function BudgetControl({
  t,
  data,
  isDisabled,
  onAnswer,
}: ControlProps & { data: GatheringData }) {
  const [amount, setAmount] = useState<number>(data.budget.amount ?? Number.NaN);
  const [currency, setCurrency] = useState(data.budget.currency ?? CURRENCY_OPTIONS[0]);
  const isValid = Number.isFinite(amount) && amount >= 0;

  const submit = (nextAmount: number) =>
    onAnswer(
      { 'budget.amount': nextAmount, 'budget.currency': currency },
      `${nextAmount} ${currency}`
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <NumberField
          aria-label={t.labelAmount}
          variant="secondary"
          value={amount}
          onChange={setAmount}
          minValue={0}
          step={50}
          isDisabled={isDisabled}
          className="w-44"
        >
          <NumberField.Group>
            <NumberField.DecrementButton />
            <NumberField.Input />
            <NumberField.IncrementButton />
          </NumberField.Group>
        </NumberField>
        <ToggleButtonGroup
          isDetached
          size="sm"
          disallowEmptySelection
          aria-label={t.labelCurrency}
          selectedKeys={[currency]}
          onSelectionChange={(keys) => {
            const [next] = [...keys];
            if (typeof next === 'string') setCurrency(next);
          }}
          isDisabled={isDisabled}
        >
          {CURRENCY_OPTIONS.map((option) => (
            <ToggleButton key={option} id={option} className="font-mono">
              {option}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Button isDisabled={isDisabled || !isValid} onPress={() => submit(amount)}>
          {t.send}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {BUDGET_PRESETS.map((preset) => (
          <Button
            key={preset}
            variant="outline"
            size="sm"
            isDisabled={isDisabled}
            onPress={() => submit(preset)}
          >
            {preset.toLocaleString('de-CH')} {currency}
          </Button>
        ))}
      </div>
    </div>
  );
}
