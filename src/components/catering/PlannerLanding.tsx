import { useState } from 'react';
import {
  Button,
  Card,
  CircleDashedIcon,
  Spinner,
  SuccessIcon,
  TextArea,
  TextField,
  Typography,
} from '@heroui/react';
import type { StoredRecipe } from '../../types/recipe';
import type { Language, Strings } from './strings';

/**
 * Sample request from the design. It deliberately leaves date and meal open so
 * the brief has something to report and the question walk has something to ask.
 */
const EXAMPLE_REQUEST: Record<Language, string> = {
  de: 'Wir planen ein Firmenessen für ca. 80 Personen. Es soll ein Schweizer Buffet mit Wein und Bier geben, Budget maximal 6000 CHF. Es gibt 5 Vegetarier und eine Person mit Glutenunverträglichkeit.',
  en: 'We are planning a company dinner for about 80 people. A Swiss buffet with wine and beer, budget up to 6000 CHF. Five guests are vegetarian and one is gluten intolerant.',
};

/** The landing page shows the most recent recipes only; the rest live one tap away. */
const VISIBLE_RECIPES = 3;

interface PlannerLandingProps {
  t: Strings;
  language: Language;
  isAnalysing: boolean;
  /** Newest first — only the first few are shown here. */
  recipes: StoredRecipe[];
  selectedIds: string[];
  onAnalyse: (message: string) => void;
  onToggleRecipe: (id: string) => void;
  onOpenRecipe: (id: string) => void;
  onOpenRecipes: () => void;
}

/**
 * View 1 — "Catering Planer". One free-text field feeds the extractor, and the
 * recipe list below it picks the dishes that go into the menu and the shopping
 * list of `config/cateringPlanConfig.json`.
 */
export function PlannerLanding({
  t,
  language,
  isAnalysing,
  recipes,
  selectedIds,
  onAnalyse,
  onToggleRecipe,
  onOpenRecipe,
  onOpenRecipes,
}: PlannerLandingProps) {
  const [message, setMessage] = useState('');
  const canSubmit = message.trim().length > 0 && !isAnalysing;
  const visible = recipes.slice(0, VISIBLE_RECIPES);
  const hiddenCount = recipes.length - visible.length;

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
        <div className="flex items-baseline justify-between gap-3">
          <Typography.Heading level={2} className="text-sm font-semibold text-muted">
            {t.recipesTitle}
          </Typography.Heading>
          <Button variant="ghost" size="sm" className="-mr-3 text-accent" onPress={onOpenRecipes}>
            {recipes.length > 0 ? t.recipeAllRecipes : t.recipeNew}
          </Button>
        </div>

        {visible.length === 0 ? (
          <Card className="flex flex-col items-start gap-3 p-4">
            <Typography.Paragraph className="text-sm text-muted">
              {t.recipeLandingEmpty}
            </Typography.Paragraph>
            <Button size="sm" onPress={onOpenRecipes}>
              {t.recipeNew}
            </Button>
          </Card>
        ) : (
          <Card className="gap-0 overflow-hidden p-0">
            {visible.map((record) => (
              <div
                key={record.id}
                className="flex items-center gap-1 border-b border-separator pr-2 last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => onToggleRecipe(record.id)}
                  aria-pressed={selectedIds.includes(record.id)}
                  className="flex min-w-0 flex-1 cursor-[var(--cursor-interactive)] items-center gap-3 px-4 py-3 text-left hover:bg-surface-secondary focus-visible:focus-ring"
                >
                  {selectedIds.includes(record.id) ? (
                    <SuccessIcon className="size-4 shrink-0 text-success" />
                  ) : (
                    <CircleDashedIcon className="size-4 shrink-0 text-muted" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{record.recipe.name}</span>
                    <span className="block text-xs text-muted">
                      {`${t.recipeServings(record.recipe.servings)} · ${t.recipeIngredients(record.recipe.ingredients.length)}`}
                    </span>
                  </span>
                </button>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onPress={() => onOpenRecipe(record.id)}
                >
                  {t.recipeDetails}
                </Button>
              </div>
            ))}
          </Card>
        )}

        <div className="flex items-baseline justify-between gap-3">
          <Typography.Paragraph size="sm" className="text-muted">
            {t.recipeLandingHint}
          </Typography.Paragraph>
          {hiddenCount > 0 ? (
            <button
              type="button"
              onClick={onOpenRecipes}
              className="shrink-0 cursor-[var(--cursor-interactive)] text-xs text-accent hover:underline focus-visible:focus-ring"
            >
              {t.recipeMore(hiddenCount)}
            </button>
          ) : null}
        </div>
      </section>

      <Typography.Paragraph size="sm" className="text-muted">
        {t.footnote}
      </Typography.Paragraph>
    </div>
  );
}
