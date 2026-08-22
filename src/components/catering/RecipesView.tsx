import { useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  IconChevronLeft,
  IconChevronRight,
  Spinner,
  TextArea,
  TextField,
  Typography,
} from '@heroui/react';
import type { Recipe, RecipeLibraryFile, StoredRecipe } from '../../types/recipe';
import type { RecipeSource } from '../../hooks/useRecipes';
import { emptyRecipe } from '../../services/recipeService';
import { RecipeEditor } from './RecipeEditor';
import { recipeName, recipeSummary } from './fields';
import type { Language, Strings } from './strings';

/** Pasted in the shape people actually copy from a website or a chat message. */
const EXAMPLE_RECIPE: Record<Language, string> = {
  de: [
    'Kartoffelgratin',
    'Für 4 Personen',
    '',
    'Zutaten:',
    '1 kg Kartoffeln',
    '2 dl Rahm',
    '200 g Gruyère',
    '2 Zehen Knoblauch',
    '1 TL Muskatnuss',
    '',
    'Zubereitung:',
    'Kartoffeln in dünne Scheiben schneiden und in die geriebene Form schichten.',
    'Rahm mit Knoblauch und Muskat würzen, darüber giessen und mit Käse bestreuen.',
    'Bei 200 Grad 45 Minuten backen.',
  ].join('\n'),
  en: [
    'Potato gratin',
    'Serves 4',
    '',
    'Ingredients:',
    '1 kg potatoes',
    '2 dl cream',
    '200 g Gruyère',
    '2 cloves garlic',
    '1 tsp nutmeg',
    '',
    'Preparation:',
    'Slice the potatoes thinly and layer them in a greased dish.',
    'Season the cream with garlic and nutmeg, pour it over and top with the cheese.',
    'Bake at 200 degrees for 45 minutes.',
  ].join('\n'),
};

interface RecipesViewProps {
  t: Strings;
  language: Language;
  recipes: StoredRecipe[];
  isImporting: boolean;
  source: RecipeSource | null;
  error: Error | null;
  onImportText: (text: string) => void;
  /** Saves a recipe typed in by hand and opens its detail screen. */
  onCreate: (recipe: Recipe) => void;
  onOpenDetail: (id: string) => void;
  onExport: () => RecipeLibraryFile;
  onImportLibrary: (raw: string) => Promise<number>;
  onBack: () => void;
}

/**
 * Recipe library — pasted text becomes the structure of
 * `config/recipeConfig.json` and is stored in the browser. Managing recipes
 * happens here; picking them for an event happens on the landing page.
 */
