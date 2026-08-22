import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { useCateringPlan } from '../../hooks/useCateringPlan';
import { useGathering, type PlannerStep } from '../../hooks/useGathering';
import { useRecipes } from '../../hooks/useRecipes';
import { getMissingRequiredFields } from '../../services/gatheringService';
import { isRecipeComplete } from '../../services/recipeService';
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

  const recipeOptions = useMemo(() => ({ language }), [language]);
  const recipes = useRecipes(recipeOptions);
  const { clearSelection, selectedRecipes } = recipes;

  // Recipes are part of the plan input, so a changed selection re-runs part 2.
  const planOptions = useMemo(
    () => ({
      language,
      model: 'apertus-70b',
      temperature: 0.2,
      maxTokens: 1800,
      recipes: selectedRecipes,
    }),
    [language, selectedRecipes]
  );

  // Where the recipe views return to. The list and the detail screen open each
  // other, so a single slot would be overwritten by the second hop and leave
  // back pointing at the screen it is already on — a dead end. A trail keeps
  // every way out; revisiting a step folds the loop away instead of stacking it.
  const [recipeReturnTrail, setRecipeReturnTrail] = useState<PlannerStep[]>([]);
  const [detailRecipeId, setDetailRecipeId] = useState<string | null>(null);

  const pushReturnStep = useCallback((returnStep: PlannerStep) => {
    setRecipeReturnTrail((trail) => {
      const seen = trail.indexOf(returnStep);
      return seen === -1 ? [...trail, returnStep] : trail.slice(0, seen + 1);
    });
  }, []);

  const openRecipes = useCallback(
    (returnStep: PlannerStep) => {
      pushReturnStep(returnStep);
      setStep('recipes');
    },
    [pushReturnStep, setStep]
  );

  const openRecipeDetail = useCallback(
    (id: string, returnStep: PlannerStep) => {
      setDetailRecipeId(id);
      pushReturnStep(returnStep);
      setStep('recipeDetail');
    },
    [pushReturnStep, setStep]
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
      void generatePlan({ gatheringState: payload, originalRequest });
    },
    [generatePlan, originalRequest, planKey, resetPlan]
  );

  const handleRestart = useCallback(() => {
    plannedForRef.current = null;
    resetPlan();
    clearSelection();
    setRecipeReturnTrail([]);
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

  // A picked menu is a starting point on its own: nothing has been read from a
  // request, so the walk simply asks for every value the schema still needs.
  const handleStartWithRecipes = useCallback(() => {
    startQuestions(openQuestionList);
  }, [openQuestionList, startQuestions]);

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
              <img src="/images/icon-512x512.png" alt={t.brand} className="size-7 rounded-lg" />
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
            onStartWithRecipes={handleStartWithRecipes}
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
