import { useCallback, useMemo, useState } from 'react';
import { Button } from '@heroui/react';
import { useCateringPlan } from '@/features/catering-plan/hooks/useCateringPlan';
import { useGathering, type PlannerStep } from '@/features/gathering/hooks/useGathering';
import { useRecipes } from '@/features/recipes/hooks/useRecipes';
import { getMissingRequiredFields } from '@/features/gathering/gatheringService';
import { isRecipeComplete } from '@/features/recipes/recipeService';
import type { GatheringData, GatheringField, GatheringResult } from '@/features/gathering/types';
import type { Recipe } from '@/features/recipes/types';
import { CateringPlanView } from '@/features/catering-plan/components/CateringPlanView';
import { GatheringInput } from '@/features/gathering/components/GatheringInput';
import { GatheringResultView } from '@/features/gathering/components/GatheringResultView';
import { MissingValues } from '@/features/gathering/components/MissingValues';
import { PlannerLanding } from './PlannerLanding';
import { RecipeDetailView } from '@/features/recipes/components/RecipeDetailView';
import { RecipesView } from '@/features/recipes/components/RecipesView';
import { openQuestions, type QuestionId } from '@/features/gathering/questions';
import { ProdegaLogo } from '@/shared/ui/ProdegaLogo';
import { strings, type Language } from '@/shared/i18n/strings';

/**
 * Interactive prototype: Catering Planer → Missing values → Input → the JSON
 * structure of `gathering.config.json` (part 1), which then feeds part 2 —
 * menu and shopping list, shaped by `cateringPlan.config.json`.
 */
