import { useState } from 'react';
import {
  Alert,
  Button,
  CloseIcon,
  Input,
  TextArea,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@heroui/react';
import { CATERING_UNITS } from '../../types/cateringPlan';
import { RECIPE_COURSES, RECIPE_DIETS } from '../../types/recipe';
import type { Recipe, RecipeCourse, RecipeDiet } from '../../types/recipe';
import type { Strings } from './strings';

interface DraftIngredient {
  /** Stable across re-orders, so a row keeps its input focus while typing. */
  key: string;
  ingredient: string;
  /** Kept as text while editing, so a half-typed number is not swallowed. */
  quantity: string;
  unit: string;
  category: string;
}

function draftKey(): string {
  return Math.random().toString(36).slice(2, 10);
}

function toDraftIngredients(recipe: Recipe): DraftIngredient[] {
  return recipe.ingredients.map((entry) => ({
    key: draftKey(),
    ingredient: entry.ingredient,
    quantity: String(entry.quantity),
    unit: entry.unit,
    category: entry.category ?? '',
  }));
}

interface RecipeEditorProps {
  t: Strings;
  recipe: Recipe;
  onSave: (recipe: Recipe) => void;
  onCancel: () => void;
}

/**
 * Form over one recipe, in the shape of `config/recipeConfig.json`. Units are
 * limited to the schema enum, so an edited recipe stays mergeable into the
 * shopping list without conversion.
 */
export function RecipeEditor({ t, recipe, onSave, onCancel }: RecipeEditorProps) {
  const [name, setName] = useState(recipe.name);
  const [description, setDescription] = useState(recipe.description ?? '');
  const [servings, setServings] = useState(String(recipe.servings));
  const [course, setCourse] = useState<RecipeCourse | null>(recipe.course);
  const [diet, setDiet] = useState<RecipeDiet[]>(recipe.diet);
  const [ingredients, setIngredients] = useState<DraftIngredient[]>(() =>
    recipe.ingredients.length > 0
      ? toDraftIngredients(recipe)
      : [{ key: draftKey(), ingredient: '', quantity: '', unit: 'g', category: '' }]
  );
  const [stepsText, setStepsText] = useState(recipe.steps.join('\n'));
  const [isIncomplete, setIsIncomplete] = useState(false);

  const updateIngredient = (key: string, patch: Partial<DraftIngredient>) => {
    setIngredients((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry))
    );
  };

  const submit = () => {
    const parsedIngredients = ingredients.flatMap((entry) => {
      const quantity = Number(entry.quantity.replace(',', '.'));
      if (entry.ingredient.trim() === '' || !Number.isFinite(quantity) || quantity <= 0) return [];
      return [
        {
          ingredient: entry.ingredient.trim(),
          quantity,
          unit: entry.unit,
          category: entry.category.trim() === '' ? null : entry.category.trim(),
          note: null,
        },
      ];
    });

    const parsedServings = Number(servings);
    if (name.trim() === '' || parsedIngredients.length === 0) {
      setIsIncomplete(true);
      return;
    }

    onSave({
      name: name.trim(),
      description: description.trim() === '' ? null : description.trim(),
      servings: Number.isFinite(parsedServings) && parsedServings >= 1 ? Math.round(parsedServings) : 1,
      course,
      diet,
      ingredients: parsedIngredients,
      steps: stepsText
        .split('\n')
        .map((step) => step.trim())
        .filter((step) => step !== ''),
      source: recipe.source,
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {isIncomplete ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t.recipeIncomplete}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <Field label={t.recipeNameLabel}>
        <TextField aria-label={t.recipeNameLabel} variant="secondary" value={name} onChange={setName}>
          <Input placeholder={t.recipeNameLabel} />
        </TextField>
      </Field>

      <Field label={t.recipeDescriptionLabel}>
        <TextField
          aria-label={t.recipeDescriptionLabel}
          variant="secondary"
          value={description}
          onChange={setDescription}
        >
          <TextArea rows={2} className="resize-none" />
        </TextField>
      </Field>

      <Field label={t.recipeServingsLabel}>
        <TextField
          aria-label={t.recipeServingsLabel}
          variant="secondary"
          value={servings}
          onChange={setServings}
          className="w-28"
        >
          <Input inputMode="numeric" />
        </TextField>
      </Field>

      <Field label={t.recipeCourseLabel}>
        <select
          aria-label={t.recipeCourseLabel}
          value={course ?? ''}
          onChange={(event) => setCourse((event.target.value || null) as RecipeCourse | null)}
          className="w-fit cursor-[var(--cursor-interactive)] rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:focus-ring"
        >
          <option value="">{t.recipeCourseNone}</option>
          {RECIPE_COURSES.map((value) => (
            <option key={value} value={value}>
              {t.course[value]}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t.recipeDietLabel}>
        <ToggleButtonGroup
          isDetached
          size="sm"
          selectionMode="multiple"
          aria-label={t.recipeDietLabel}
          selectedKeys={diet}
          onSelectionChange={(keys) => setDiet([...keys] as RecipeDiet[])}
          className="flex-wrap"
        >
          {RECIPE_DIETS.map((value) => (
            <ToggleButton key={value} id={value}>
              {t.diet[value]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Field>

      <Field label={t.recipeIngredientsLabel}>
        <div className="flex flex-col gap-2">
          {ingredients.map((entry) => (
            <div key={entry.key} className="flex items-center gap-2">
              <TextField
                aria-label={t.recipeQuantityLabel}
                variant="secondary"
                value={entry.quantity}
                onChange={(value) => updateIngredient(entry.key, { quantity: value })}
                className="w-20 shrink-0"
              >
                <Input inputMode="decimal" placeholder="0" />
              </TextField>
              <select
                aria-label={t.recipeUnitLabel}
                value={entry.unit}
                onChange={(event) => updateIngredient(entry.key, { unit: event.target.value })}
                className="w-24 shrink-0 cursor-[var(--cursor-interactive)] rounded-xl border border-border bg-surface px-2 py-2 text-sm text-foreground focus-visible:focus-ring"
              >
                {CATERING_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {t.units[unit]}
                  </option>
                ))}
              </select>
              <TextField
                aria-label={t.recipeIngredientLabel}
                variant="secondary"
                value={entry.ingredient}
                onChange={(value) => updateIngredient(entry.key, { ingredient: value })}
                className="min-w-0 flex-1"
              >
                <Input placeholder={t.recipeIngredientLabel} />
              </TextField>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t.recipeRemoveIngredient}
                className="shrink-0 text-muted"
                onPress={() =>
                  setIngredients((current) => current.filter((row) => row.key !== entry.key))
                }
              >
                <CloseIcon className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onPress={() =>
              setIngredients((current) => [
                ...current,
                { key: draftKey(), ingredient: '', quantity: '', unit: 'g', category: '' },
              ])
            }
          >
            {t.recipeAddIngredient}
          </Button>
        </div>
      </Field>

      <Field label={t.recipeStepsLabel} hint={t.recipeStepsHint}>
        <TextField
          aria-label={t.recipeStepsLabel}
          variant="secondary"
          value={stepsText}
          onChange={setStepsText}
        >
          <TextArea rows={5} className="resize-none" />
        </TextField>
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button onPress={submit}>{t.recipeSave}</Button>
        <Button variant="outline" onPress={onCancel}>
          {t.recipeCancel}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint ? (
        <Typography.Paragraph size="sm" className="text-muted">
          {hint}
        </Typography.Paragraph>
      ) : null}
    </div>
  );
}
