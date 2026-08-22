import { Alert, Button, Card, Chip, IconChevronLeft, Spinner, Typography } from '@heroui/react';
import type { CateringPlan, ShoppingListEntry } from '../../types/cateringPlan';
import type { GatheringResult } from '../../types/gathering';
import type { Language, Strings } from './strings';

interface CateringPlanViewProps {
  t: Strings;
  language: Language;
  result: GatheringResult;
  plan: CateringPlan | null;
  isPlanning: boolean;
  /** Number of recipes folded into this plan, shown as provenance. */
  usedRecipes: number;
  /** The model was unreachable and the plan came from the recipes alone. */
  usedLocalPlan: boolean;
  error: Error | null;
  onRetry: () => void;
  onOpenRecipes: () => void;
  onBack: () => void;
  onRestart: () => void;
}

function localeOf(language: Language): string {
  return language === 'de' ? 'de-CH' : 'en-GB';
}

function formatQuantity(entry: ShoppingListEntry, t: Strings, language: Language): string {
  const amount = new Intl.NumberFormat(localeOf(language), {
    maximumFractionDigits: 2,
  }).format(entry.quantity);
  const unit = t.units[entry.unit as keyof Strings['units']] ?? entry.unit;
  return `${amount} ${unit}`;
}

function formatMoney(amount: number, currency: string, language: Language): string {
  return new Intl.NumberFormat(localeOf(language), {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Shopping list grouped by category, in the order the categories first appear. */
function groupByCategory(entries: ShoppingListEntry[], fallback: string) {
  const groups = new Map<string, ShoppingListEntry[]>();
  for (const entry of entries) {
    const category = entry.category ?? fallback;
    const existing = groups.get(category);
    if (existing) existing.push(entry);
    else groups.set(category, [entry]);
  }
  return [...groups.entries()];
}

/**
 * View 4 — part 2 rendered as lists: the menu, the shopping list grouped by
 * category, and the budget estimate from `config/cateringPlanConfig.json`.
 */
export function CateringPlanView({
  t,
  language,
  result,
  plan,
  isPlanning,
  usedRecipes,
  usedLocalPlan,
  error,
  onRetry,
  onOpenRecipes,
  onBack,
  onRestart,
}: CateringPlanViewProps) {
  const groups = plan ? groupByCategory(plan.shoppingList, t.uncategorised) : [];
  const withinBudget =
    plan !== null &&
    plan.budget.estimatedTotal > 0 &&
    plan.budget.estimatedTotal <= result.budget.amount;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" className="-ml-3 w-fit text-muted" onPress={onBack}>
          <IconChevronLeft />
          {t.back}
        </Button>
        <Typography.Heading level={1} className="text-2xl font-bold tracking-tight">
          {t.planTitle}
        </Typography.Heading>
        <Typography.Paragraph className="text-muted">
          {t.planSubtitle(result.participantCount)}
        </Typography.Paragraph>
        {usedRecipes > 0 ? (
          <Chip variant="soft" className="w-fit">
            <Chip.Label>{`${t.recipeFromRecipes}: ${t.recipeSelected(usedRecipes)}`}</Chip.Label>
          </Chip>
        ) : null}
      </div>

      {usedLocalPlan ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t.planLocalNotice}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      {isPlanning ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <Spinner />
          <span className="text-sm font-medium">{t.planning}</span>
          <span className="text-xs text-muted">{t.planningHint}</span>
        </Card>
      ) : null}

      {error && !isPlanning ? (
        <div className="flex flex-col gap-3">
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{t.planError}</Alert.Description>
            </Alert.Content>
          </Alert>
          <Button fullWidth onPress={onRetry}>
            {t.retry}
          </Button>
        </div>
      ) : null}

      {plan ? (
        <>
          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <Typography.Heading level={2} className="text-sm font-semibold text-muted">
                {t.menuSection}
              </Typography.Heading>
              <span className="text-xs text-muted">{t.itemCount(plan.menu.items.length)}</span>
            </div>
            <Card className="gap-0 overflow-hidden p-0">
              {plan.menu.name ? (
                <div className="border-b border-separator px-4 py-3 text-sm font-semibold">
                  {plan.menu.name}
                </div>
              ) : null}
              <ul>
                {plan.menu.items.map((item, index) => (
                  <li
                    key={`${item.name}-${index}`}
                    className="flex gap-3 border-b border-separator px-4 py-3 last:border-b-0"
                  >
                    <span className="w-5 shrink-0 text-xs text-muted tabular-nums">
                      {index + 1}.
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{item.name}</span>
                      {item.description ? (
                        <span className="block text-xs text-muted">{item.description}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <Typography.Heading level={2} className="text-sm font-semibold text-muted">
                {t.shoppingSection}
              </Typography.Heading>
              <span className="text-xs text-muted">{t.itemCount(plan.shoppingList.length)}</span>
            </div>
            <Card className="gap-0 overflow-hidden p-0">
              {groups.map(([category, entries]) => (
                <div key={category}>
                  <div className="border-b border-separator bg-surface-secondary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    {category}
                  </div>
                  <ul>
                    {entries.map((entry, index) => (
                      <li
                        key={`${entry.ingredient}-${index}`}
                        className="flex items-center gap-3 border-b border-separator px-4 py-3 last:border-b-0"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm">{entry.ingredient}</span>
                        <span className="shrink-0 text-sm font-medium tabular-nums">
                          {formatQuantity(entry, t, language)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Card>
          </section>

          <section className="flex flex-col gap-2">
            <Typography.Heading level={2} className="text-sm font-semibold text-muted">
              {t.budgetSection}
            </Typography.Heading>
            <Card className="flex flex-col gap-3 p-4">
              {plan.budget.estimatedTotal > 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted">{t.estimatedTotal}</span>
                  <span className="text-lg font-bold tabular-nums">
                    {formatMoney(plan.budget.estimatedTotal, plan.budget.currency, language)}
                  </span>
                </div>
              ) : null}
              <Chip color={withinBudget ? 'success' : 'warning'} variant="soft" className="w-fit">
                <Chip.Label>
                  {`${t.labelBudget}: ${formatMoney(result.budget.amount, result.budget.currency, language)}`}
                </Chip.Label>
              </Chip>
              {plan.budget.note ? (
                <Typography.Paragraph className="text-sm text-muted">
                  {plan.budget.note}
                </Typography.Paragraph>
              ) : null}
            </Card>
          </section>
        </>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onPress={onBack}>
          {t.backToBrief}
        </Button>
        <Button variant="outline" onPress={onOpenRecipes}>
          {t.recipeOpen}
        </Button>
        <Button variant="ghost" className="text-muted" onPress={onRestart}>
          {t.restart}
        </Button>
      </div>
    </div>
  );
}
