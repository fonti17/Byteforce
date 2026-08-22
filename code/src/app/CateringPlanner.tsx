import { useCallback, useMemo, useState } from 'react';
import { Button } from '@heroui/react';
import { useCateringPlan } from '@/features/catering-plan/hooks/useCateringPlan';
import { useGathering, type PlannerStep } from '@/features/gathering/hooks/useGathering';
import { useRecipes } from '@/features/recipes/hooks/useRecipes';
import { useProjects } from '@/features/projects/hooks/useProjects';
import { buildGatheringResult, getMissingRequiredFields } from '@/features/gathering/gatheringService';
import type { GatheringData, GatheringField, GatheringResult } from '@/features/gathering/types';
import type { Recipe } from '@/features/recipes/types';
import type { StoredProject } from '@/features/projects/types';
import { CateringPlanView } from '@/features/catering-plan/components/CateringPlanView';
import { GatheringInput } from '@/features/gathering/components/GatheringInput';
import { MissingValues } from '@/features/gathering/components/MissingValues';
import { PlannerLanding } from './PlannerLanding';
import { RecipeDetailView } from '@/features/recipes/components/RecipeDetailView';
import { RecipesView } from '@/features/recipes/components/RecipesView';
import { ProjectsView } from '@/features/projects/components/ProjectsView';
import { openQuestions, type QuestionId } from '@/features/gathering/questions';
import { strings, type Language } from '@/shared/i18n/strings';

