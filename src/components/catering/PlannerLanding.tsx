import { useState } from 'react';
import { Button, Card, Spinner, TextArea, TextField, Typography } from '@heroui/react';
import type { Language, Strings } from './strings';

/**
 * Sample request from the design. It deliberately leaves date and meal open so
 * the brief has something to report and the question walk has something to ask.
 */
const EXAMPLE_REQUEST: Record<Language, string> = {
  de: 'Wir planen ein Firmenessen für ca. 80 Personen. Es soll ein Schweizer Buffet mit Wein und Bier geben, Budget maximal 6000 CHF. Es gibt 5 Vegetarier und eine Person mit Glutenunverträglichkeit.',
  en: 'We are planning a company dinner for about 80 people. A Swiss buffet with wine and beer, budget up to 6000 CHF. Five guests are vegetarian and one is gluten intolerant.',
};

interface QuickStart {
  id: string;
  title: string;
  hint: Record<Language, string>;
  request: Record<Language, string>;
}

const QUICK_STARTS: QuickStart[] = [
  {
    id: 'apero',
    title: 'Apéro',
    hint: { de: 'Fingerfood im Stehen', en: 'Finger food, standing' },
    request: {
      de: 'Privater Apéro am 4. Juni für 30 Personen, Budget 900 CHF.',
      en: 'Private apéro on 4 June for 30 people, budget 900 CHF.',
    },
  },
  {
    id: 'brunch',
    title: 'Brunch',
    hint: { de: 'Warm & kalt, vormittags', en: 'Hot & cold, morning' },
    request: {
      de: 'Teamevent am 15. März, Frühstück für 24 Personen, Budget 1200 CHF.',
      en: 'Team event on 15 March, breakfast for 24 people, budget 1200 CHF.',
    },
  },
  {
    id: 'cake',
    title: 'Kaffee & Kuchen',
    hint: { de: 'Süss, zwei Stunden', en: 'Sweet, two hours' },
    request: {
      de: 'Privater Anlass am 9. Mai für 40 Personen, Budget 600 CHF.',
      en: 'Private occasion on 9 May for 40 people, budget 600 CHF.',
    },
  },
  {
    id: 'dinner',
    title: 'Dinner',
    hint: { de: 'Buffet oder Menü', en: 'Buffet or set menu' },
    request: EXAMPLE_REQUEST,
  },
];

interface PlannerLandingProps {
  t: Strings;
  language: Language;
  isAnalysing: boolean;
  onAnalyse: (message: string) => void;
}

/**
 * View 1 — "Catering Planer". One free-text field feeds the extractor; the quick
 * starts are pre-written requests for people who do not have an email to paste.
 */
export function PlannerLanding({ t, language, isAnalysing, onAnalyse }: PlannerLandingProps) {
  const [message, setMessage] = useState('');
  const canSubmit = message.trim().length > 0 && !isAnalysing;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Typography.Heading level={1} className="text-3xl font-bold tracking-tight text-balance">
          {t.landingTitle}
        </Typography.Heading>
        <Typography.Paragraph className="text-muted">{t.landingSubtitle}</Typography.Paragraph>
      </div>

      <Card>
        <Card.Content>
          <TextField
            aria-label={t.inputLabel}
            variant="secondary"
            value={message}
            onChange={setMessage}
            isDisabled={isAnalysing}
          >
            <TextArea
              placeholder={t.inputPlaceholder}
              rows={5}
              className="resize-none"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canSubmit) {
                  onAnalyse(message);
                }
              }}
            />
          </TextField>
        </Card.Content>
        <Card.Footer className="justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-accent"
            isDisabled={isAnalysing}
            onPress={() => setMessage(EXAMPLE_REQUEST[language])}
          >
            {t.insertExample}
          </Button>
          <Button isDisabled={!canSubmit} onPress={() => onAnalyse(message)}>
            {isAnalysing ? <Spinner size="sm" /> : null}
            {isAnalysing ? t.analysing : t.analyse}
          </Button>
        </Card.Footer>
      </Card>

      <section className="flex flex-col gap-3">
        <Typography.Heading level={2} className="text-sm font-semibold text-muted">
          {t.quickStart}
        </Typography.Heading>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {QUICK_STARTS.map((quickStart) => (
            <button
              key={quickStart.id}
              type="button"
              disabled={isAnalysing}
              onClick={() => setMessage(quickStart.request[language])}
              className="flex cursor-[var(--cursor-interactive)] flex-col items-start gap-0.5 rounded-2xl border border-border bg-surface px-4 py-3.5 text-left hover:bg-surface-secondary focus-visible:focus-ring disabled:status-disabled"
            >
              <span className="text-sm font-semibold text-foreground">{quickStart.title}</span>
              <span className="text-xs text-muted">{quickStart.hint[language]}</span>
            </button>
          ))}
        </div>
      </section>

      <Typography.Paragraph size="sm" className="text-muted">
        {t.footnote}
      </Typography.Paragraph>
    </div>
  );
}