export function RecipesView({
  t,
  language,
  recipes,
  isImporting,
  source,
  error,
  onImportText,
  onCreate,
  onOpenDetail,
  onExport,
  onImportLibrary,
  onBack,
}: RecipesViewProps) {
  const [text, setText] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSubmit = text.trim().length > 0 && !isImporting;

  const submit = () => {
    if (!canSubmit) return;
    onImportText(text);
    setText('');
  };

  const exportLibrary = () => {
    const file = onExport();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'recipes.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    setNotice(null);
    try {
      const count = await onImportLibrary(await file.text());
      setNotice({ text: t.recipeImported(count), isError: false });
    } catch {
      setNotice({ text: t.recipeImportError, isError: true });
    }
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
        <Typography.Heading level={1} className="text-2xl font-bold tracking-tight text-neutral-900">
          {t.recipesTitle}
        </Typography.Heading>
        <Typography.Paragraph className="text-sm text-neutral-600">{t.recipesSubtitle}</Typography.Paragraph>
      </div>

      <Card className="border border-neutral-200 bg-white rounded-lg shadow-xs overflow-hidden">
        <Card.Content className="p-4">
          <TextField
            aria-label={t.recipeInputLabel}
            variant="secondary"
            value={text}
            onChange={setText}
            isDisabled={isImporting}
            className="w-full"
          >
            <TextArea
              placeholder={t.recipeInputPlaceholder}
              rows={5}
              className="resize-none rounded-md border border-neutral-300 p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary w-full outline-none"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit();
              }}
            />
          </TextField>
        </Card.Content>
        <Card.Footer className="justify-between gap-3 bg-neutral-50 px-4 py-3 border-t border-neutral-100 flex flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            className="text-primary hover:underline hover:bg-transparent p-0 text-sm font-medium"
            isDisabled={isImporting}
            onPress={() => setText(EXAMPLE_RECIPE[language])}
          >
            {t.recipeInsertExample}
          </Button>
          <Button
            isDisabled={!canSubmit}
            onPress={submit}
            className="bg-primary text-white hover:bg-primary/90 rounded px-4 py-2 text-sm font-medium transition-colors shadow-xs disabled:opacity-50"
          >
            {isImporting ? <Spinner size="sm" /> : null}
            {isImporting ? t.recipeAdding : t.recipeAdd}
          </Button>
        </Card.Footer>
      </Card>

      {isCreating ? (
        <Card className="border border-neutral-200 bg-white rounded-lg shadow-xs p-4">
          <Card.Content className="p-0">
            <RecipeEditor
              t={t}
              recipe={emptyRecipe()}
              onSave={(recipe) => {
                setIsCreating(false);
                onCreate(recipe);
              }}
              onCancel={() => setIsCreating(false)}
            />
          </Card.Content>
        </Card>
      ) : (
        <Button
          variant="outline"
          className="w-fit border-neutral-300 text-neutral-800 hover:border-primary hover:text-primary rounded text-sm font-medium"
          onPress={() => setIsCreating(true)}
        >
          {t.recipeManual}
        </Button>
      )}

      {error ? (
        <Alert status="danger" className="border-red-200 bg-red-50 text-red-900 rounded-lg">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t.recipeError}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      {source === 'local' && !error ? (
        <Alert status="warning" className="border-amber-200 bg-amber-50 text-amber-900 rounded-lg">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t.recipeLocalNotice}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

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

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Typography.Heading level={2} className="text-base font-bold text-neutral-900">
            {t.recipeLibrary}
          </Typography.Heading>
          <span className="text-xs text-muted">{t.recipeCount(recipes.length)}</span>
        </div>

        {recipes.length === 0 ? (
          <Card className="p-6 text-center bg-white border border-neutral-200 rounded-lg">
            <Typography.Paragraph className="text-sm text-neutral-500">
              {t.recipeLibraryEmpty}
            </Typography.Paragraph>
          </Card>
        ) : (
          <Card className="gap-0 overflow-hidden p-0 bg-white border border-neutral-200 rounded-lg shadow-xs divide-y divide-neutral-100">
            {recipes.map((record) => (
              <RecipeRow
                key={record.id}
                t={t}
                record={record}
                onOpenDetail={() => onOpenDetail(record.id)}
              />
            ))}
          </Card>
        )}

        <Typography.Paragraph size="sm" className="text-xs text-neutral-500">
          {t.recipeLibraryHint}
        </Typography.Paragraph>
      </section>

      <div className="flex flex-wrap gap-2">
        {/* The backup file holds the whole library, so it needs one stored recipe. */}
        <Button variant="outline" isDisabled={recipes.length === 0} onPress={exportLibrary}>
          {t.recipeExport}
        </Button>
        <Button
          variant="outline"
          onPress={() => fileInputRef.current?.click()}
          className="border-neutral-300 text-neutral-800 hover:border-primary hover:text-primary rounded text-xs font-medium"
        >
          {t.recipeImport}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
            event.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

interface RecipeRowProps {
  t: Strings;
  record: StoredRecipe;
  onOpenDetail: () => void;
}

/**
 * The library row only opens the recipe — a recipe is picked for an event on the
 * landing page, so nothing here changes the selection.
 */
function RecipeRow({ t, record, onOpenDetail }: RecipeRowProps) {
  const { recipe } = record;

  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className="flex w-full min-w-0 cursor-[var(--cursor-interactive)] items-center gap-3 border-b border-separator px-4 py-3 text-left last:border-b-0 hover:bg-surface-secondary focus-visible:focus-ring"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{recipeName(recipe, t)}</span>
        <span className="block text-xs text-muted">{recipeSummary(recipe, t)}</span>
      </span>
      <IconChevronRight className="size-4 shrink-0 text-muted" />
    </button>
  );
}
