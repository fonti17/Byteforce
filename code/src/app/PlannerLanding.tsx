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
import { isRecipeComplete } from '@/features/recipes/recipeService';
import type { StoredRecipe } from '@/features/recipes/types';
import { recipeName, recipeSummary } from '@/features/recipes/recipeFields';
import type { Language, Strings } from '@/shared/i18n/strings';

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
  plannerMode: 'private' | 'business';
  isAnalysing: boolean;
  onlyOwnRecipes: boolean;
  onToggleOnlyOwnRecipes: (value: boolean) => void;
  /** Newest first — only the first few are shown here. */
  recipes: StoredRecipe[];
  selectedIds: string[];
  savedProjectsCount?: number;
  onAnalyse: (message: string, targetMargin?: number | null) => void;
  onToggleRecipe: (id: string) => void;
  onOpenRecipe: (id: string) => void;
  onOpenRecipes: () => void;
  onOpenProjects?: () => void;
}

/**
 * View 1 — "Catering Planer". One free-text field feeds the extractor, and the
 * recipe list below it picks the dishes that go into the menu and the shopping
 * list of `cateringPlan.config.json`.
 */
export function PlannerLanding({
  t,
  language,
  plannerMode,
  isAnalysing,
  onlyOwnRecipes,
  onToggleOnlyOwnRecipes,
  recipes,
  selectedIds,
  savedProjectsCount = 0,
  onAnalyse,
  onToggleRecipe,
  onOpenRecipe,
  onOpenRecipes,
  onOpenProjects,
}: PlannerLandingProps) {
  const [message, setMessage] = useState('');
  const [targetMarginStr, setTargetMarginStr] = useState('');
  // The list starts short and expands in place, so picking a recipe further down
  // does not mean leaving the planner.
  const [isExpanded, setIsExpanded] = useState(false);
  const hasText = message.trim().length > 0;
  const hasSelectedRecipes = selectedIds.length > 0;
  const canSubmit = (hasText || hasSelectedRecipes) && !isAnalysing;
  const visible = isExpanded ? recipes : recipes.slice(0, VISIBLE_RECIPES);
  const hiddenCount = recipes.length - visible.length;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const marginNum = targetMarginStr.trim() ? Number.parseFloat(targetMarginStr) : null;
    onAnalyse(message, plannerMode === 'business' && !Number.isNaN(marginNum) ? marginNum : null);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Prodega Easy Promotional Banner Style */}
      <div className="flex flex-col justify-center overflow-hidden rounded-lg bg-[#ed1b2f] p-5 text-white shadow-xs sm:p-6">
        <Typography.Heading level={1} className="text-xl sm:text-2xl font-bold tracking-tight text-white">
          {t.landingTitle}
        </Typography.Heading>
        <Typography.Paragraph className="text-white/90 text-sm mt-1">
          {t.landingSubtitle}
        </Typography.Paragraph>
      </div>

      {onOpenProjects ? (
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2.5 shadow-xs -mt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-700">
              {t.projectsTitle}
            </span>
            <span className="rounded bg-neutral-200 px-2 py-0.5 text-[11px] font-bold text-neutral-800 tabular-nums">
              {savedProjectsCount}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-primary hover:underline font-semibold text-xs p-0 h-auto"
            onPress={onOpenProjects}
          >
            {t.allProjects} →
          </Button>
        </div>
      ) : null}

      <Card className="border border-neutral-200 bg-white rounded-lg shadow-xs overflow-hidden">
        <Card.Content className="p-4 sm:p-6 flex flex-col gap-4">
          {plannerMode === 'business' ? (
            <div className="rounded-lg bg-neutral-50 p-4 border border-neutral-200 flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-700">
                {t.targetMarginLabel}
              </label>
              <input
                type="number"
                min="0"
                step="50"
                value={targetMarginStr}
                onChange={(e) => setTargetMarginStr(e.target.value)}
                placeholder={t.targetMarginPlaceholder}
                disabled={isAnalysing}
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              />
              <span className="text-xs text-neutral-500 mt-0.5">
                {t.targetMarginHelp}
              </span>
            </div>
          ) : null}

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
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  handleSubmit();
                }
              }}
            />
          </TextField>
        </Card.Content>
        <Card.Footer className="justify-between gap-3 bg-neutral-50 px-4 py-3 border-t border-neutral-100 flex flex-wrap items-center">
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
            onPress={handleSubmit}
            className="bg-primary text-white hover:bg-primary/90 rounded px-6 py-2 text-sm font-semibold transition-colors shadow-xs disabled:opacity-50"
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
            className="text-primary hover:underline font-medium rounded"
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
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50 transition-colors focus:outline-none"
                >
                  {selectedIds.includes(record.id) ? (
                    <SuccessIcon className="size-5 shrink-0 text-primary" />
                  ) : (
                    <CircleDashedIcon className="size-5 shrink-0 text-neutral-400" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-neutral-900">
                      {recipeName(record.recipe, t)}
                    </span>
                    <span className="block text-xs text-neutral-500 mt-0.5">
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
          <Typography.Paragraph size="sm" className="text-neutral-600">
            {selectedIds.length > 0 ? t.recipeSelected(selectedIds.length) : t.recipeLandingHint}
          </Typography.Paragraph>
          {recipes.length > VISIBLE_RECIPES ? (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-expanded={isExpanded}
              className="shrink-0 cursor-pointer text-xs font-semibold text-primary hover:underline"
            >
              {isExpanded ? t.recipeLess : t.recipeMore(hiddenCount)}
            </button>
          ) : null}
        </div>

        {/* Option to strictly use own recipes without inventing new dishes */}
        {selectedIds.length > 0 ? (
          <label className="flex items-start gap-3 p-3.5 rounded-lg border border-neutral-200 bg-neutral-50 cursor-pointer hover:bg-neutral-100/70 transition-colors">
            <input
              type="checkbox"
              checked={onlyOwnRecipes}
              onChange={(e) => onToggleOnlyOwnRecipes(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary accent-primary"
            />
            <div className="flex flex-col gap-0.5 select-none">
              <span className="text-xs font-bold text-neutral-900">
                {t.onlyOwnRecipesLabel}
              </span>
              <span className="text-xs text-neutral-600">
                {t.onlyOwnRecipesDescription}
              </span>
            </div>
          </label>
        ) : null}
      </section>

      <div className="text-center text-xs text-neutral-400 mt-4 border-t border-neutral-200 pt-4">
        {t.footnote}
      </div>
    </div>
  );
}
