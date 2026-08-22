import { useRef, useState } from 'react';
import {
  Alert,
  AlertDialog,
  Button,
  Card,
  Chip,
  IconChevronLeft,
  Typography,
} from '@heroui/react';
import { isRecipeComplete, scaleRecipe } from '../recipeService';
import type { Recipe, StoredRecipe } from '../types';
import { RecipeEditor } from './RecipeEditor';
import { RecipeMissingValues } from './RecipeMissingValues';
import { recipeName, recipeSummary } from '../recipeFields';
import type { Language, Strings } from '@/shared/i18n/strings';

interface RecipeDetailViewProps {
  t: Strings;
  language: Language;
  record: StoredRecipe;
  /** Known once part 1 has a participant count — drives the scaling preview. */
  participantCount: number | null;
  onSave: (recipe: Recipe) => void;
  onDelete: () => void;
  /** Opens the recipe screen, where a new recipe is pasted or typed. */
  onAddNew: () => void;
  /** Reads a recipe or a library file; resolves with how many were added. */
  onUpload: (raw: string) => Promise<number>;
  onBack: () => void;
}

/**
 * Detail screen for one stored recipe: the full recipe as
 * `recipe.config.json` describes it, with the quantities this event would
 * actually buy, plus edit, add, download, and upload.
 */
export function RecipeDetailView({
  t,
  language,
  record,
  participantCount,
  onSave,
  onDelete,
  onAddNew,
  onUpload,
  onBack,
}: RecipeDetailViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  // Deleting throws away a stored recipe, so it waits for an explicit yes.
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { recipe } = record;

  // Preview the quantities the plan will buy, not the ones written down. An
  // unanswered serving count cannot be scaled, so the recipe is shown as written.
  const scaled =
    participantCount && recipe.servings !== null ? scaleRecipe(recipe, participantCount) : null;
  const ingredients = scaled ?? recipe.ingredients;
  const isComplete = isRecipeComplete(recipe);

  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slugify(recipe.name)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file: File) => {
    setNotice(null);
    try {
      const count = await onUpload(await file.text());
      setNotice({ text: t.recipeImported(count), isError: false });
    } catch {
      setNotice({ text: t.recipeImportError, isError: true });
    }
  };

  const save = (next: Recipe) => {
    onSave(next);
    setIsEditing(false);
    setNotice({ text: t.recipeSaved, isError: false });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 w-fit text-primary hover:underline hover:bg-transparent p-0 text-sm font-medium"
          onPress={onBack}
        >
          <IconChevronLeft />
          {t.back}
        </Button>
        <Typography.Heading level={1} className="text-2xl font-bold tracking-tight text-balance">
          {recipeName(recipe, t)}
        </Typography.Heading>
        <Typography.Paragraph className="text-muted">
          {recipeSummary(recipe, t)}
        </Typography.Paragraph>
      </div>

      {notice ? (
        <Alert
          status={notice.isError ? 'danger' : 'success'}
          className={`rounded-lg ${notice.isError ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}
        >
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{notice.text}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      {isComplete ? null : (
        <RecipeMissingValues
          t={t}
          recipe={recipe}
          onAnswer={(patch) => onSave({ ...recipe, ...patch })}
          onEdit={() => setIsEditing(true)}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="border-neutral-300 text-neutral-800 hover:border-primary hover:text-primary rounded text-xs font-medium"
          onPress={() => setIsEditing((editing) => !editing)}
        >
          {isEditing ? t.recipeCancel : t.recipeEdit}
        </Button>
        <Button
          variant="outline"
          className="border-neutral-300 text-neutral-800 hover:border-primary hover:text-primary rounded text-xs font-medium"
          onPress={download}
        >
          {t.recipeDownload}
        </Button>
        <Button
          variant="danger-soft"
          className="border-neutral-300 text-neutral-800 hover:border-primary hover:text-primary rounded text-xs font-medium"
          onPress={() => setIsConfirmingDelete(true)}
        >
          {t.recipeDelete}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = '';
          }}
        />
      </div>

      <AlertDialog isOpen={isConfirmingDelete} onOpenChange={setIsConfirmingDelete}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>{t.recipeDeleteTitle}</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <Typography.Paragraph className="text-muted">
                  {t.recipeDeleteBody(recipeName(recipe, t))}
                </Typography.Paragraph>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="outline" onPress={() => setIsConfirmingDelete(false)}>
                  {t.recipeCancel}
                </Button>
                <Button
                  variant="danger"
                  onPress={() => {
                    setIsConfirmingDelete(false);
                    onDelete();
                  }}
                >
                  {t.recipeDeleteConfirm}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>

      {isEditing ? (
        <Card className="border border-neutral-200 bg-white rounded-lg shadow-xs p-4">
          <Card.Content className="p-0">
            <RecipeEditor
              t={t}
              recipe={recipe}
              onSave={save}
              onCancel={() => setIsEditing(false)}
            />
          </Card.Content>
        </Card>
      ) : (
        <>
          {recipe.course || recipe.diet.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {recipe.course ? (
                <Chip variant="soft" size="sm" className="bg-neutral-200 text-neutral-800 font-semibold rounded text-xs">
                  <Chip.Label>{t.course[recipe.course]}</Chip.Label>
                </Chip>
              ) : null}
              {recipe.diet.map((diet) => (
                <Chip key={diet} variant="soft" size="sm" color="success" className="bg-emerald-100 text-emerald-800 font-semibold rounded text-xs">
                  <Chip.Label>{t.diet[diet]}</Chip.Label>
                </Chip>
              ))}
            </div>
          ) : null}

          {recipe.description ? (
            <Typography.Paragraph className="text-sm text-neutral-600">{recipe.description}</Typography.Paragraph>
          ) : null}

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <Typography.Heading level={2} className="text-base font-bold text-neutral-900">
                {t.recipeIngredientsLabel}
              </Typography.Heading>
              {scaled ? (
                <span className="text-xs font-semibold text-primary">
                  {t.recipeScaledTo(participantCount ?? 0)}
                </span>
              ) : null}
            </div>
            <Card className="gap-0 overflow-hidden p-0 bg-white border border-neutral-200 rounded-lg shadow-xs divide-y divide-neutral-100">
              <ul>
                {ingredients.map((entry, index) => (
                  <li
                    key={`${entry.ingredient}-${index}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">{entry.ingredient}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-neutral-900">
                      {formatQuantity(entry.quantity, entry.unit, t, language)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          {recipe.steps.length > 0 ? (
            <section className="flex flex-col gap-2">
              <Typography.Heading level={2} className="text-base font-bold text-neutral-900">
                {t.recipeSteps}
              </Typography.Heading>
              <Card className="p-4 bg-white border border-neutral-200 rounded-lg shadow-xs">
                <ol className="flex list-decimal flex-col gap-2.5 pl-4 text-sm text-neutral-800">
                  {recipe.steps.map((step, index) => (
                    <li key={index} className="leading-relaxed">{step}</li>
                  ))}
                </ol>
              </Card>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function slugify(name: string): string {
  const slug = name
    .toLocaleLowerCase('de-CH')
    .replace(/[^a-z0-9äöü]+/gu, '-')
    .replace(/^-|-$/gu, '');
  return slug === '' ? 'rezept' : slug;
}

function formatQuantity(quantity: number, unit: string, t: Strings, language: Language): string {
  const amount = new Intl.NumberFormat(language === 'de' ? 'de-CH' : 'en-GB', {
    maximumFractionDigits: 2,
  }).format(quantity);
  return `${amount} ${t.units[unit as keyof Strings['units']] ?? unit}`;
}
