import { useState } from 'react';
import {
  Button,
  Card,
  CircleDashedIcon,
  Input,
  NumberField,
  TextField,
  Typography,
} from '@heroui/react';
import { getMissingRecipeFields } from '../recipeService';
import type { Recipe, RecipeField } from '../types';
import { RECIPE_SERVINGS_PRESETS, recipeFieldLabel, recipeFieldPrompt } from '../recipeFields';
import type { Strings } from '@/shared/i18n/strings';

interface RecipeMissingValuesProps {
  t: Strings;
  recipe: Recipe;
  /** Stores one answered property; the block then moves on to the next one. */
  onAnswer: (patch: Partial<Recipe>) => void;
  /** Opens the full editor, for values a single control cannot supply. */
  onEdit: () => void;
}

/**
 * The recipe counterpart of `MissingValues`: whatever `recipeConfig.json`
 * requires and the read did not produce is asked for here, one question at a
 * time, instead of being filled in with a guessed number.
 */
export function RecipeMissingValues({ t, recipe, onAnswer, onEdit }: RecipeMissingValuesProps) {
  const missing = getMissingRecipeFields(recipe);
  const field = missing[0];
  if (!field) return null;

  return (
    <Card className="gap-4 border-warning/40">
      <Card.Content className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Typography.Heading level={2} className="text-sm font-semibold text-muted">
            {t.recipeMissingTitle}
          </Typography.Heading>
          <Typography.Paragraph className="text-sm text-muted">
            {t.recipeMissingSubtitle(missing.length)}
          </Typography.Paragraph>
        </div>

        <Typography.Heading level={3} className="text-lg font-semibold tracking-tight text-balance">
          {recipeFieldPrompt(field, t)}
        </Typography.Heading>

        <FieldControl t={t} field={field} onAnswer={onAnswer} onEdit={onEdit} />

        {missing.length > 1 ? (
          <ul className="flex flex-col gap-1.5">
            {missing.slice(1).map((open) => (
              <li key={open} className="flex items-center gap-2 text-xs text-muted">
                <CircleDashedIcon className="size-3.5 shrink-0" />
                {`${recipeFieldLabel(open, t)} — ${t.missing}`}
              </li>
            ))}
          </ul>
        ) : null}
      </Card.Content>
    </Card>
  );
}

interface FieldControlProps {
  t: Strings;
  field: RecipeField;
  onAnswer: (patch: Partial<Recipe>) => void;
  onEdit: () => void;
}

function FieldControl({ t, field, onAnswer, onEdit }: FieldControlProps) {
  switch (field) {
    case 'servings':
      return <ServingsControl t={t} onAnswer={onAnswer} />;
    case 'name':
      return <NameControl t={t} onAnswer={onAnswer} />;
    case 'ingredients':
      // Ingredients are rows, not a single value — the editor owns that form.
      return (
        <div className="flex flex-col items-start gap-3">
          <Typography.Paragraph size="sm" className="text-muted">
            {t.recipeIngredientsHint}
          </Typography.Paragraph>
          <Button variant="outline" onPress={onEdit}>
            {t.recipeEdit}
          </Button>
        </div>
      );
  }
}

function ServingsControl({ t, onAnswer }: { t: Strings; onAnswer: (patch: Partial<Recipe>) => void }) {
  const [servings, setServings] = useState<number>(Number.NaN);
  const isValid = Number.isInteger(servings) && servings > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <NumberField
          aria-label={t.recipeServingsLabel}
          variant="secondary"
          value={servings}
          onChange={setServings}
          minValue={1}
          step={1}
          className="w-40"
        >
          <NumberField.Group>
            <NumberField.DecrementButton />
            <NumberField.Input />
            <NumberField.IncrementButton />
          </NumberField.Group>
        </NumberField>
        <Button isDisabled={!isValid} onPress={() => onAnswer({ servings })}>
          {t.send}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {RECIPE_SERVINGS_PRESETS.map((preset) => (
          <Button
            key={preset}
            variant="outline"
            size="sm"
            onPress={() => onAnswer({ servings: preset })}
          >
            {preset}
          </Button>
        ))}
      </div>
      <Typography.Paragraph size="sm" className="text-muted">
        {t.recipeServingsHint}
      </Typography.Paragraph>
    </div>
  );
}

function NameControl({ t, onAnswer }: { t: Strings; onAnswer: (patch: Partial<Recipe>) => void }) {
  const [name, setName] = useState('');
  const isValid = name.trim() !== '';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <TextField
        aria-label={t.recipeNameLabel}
        variant="secondary"
        value={name}
        onChange={setName}
        className="min-w-0 flex-1"
      >
        <Input placeholder={t.recipeNameLabel} />
      </TextField>
      <Button isDisabled={!isValid} onPress={() => onAnswer({ name: name.trim() })}>
        {t.send}
      </Button>
    </div>
  );
}
