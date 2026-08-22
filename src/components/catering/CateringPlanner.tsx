import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { useCateringPlan } from '../../hooks/useCateringPlan';
import { useGathering, type PlannerStep } from '../../hooks/useGathering';
import { useRecipes } from '../../hooks/useRecipes';
import { getMissingRequiredFields } from '../../services/gatheringService';
import type { GatheringData, GatheringField, GatheringResult } from '../../types/gathering';
import type { Recipe } from '../../types/recipe';
import { CateringPlanView } from './CateringPlanView';
import { GatheringInput } from './GatheringInput';
import { GatheringResultView } from './GatheringResultView';
import { MissingValues } from './MissingValues';
import { PlannerLanding } from './PlannerLanding';
import { RecipeDetailView } from './RecipeDetailView';
import { RecipesView } from './RecipesView';
import { openQuestions, type QuestionId } from './fields';
import { strings, type Language } from './strings';

/**
 * Interactive prototype: Catering Planer → Missing values → Input → the JSON
 * structure of `config/gatheringConfig.json` (part 1), which then feeds part 2 —
 * menu and shopping list, shaped by `config/cateringPlanConfig.json`.
 */
export function CateringPlanner() {
  const [language, setLanguage] = useState<Language>('de');
  const t = strings[language];

  const options = useMemo(() => ({ language }), [language]);
  const gathering = useGathering(options);
  const { analyse, apply, data, missingFields, result, reset, setStep, source, step } = gathering;

  const recipes = useRecipes(options);
  const { clearSelection, selectedRecipes } = recipes;

  // Recipes are part of the plan input, so a changed selection re-runs part 2.
  const planOptions = useMemo(
    () => ({ language, recipes: selectedRecipes }),
    [language, selectedRecipes]
  );

  // Where the recipe views return to, so they can be opened from several steps.
  const [recipeReturnStep, setRecipeReturnStep] = useState<PlannerStep>('landing');
  const [detailRecipeId, setDetailRecipeId] = useState<string | null>(null);

  const openRecipes = useCallback(
    (returnStep: PlannerStep) => {
      setRecipeReturnStep(returnStep);
      setStep('recipes');
    },
    [setStep]
  );

  const openRecipeDetail = useCallback(
    (id: string, returnStep: PlannerStep) => {
      setDetailRecipeId(id);
      setRecipeReturnStep(returnStep);
      setStep('recipeDetail');
    },
    [setStep]
  );

  const detailRecord = useMemo(
    () => recipes.recipes.find((entry) => entry.id === detailRecipeId) ?? null,
    [detailRecipeId, recipes.recipes]
  );

  // Questions are fixed while the input view is mounted; bumping the run counter
  // remounts it with a fresh walk.
  const [queue, setQueue] = useState<QuestionId[]>([]);
  const [queueRun, setQueueRun] = useState(0);

  const openQuestionList = useMemo(() => openQuestions(missingFields), [missingFields]);

  const {
    plan,
    isPlanning,
    source: planSource,
    error: planError,
    generate: generatePlan,
    reset: resetPlan,
  } = useCateringPlan(planOptions);

  // Identifies the inputs a plan was built from, so part 2 runs once per
  // completed payload and re-runs when an answer or a recipe changes afterwards.
  const plannedForRef = useRef<string | null>(null);
  const planKey = useMemo(
    () => (result ? JSON.stringify({ result, recipes: recipes.selectedIds }) : null),
    [result, recipes.selectedIds]
  );

  const runPlan = useCallback(
    (payload: GatheringResult) => {
      plannedForRef.current = planKey;
      resetPlan();
      void generatePlan(payload);
    },
    [generatePlan, planKey, resetPlan]
  );

  // Part 2 starts as soon as part 1 is complete, so the proposal is usually
  // ready by the time the result view is left.
  useEffect(() => {
    if (!result || plannedForRef.current === planKey) return;
    runPlan(result);
  }, [planKey, result, runPlan]);

  const handleRestart = useCallback(() => {
    plannedForRef.current = null;
    resetPlan();
    clearSelection();
    reset();
  }, [clearSelection, reset, resetPlan]);

  // A newly typed recipe opens on its own detail screen, so it can be checked
  // and picked for the event right away.
  const handleCreateRecipe = useCallback(
    async (recipe: Recipe) => {
      const record = await recipes.save(recipe);
      openRecipeDetail(record.id, 'recipes');
    },
    [openRecipeDetail, recipes]
  );

  const handleDeleteRecipe = useCallback(
    async (id: string) => {
      await recipes.remove(id);
      setDetailRecipeId(null);
      setStep(recipeReturnStep === 'recipeDetail' ? 'recipes' : recipeReturnStep);
    },
    [recipeReturnStep, recipes, setStep]
  );

  const startQuestions = useCallback(
    (questions: QuestionId[]) => {
      if (questions.length === 0) {
        setStep('result');
        return;
      }
      setQueue(questions);
      setQueueRun((run) => run + 1);
      setStep('input');
    },
    [setStep]
  );

  const handleAnalyse = useCallback(
    async (message: string) => {
      await analyse(message);
      setStep('brief');
    },
    [analyse, setStep]
  );

  const handleQuestionAnalyse = useCallback(
    async (message: string, expectedField: GatheringField) => {
      const { data: next, updates } = await analyse(message, expectedField);
      return { data: next, updates };
    },
    [analyse]
  );

  // Free text can leave a question half answered, so the brief is the fallback
  // whenever the walk ends with something still open.
  const handleQuestionsDone = useCallback(
    (nextData: GatheringData) => {
      setStep(getMissingRequiredFields(nextData).length === 0 ? 'result' : 'brief');
    },
    [setStep]
  );

  return (
    <div className="min-h-full bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="size-7 rounded-lg bg-accent" aria-hidden="true" />
            <span className="text-base font-bold tracking-tight">{t.brand}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            aria-label={language === 'de' ? 'Switch to English' : 'Auf Deutsch wechseln'}
            className="font-mono"
            onPress={() => setLanguage(language === 'de' ? 'en' : 'de')}
          >
            {t.languageLabel}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 pt-8 pb-16">
        {step === 'landing' ? (
          <PlannerLanding
            t={t}
            language={language}
            isAnalysing={gathering.isAnalysing}
            recipes={recipes.recipes}
            selectedIds={recipes.selectedIds}
            onAnalyse={(message) => void handleAnalyse(message)}
            onToggleRecipe={recipes.toggleSelected}
            onOpenRecipe={(id) => openRecipeDetail(id, 'landing')}
            onOpenRecipes={() => openRecipes('landing')}
          />
        ) : null}

        {step === 'brief' ? (
          <MissingValues
            t={t}
            language={language}
            data={data}
            openQuestionCount={openQuestionList.length}
            usedLocalExtraction={source === 'local'}
            onBack={() => setStep('landing')}
            onContinue={() => startQuestions(openQuestionList)}
            onEdit={(question) => startQuestions([question])}
          />
        ) : null}

        {step === 'input' ? (
          <GatheringInput
            key={queueRun}
            t={t}
            language={language}
            data={data}
            questions={queue}
            isAnalysing={gathering.isAnalysing}
            onApply={apply}
            onAnalyse={handleQuestionAnalyse}
            onBack={() => setStep('brief')}
            onDone={handleQuestionsDone}
          />
        ) : null}

        {/* A detail step without its record — a deleted recipe — falls back to the list. */}
        {step === 'recipes' || (step === 'recipeDetail' && !detailRecord) ? (
          <RecipesView
            t={t}
            language={language}
            recipes={recipes.recipes}
            selectedIds={recipes.selectedIds}
            isImporting={recipes.isImporting}
            source={recipes.source}
            error={recipes.error}
            onImportText={(text) => void recipes.importText(text)}
            onCreate={(recipe) => void handleCreateRecipe(recipe)}
            onToggle={recipes.toggleSelected}
            onOpenDetail={(id) => openRecipeDetail(id, 'recipes')}
            onExport={recipes.exportLibrary}
            onImportLibrary={recipes.importLibrary}
            onBack={() => setStep(recipeReturnStep)}
          />
        ) : null}

        {step === 'recipeDetail' && detailRecord ? (
          <RecipeDetailView
            t={t}
            language={language}
            record={detailRecord}
            participantCount={data.participantCount}
            isSelected={recipes.selectedIds.includes(detailRecord.id)}
            onToggleSelected={() => recipes.toggleSelected(detailRecord.id)}
            onSave={(recipe) => void recipes.save(recipe, detailRecord)}
            onDelete={() => void handleDeleteRecipe(detailRecord.id)}
            onAddNew={() => openRecipes('recipeDetail')}
            onUpload={recipes.importLibrary}
            onBack={() => setStep(recipeReturnStep)}
          />
        ) : null}

        {step === 'result' && result ? (
          <GatheringResultView
            t={t}
            result={result}
            isPlanning={isPlanning}
            onContinue={() => setStep('plan')}
            onBack={() => setStep('brief')}
            onRestart={handleRestart}
          />
        ) : null}

        {step === 'plan' && result ? (
          <CateringPlanView
            t={t}
            language={language}
            result={result}
            plan={plan}
            isPlanning={isPlanning}
            usedRecipes={selectedRecipes.length}
            usedLocalPlan={planSource === 'local'}
            error={planError}
            onRetry={() => runPlan(result)}
            onOpenRecipes={() => openRecipes('plan')}
            onBack={() => setStep('result')}
            onRestart={handleRestart}
          />
        ) : null}
      </main>
    </div>
  );
}