export function CateringPlanner() {
  const [language, setLanguage] = useState<Language>('de');
  const [plannerMode, setPlannerMode] = useState<'private' | 'business'>('private');
  const [targetMargin, setTargetMargin] = useState<number | null>(null);
  const t = strings[language];

  const gatheringOptions = useMemo(
    () => ({ language, model: 'apertus-8b', temperature: 0, maxTokens: 250 }),
    [language]
  );
  const gathering = useGathering(gatheringOptions);
  const {
    analyse,
    apply,
    data,
    missingFields,
    originalRequest,
    result,
    reset,
    setStep,
    source,
    step,
    uncertain,
  } = gathering;

  const [onlyOwnRecipes, setOnlyOwnRecipes] = useState(false);

  const recipeOptions = useMemo(() => ({ language }), [language]);
  const recipes = useRecipes(recipeOptions);
  const { clearSelection, selectedRecipes } = recipes;

  // If no recipes are selected, onlyOwnRecipes cannot be active.
  const isOnlyOwnActive = onlyOwnRecipes && selectedRecipes.length > 0;

  // Recipes are part of the plan input, so a changed selection re-runs part 2.
  // When isOnlyOwnActive is true, we switch to the compact model 'apertus-8b'
  // for scaling and quantity derivation without generating new recipes.
  const planOptions = useMemo(
    () => ({
      language,
      model: isOnlyOwnActive ? 'apertus-8b' : 'apertus-70b',
      temperature: 0.2,
      maxTokens: isOnlyOwnActive ? 800 : 1800,
      recipes: selectedRecipes,
      onlyOwnRecipes: isOnlyOwnActive,
    }),
    [language, selectedRecipes, isOnlyOwnActive]
  );

  // Where the recipe views return to, as a stack so deep jumps back (e.g. from
  // a detail screen reached via the full catalogue) step back through each screen.
  const [recipeReturnTrail, setRecipeReturnTrail] = useState<PlannerStep[]>([]);
  const [detailRecipeId, setDetailRecipeId] = useState<string | null>(null);

  const openRecipes = useCallback(
    (returnStep: PlannerStep) => {
      setRecipeReturnTrail((prev) => [...prev, returnStep]);
      setStep('recipes');
    },
    [setStep]
  );

  const openRecipeDetail = useCallback(
    (id: string, returnStep: PlannerStep) => {
      setDetailRecipeId(id);
      setRecipeReturnTrail((prev) => [...prev, returnStep]);
      setStep('recipeDetail');
    },
    [setStep]
  );

  /** Leaves a recipe view for the step it was opened from; landing is the floor. */
  const closeRecipeView = useCallback(() => {
    setStep(recipeReturnTrail[recipeReturnTrail.length - 1] ?? 'landing');
    setRecipeReturnTrail((trail) => trail.slice(0, -1));
  }, [recipeReturnTrail, setStep]);

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
    streamedText,
    pricingProgress,
    source: planSource,
    error: planError,
    generate: generatePlan,
    reset: resetPlan,
  } = useCateringPlan(planOptions);

  const runPlan = useCallback(
    (payload: GatheringResult) => {
      resetPlan();
      void generatePlan({ gatheringState: payload, originalRequest });
    },
    [generatePlan, originalRequest, resetPlan]
  );

  const handleRestart = useCallback(() => {
    resetPlan();
    clearSelection();
    setTargetMargin(null);
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

  // A read that left a required value open — most often the serving count —
  // asks for it right away, the way the brief does for part 1.
  const handleImportRecipe = useCallback(
    async (text: string) => {
      const imported = await recipes.importText(text);
      if (imported && !isRecipeComplete(imported.record.recipe)) {
        openRecipeDetail(imported.record.id, 'recipes');
      }
    },
    [openRecipeDetail, recipes]
  );

  const handleDeleteRecipe = useCallback(
    async (id: string) => {
      await recipes.remove(id);
      setDetailRecipeId(null);
      // The deleted recipe has no detail screen left, so the trail skips those.
      const trail = recipeReturnTrail.filter((entry) => entry !== 'recipeDetail');
      setStep(trail[trail.length - 1] ?? 'recipes');
      setRecipeReturnTrail(trail.slice(0, -1));
    },
    [recipeReturnTrail, recipes, setStep]
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
    async (message: string, margin?: number | null) => {
      if (plannerMode === 'business') {
        setTargetMargin(typeof margin === 'number' && margin > 0 ? margin : null);
      } else {
        setTargetMargin(null);
      }
      if (message.trim()) {
        await analyse(message);
      }
      setStep('brief');
    },
    [analyse, plannerMode, setStep]
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
    <div className="min-h-screen bg-white text-neutral-900 flex flex-col">
      <header className="sticky top-0 z-50 bg-[#f8f8f8] border-b border-neutral-200 shadow-xs">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <ProdegaLogo className="h-7 w-auto" />
            <span className="text-neutral-300">|</span>
            <span className="text-sm font-bold tracking-tight text-neutral-800 uppercase">{t.brand}</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Private vs Business mode toggle switch */}
            <div className="flex items-center rounded-lg border border-neutral-300 bg-white p-0.5 text-xs font-semibold shadow-xs">
              <button
                type="button"
                onClick={() => setPlannerMode('private')}
                className={`rounded px-2.5 py-1 transition-colors ${
                  plannerMode === 'private'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {t.modePrivate}
              </button>
              <button
                type="button"
                onClick={() => setPlannerMode('business')}
                className={`rounded px-2.5 py-1 transition-colors ${
                  plannerMode === 'business'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {t.modeBusiness}
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              aria-label={language === 'de' ? 'Switch to English' : 'Auf Deutsch wechseln'}
              className="font-medium text-xs rounded border-neutral-300 text-neutral-700 hover:border-primary hover:text-primary transition-colors"
              onPress={() => setLanguage(language === 'de' ? 'en' : 'de')}
            >
              {t.languageLabel}
            </Button>
          </div>
        </div>
      </header>

      <main className={`mx-auto w-full px-4 pt-6 pb-20 sm:px-6 flex-1 transition-all ${
        step === 'plan' ? 'max-w-7xl' : 'max-w-4xl'
      }`}>
        {step === 'landing' ? (
          <PlannerLanding
            t={t}
            language={language}
            plannerMode={plannerMode}
            isAnalysing={gathering.isAnalysing}
            onlyOwnRecipes={isOnlyOwnActive}
            onToggleOnlyOwnRecipes={setOnlyOwnRecipes}
            recipes={recipes.recipes}
            selectedIds={recipes.selectedIds}
            onAnalyse={(message, margin) => void handleAnalyse(message, margin)}
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
            uncertain={uncertain}
            // Returning to the prompt starts a completely new session.
            onBack={handleRestart}
            onContinue={() => startQuestions(openQuestionList)}
            onEdit={(question) => startQuestions([question])}
            onUpdateContext={(context) => apply({ context })}
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
            isImporting={recipes.isImporting}
            source={recipes.source}
            error={recipes.error}
            onImportText={(text) => void handleImportRecipe(text)}
            onCreate={(recipe) => void handleCreateRecipe(recipe)}
            onOpenDetail={(id) => openRecipeDetail(id, 'recipes')}
            onExport={recipes.exportLibrary}
            onImportLibrary={recipes.importLibrary}
            onBack={closeRecipeView}
          />
        ) : null}

        {step === 'recipeDetail' && detailRecord ? (
          <RecipeDetailView
            t={t}
            language={language}
            record={detailRecord}
            participantCount={data.participantCount}
            onSave={(recipe) => void recipes.save(recipe, detailRecord)}
            onDelete={() => void handleDeleteRecipe(detailRecord.id)}
            onAddNew={() => openRecipes('recipeDetail')}
            onUpload={recipes.importLibrary}
            onBack={closeRecipeView}
          />
        ) : null}

        {step === 'result' && result ? (
          <GatheringResultView
            t={t}
            result={result}
            isPlanning={isPlanning}
            onContinue={() => {
              runPlan(result);
              setStep('plan');
            }}
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
            streamedText={streamedText}
            pricingProgress={pricingProgress}
            usedRecipes={recipes.selectedIds.length}
            targetMargin={targetMargin}
            onlyOwnRecipes={isOnlyOwnActive}
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