/**
 * Interactive prototype: Catering Planer -> Missing values -> Input -> the JSON
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
    loadData,
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

  // Projects persistence hook
  const projects = useProjects();
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isProjectSaved, setIsProjectSaved] = useState(false);

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

  // Where the secondary views return to, as a stack so deep jumps back step through each screen.
  const [returnTrail, setReturnTrail] = useState<PlannerStep[]>([]);
  const [detailRecipeId, setDetailRecipeId] = useState<string | null>(null);

  const openRecipes = useCallback(
    (returnStep: PlannerStep) => {
      setReturnTrail((prev) => [...prev, returnStep]);
      setStep('recipes');
    },
    [setStep]
  );

  const openProjects = useCallback(
    (returnStep: PlannerStep) => {
      setReturnTrail((prev) => [...prev, returnStep]);
      setStep('projects');
    },
    [setStep]
  );

  const openRecipeDetail = useCallback(
    (id: string, returnStep: PlannerStep) => {
      setDetailRecipeId(id);
      setReturnTrail((prev) => [...prev, returnStep]);
      setStep('recipeDetail');
    },
    [setStep]
  );

  /** Leaves a secondary view for the step it was opened from; landing is the floor. */
  const closeSecondaryView = useCallback(() => {
    setStep(returnTrail[returnTrail.length - 1] ?? 'landing');
    setReturnTrail((trail) => trail.slice(0, -1));
  }, [returnTrail, setStep]);

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
    setPlan,
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
      setIsProjectSaved(false);
      void generatePlan({ gatheringState: payload, originalRequest });
    },
    [generatePlan, originalRequest, resetPlan]
  );

  const openPlan = useCallback(
    (payload: GatheringResult) => {
      runPlan(payload);
      setStep('plan');
    },
    [runPlan, setStep]
  );

  const handleRestart = useCallback(() => {
    resetPlan();
    clearSelection();
    setTargetMargin(null);
    setCurrentProjectId(null);
    setIsProjectSaved(false);
    setReturnTrail([]);
    reset();
  }, [clearSelection, reset, resetPlan]);

  const handleSaveProject = useCallback(async () => {
    if (!plan || !result) return;
    const projectName =
      plan.menu.name?.trim() || `${t.planTitle} (${result.participantCount} ${t.labelParticipants})`;
    const saved = await projects.saveProject(
      {
        name: projectName,
        gatheringResult: result,
        originalRequest,
        plan,
        plannerMode,
        targetMargin,
        onlyOwnRecipes: isOnlyOwnActive,
        selectedRecipeIds: recipes.selectedIds,
      },
      currentProjectId ?? undefined
    );
    setCurrentProjectId(saved.id);
    setIsProjectSaved(true);
  }, [plan, result, t.planTitle, t.labelParticipants, projects, originalRequest, plannerMode, targetMargin, isOnlyOwnActive, recipes.selectedIds, currentProjectId]);

  const handleLoadProject = useCallback(
    (project: StoredProject) => {
      resetPlan();
      loadData(
        {
          eventType: project.gatheringResult.eventType,
          date: project.gatheringResult.date,
          participantCount: project.gatheringResult.participantCount,
          meal: project.gatheringResult.meal,
          budget: project.gatheringResult.budget,
          context: project.gatheringResult.context,
        },
        project.originalRequest
      );
      setPlannerMode(project.plannerMode);
      setTargetMargin(project.targetMargin);
      setOnlyOwnRecipes(project.onlyOwnRecipes);
      setPlan(project.plan);
      setCurrentProjectId(project.id);
      setIsProjectSaved(true);
      setStep('plan');
    },
    [loadData, resetPlan, setPlan, setStep]
  );

  // A newly typed recipe opens on its own detail screen, so it can be checked
  // and picked for the event right away.
  const handleCreateRecipe = useCallback(
    async (recipe: Recipe) => {
      const record = await recipes.save(recipe);
      openRecipeDetail(record.id, 'recipes');
    },
    [openRecipeDetail, recipes]
  );

  // A newly imported or typed recipe opens on its own detail screen so it can be checked right away.
  const handleImportRecipe = useCallback(
    async (text: string) => {
      const imported = await recipes.importText(text);
      if (imported) {
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
      const trail = returnTrail.filter((entry) => entry !== 'recipeDetail');
      setStep(trail[trail.length - 1] ?? 'recipes');
      setReturnTrail(trail.slice(0, -1));
    },
    [returnTrail, recipes, setStep]
  );

  const startQuestions = useCallback(
    (questions: QuestionId[]) => {
      if (questions.length === 0) {
        if (result) openPlan(result);
        return;
      }
      setQueue(questions);
      setQueueRun((run) => run + 1);
      setStep('input');
    },
    [openPlan, result, setStep]
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
      if (getMissingRequiredFields(nextData).length === 0) {
        const nextResult = buildGatheringResult(nextData);
        if (nextResult) openPlan(nextResult);
        return;
      }
      setStep('brief');
    },
    [openPlan, setStep]
  );

  return (
    <div className="min-h-screen bg-white text-neutral-900 flex flex-col">
      <header className="sticky top-0 z-50 bg-[#f8f8f8] border-b border-neutral-200 shadow-xs">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={handleRestart}
            aria-label={t.backToStart}
            title={t.backToStart}
            className="flex items-center gap-2 sm:gap-2.5 rounded transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <img
              src="/images/cAItering.png"
              alt="cAItering"
              className="h-4 sm:h-5 w-auto object-contain"
            />
            <span className="text-neutral-300">|</span>
            <span className="text-xs sm:text-sm font-bold tracking-tight text-neutral-800 uppercase">{t.brand}</span>
          </button>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Private vs Business mode toggle switch */}
            <div className="flex items-center rounded-lg border border-neutral-300 bg-white p-0.5 text-xs font-semibold shadow-xs">
              <button
                type="button"
                onClick={() => setPlannerMode('private')}
                aria-pressed={plannerMode === 'private'}
                aria-label={t.modePrivate}
                title={t.modePrivate}
                className={`flex items-center gap-1.5 rounded px-2 py-1.5 transition-colors sm:px-2.5 sm:py-1 ${
                  plannerMode === 'private'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"></path><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
                <span className="hidden sm:inline">{t.modePrivate}</span>
              </button>
              <button
                type="button"
                onClick={() => setPlannerMode('business')}
                aria-pressed={plannerMode === 'business'}
                aria-label={t.modeBusiness}
                title={t.modeBusiness}
                className={`flex items-center gap-1.5 rounded px-2 py-1.5 transition-colors sm:px-2.5 sm:py-1 ${
                  plannerMode === 'business'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path><rect width="20" height="14" x="2" y="6" rx="2"></rect></svg>
                <span className="hidden sm:inline">{t.modeBusiness}</span>
              </button>
            </div>

            {/* Saved Projects Header Button */}
            {!isPlanning && !gathering.isAnalysing ? (
              <Button
                variant="outline"
                size="sm"
                aria-label={t.projectsOpen}
                className="font-medium text-xs rounded border-neutral-300 text-neutral-700 hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5 px-2 sm:px-3"
                onPress={() => openProjects(step)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                </svg>
                <span className="hidden sm:inline">{t.projectsOpen}</span>
                {projects.projects.length > 0 ? (
                  <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-bold text-neutral-800 tabular-nums">
                    {projects.projects.length}
                  </span>
                ) : null}
              </Button>
            ) : null}

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
            savedProjectsCount={projects.projects.length}
            onAnalyse={(message, margin) => void handleAnalyse(message, margin)}
            onToggleRecipe={recipes.toggleSelected}
            onOpenRecipe={(id) => openRecipeDetail(id, 'landing')}
            onOpenRecipes={() => openRecipes('landing')}
            onOpenProjects={() => openProjects('landing')}
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
            onBack={closeSecondaryView}
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
            onBack={closeSecondaryView}
          />
        ) : null}

        {step === 'projects' ? (
          <ProjectsView
            t={t}
            language={language}
            projects={projects.projects}
            onOpenProject={handleLoadProject}
            onDeleteProject={projects.removeProject}
            onExport={projects.exportLibrary}
            onImportLibrary={projects.importLibrary}
            onBack={closeSecondaryView}
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
            isSaved={isProjectSaved}
            onSaveProject={handleSaveProject}
            onOpenProjects={() => openProjects('plan')}
            onRetry={() => runPlan(result)}
            onOpenRecipes={() => openRecipes('plan')}
            onBack={() => setStep('brief')}
            onRestart={handleRestart}
          />
        ) : null}
      </main>
    </div>
  );
}
