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
import { isRecipeComplete } from '../../services/recipeService';
import type { StoredRecipe } from '../../types/recipe';
import { recipeName, recipeSummary } from './fields';
import { ProdegaLogo } from './ProdegaLogo';
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
  /** Starts the plan from the recipe selection alone, without a written request. */
  onStartWithRecipes: () => void;
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
  onStartWithRecipes,
}: PlannerLandingProps) {
  const [message, setMessage] = useState('');
  // The list starts short and expands in place, so picking a recipe further down
  // does not mean leaving the planner.
  const [isExpanded, setIsExpanded] = useState(false);
  const canSubmit = message.trim().length > 0 && !isAnalysing;
  const visible = isExpanded ? recipes : recipes.slice(0, VISIBLE_RECIPES);
  const hiddenCount = recipes.length - visible.length;

  return (
    <div className="flex flex-col gap-6">
      {/* Prodega Easy Promotional Banner Style */}
      <div className="flex flex-col justify-center overflow-hidden rounded-lg bg-[#ed1b2f] p-5 text-white shadow-xs sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <ProdegaLogo className="h-5 w-auto" textColor="#FFFFFF" />
          <span className="text-white/40 text-xs">|</span>
          <span className="text-white/80 text-xs font-semibold uppercase tracking-wider">
            Easy Planer
          </span>
        </div>
        <Typography.Heading level={1} className="text-xl sm:text-2xl font-bold tracking-tight text-white">
          {t.landingTitle}
        </Typography.Heading>
        <Typography.Paragraph className="text-white/90 text-sm mt-1">
          {t.landingSubtitle}
        </Typography.Paragraph>
      </div>

      <Card className="border border-neutral-200 bg-white rounded-lg shadow-xs overflow-hidden">
        <Card.Content className="p-4 sm:p-6">
          <TextField
            aria-label={t.inputLabel}
            variant="secondary"
            value={message}
            onChange={setMessage}
            isDisabled={isAnalysing}
            className="w-full"
          >
            <TextArea
              placeholder={t.inputPlaceholder}
              rows={5}
              className="resize-none rounded-md border border-neutral-300 p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary w-full outline-none"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canSubmit) {
                  onAnalyse(message);
                }
              }}
            />
          </TextField>
        </Card.Content>
        <Card.Footer className="justify-between gap-3 bg-neutral-50 px-4 py-3 border-t border-neutral-100 flex flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            className="text-primary hover:underline hover:bg-transparent p-0 text-sm font-medium"
            isDisabled={isAnalysing}
            onPress={() => setMessage(EXAMPLE_REQUEST[language])}
          >
            {t.insertExample}
          </Button>
          <Button
            isDisabled={!canSubmit}
            onPress={() => onAnalyse(message)}
            className="bg-primary text-white hover:bg-primary/90 rounded px-5 py-2 text-sm font-medium transition-colors shadow-xs disabled:opacity-50"
          >
            {isAnalysing ? <Spinner size="sm" /> : null}
            {isAnalysing ? t.analysing : t.analyse}
          </Button>
        </Card.Footer>
      </Card>

      <section className="flex flex-col gap-3 mt-2">
        <div className="flex items-center justify-between gap-3">
          <Typography.Heading level={2} className="text-base font-bold text-neutral-900">
            {t.recipesTitle}
          </Typography.Heading>
          <Button
            variant="ghost"
            size="sm"
            className="text-primary hover:underline p-0 text-sm font-medium"
            onPress={onOpenRecipes}
          >
            {recipes.length > 0 ? t.recipeAllRecipes : t.recipeNew}
          </Button>
        </div>

        {visible.length === 0 ? (
          <Card className="flex flex-col items-start gap-3 p-5 bg-white border border-neutral-200 rounded-lg">
            <Typography.Paragraph className="text-sm text-neutral-500">
              {t.recipeLandingEmpty}
            </Typography.Paragraph>
            <Button
              size="sm"
              onPress={onOpenRecipes}
              className="bg-primary text-white hover:bg-primary/90 rounded px-3 py-1.5 text-sm font-medium"
            >
              {t.recipeNew}
            </Button>
          </Card>
        ) : (
          <Card className="gap-0 overflow-hidden p-0 bg-white border border-neutral-200 rounded-lg shadow-xs divide-y divide-neutral-100">
            {visible.map((record) => (
              <div
                key={record.id}
                className="flex items-center gap-2 p-3 hover:bg-neutral-50 transition-colors"
              >
                <button
                  type="button"
                  onClick={() =>
                    isRecipeComplete(record.recipe)
                      ? onToggleRecipe(record.id)
                      : onOpenRecipe(record.id)
                  }
                  aria-pressed={
                    isRecipeComplete(record.recipe) ? selectedIds.includes(record.id) : undefined
                  }
                  className="flex min-w-0 flex-1 cursor-[var(--cursor-interactive)] items-center gap-3 px-4 py-3 text-left hover:bg-surface-secondary focus-visible:focus-ring"
                >
                  {selectedIds.includes(record.id) ? (
                    <SuccessIcon className="size-5 shrink-0 text-accent" />
                  ) : (
                    <CircleDashedIcon className="size-5 shrink-0 text-muted" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {recipeName(record.recipe, t)}
                    </span>
                    <span className="block text-xs text-muted">
                      {recipeSummary(record.recipe, t)}
                    </span>
                  </span>
                </button>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 border-neutral-300 rounded text-xs font-medium hover:border-primary hover:text-primary"
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
            {selectedIds.length > 0 ? t.recipeSelected(selectedIds.length) : t.recipeLandingHint}
          </Typography.Paragraph>
          {recipes.length > VISIBLE_RECIPES ? (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-expanded={isExpanded}
              className="shrink-0 cursor-[var(--cursor-interactive)] text-xs text-accent hover:underline focus-visible:focus-ring"
            >
              {isExpanded ? t.recipeLess : t.recipeMore(hiddenCount)}
            </button>
          ) : null}
        </div>

        {/* Picked dishes are enough to start: the question walk asks for the rest. */}
        {selectedIds.length > 0 ? (
          <div className="flex flex-col items-stretch gap-2">
            <Button fullWidth isDisabled={isAnalysing} onPress={onStartWithRecipes}>
              {t.recipeStartWith(selectedIds.length)}
            </Button>
            <Typography.Paragraph size="sm" className="mx-auto text-muted">
              {t.recipeStartHint}
            </Typography.Paragraph>
          </div>
        ) : null}
      </section>

      <div className="text-center text-xs text-neutral-400 mt-4 border-t border-neutral-200 pt-4">
        {t.footnote}
      </div>
    </div>
  );
}
