import { Alert, Button, Card, Chip, IconChevronLeft, Spinner, Typography } from '@heroui/react';
import type { PricedCateringPlan, PricedShoppingListEntry } from '../../types/cateringPlan';
import type { GatheringResult } from '../../types/gathering';
import type { Language, Strings } from './strings';

interface CateringPlanViewProps {
  t: Strings;
  language: Language;
  result: GatheringResult;
  plan: PricedCateringPlan | null;
  isPlanning: boolean;
  streamedText: string;
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

function formatQuantity(entry: PricedShoppingListEntry, t: Strings, language: Language): string {
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
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Shopping list grouped by category, in the order the categories first appear. */
function groupByCategory(entries: PricedShoppingListEntry[], fallback: string) {
  const groups = new Map<string, PricedShoppingListEntry[]>();
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
  streamedText,
  usedRecipes,
  usedLocalPlan,
  error,
  onRetry,
  onOpenRecipes,
  onBack,
  onRestart,
}: CateringPlanViewProps) {
  const groups = plan ? groupByCategory(plan.shoppingList, t.uncategorised) : [];
  const withinBudget = plan ? plan.pricing.estimatedTotal <= result.budget.amount : false;

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
          {t.planTitle}
        </Typography.Heading>
        <Typography.Paragraph className="text-sm text-neutral-600">
          {t.planSubtitle(result.participantCount)}
        </Typography.Paragraph>
        {usedRecipes > 0 ? (
          <Chip variant="soft" className="w-fit bg-neutral-200 text-neutral-800 text-xs font-semibold rounded">
            <Chip.Label>{`${t.recipeFromRecipes}: ${t.recipeSelected(usedRecipes)}`}</Chip.Label>
          </Chip>
        ) : null}
      </div>

      {usedLocalPlan ? (
        <Alert status="warning" className="border-amber-200 bg-amber-50 text-amber-900 rounded-lg">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t.planLocalNotice}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      {isPlanning ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center bg-white border border-neutral-200 rounded-lg shadow-xs">
          <Spinner />
          <span className="text-sm font-bold text-neutral-900">{t.planning}</span>
          <span className="text-xs text-neutral-500">{t.planningHint}</span>
          {streamedText ? (
            <pre className="max-h-32 w-full overflow-auto text-left text-[11px] text-neutral-600 bg-neutral-50 p-2 rounded border border-neutral-200">
              {streamedText}
            </pre>
          ) : null}
        </Card>
      ) : null}

      {error && !isPlanning ? (
        <div className="flex flex-col gap-3">
          <Alert status="danger" className="border-red-200 bg-red-50 text-red-900 rounded-lg">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{t.planError}</Alert.Description>
            </Alert.Content>
          </Alert>
          <Button
            fullWidth
            onPress={onRetry}
            className="bg-primary text-white hover:bg-primary/90 rounded px-4 py-2 text-sm font-semibold"
          >
            {t.retry}
          </Button>
        </div>
      ) : null}

      {plan ? (
        <>
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <Typography.Heading level={2} className="text-base font-bold text-neutral-900">
                {t.menuSection}
              </Typography.Heading>
              <span className="text-xs font-semibold text-neutral-500">{t.itemCount(plan.menu.items.length)}</span>
            </div>
            <Card className="gap-0 overflow-hidden p-0 bg-white border border-neutral-200 rounded-lg shadow-xs divide-y divide-neutral-100">
              {plan.menu.name ? (
                <div className="bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-900 border-b border-neutral-200">
                  {plan.menu.name}
                </div>
              ) : null}
              <ul>
                {plan.menu.items.map((item, index) => (
                  <li
                    key={`${item.name}-${index}`}
                    className="flex gap-3 px-4 py-3.5 hover:bg-neutral-50 transition-colors border-b border-neutral-100 last:border-b-0"
                  >
                    <span className="w-5 shrink-0 text-xs font-bold text-primary tabular-nums pt-0.5">
                      {index + 1}.
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-neutral-900">{item.name}</span>
                      {item.description ? (
                        <span className="block text-xs text-neutral-600 mt-0.5">{item.description}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <Typography.Heading level={2} className="text-base font-bold text-neutral-900">
                {t.shoppingSection}
              </Typography.Heading>
              <span className="text-xs font-semibold text-neutral-500">{t.itemCount(plan.shoppingList.length)}</span>
            </div>
            <Card className="gap-0 overflow-hidden p-0 bg-white border border-neutral-200 rounded-lg shadow-xs divide-y divide-neutral-200">
              {groups.map(([category, entries]) => (
                <div key={category}>
                  <div className="border-b border-neutral-200 bg-neutral-100 px-4 py-2 text-xs font-bold uppercase tracking-wider text-neutral-700">
                    {category}
                  </div>
                  <ul className="divide-y divide-neutral-100">
                    {entries.map((entry, index) => (
                      <li
                        key={`${entry.ingredient}-${index}`}
                        className="flex items-start gap-4 px-4 py-3.5 hover:bg-neutral-50 transition-colors"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-neutral-900">{entry.ingredient}</span>
                          <span className="block text-xs text-neutral-600 mt-0.5">
                            {formatQuantity(entry, t, language)}
                            {entry.productName ? ` · ${entry.productName}` : ''}
                          </span>
                          {entry.productUrl ? (
                            <a
                              className="inline-flex items-center gap-1 text-xs text-primary font-semibold hover:underline mt-1"
                              href={entry.productUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t.openProdega}
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                            </a>
                          ) : (
                            <span className="block text-xs text-neutral-400 mt-1">{t.priceNotFound}</span>
                          )}
                          {entry.pricingStatus === 'quantity_unknown' && entry.pricingMessage ? (
                            <span className="block text-xs text-amber-600 font-medium mt-0.5">{entry.pricingMessage}</span>
                          ) : null}
                        </span>
                        {entry.unitPriceChf !== null ? (
                          <span className="shrink-0 text-right">
                            {/* Prodega style price badge */}
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-primary text-white font-bold text-sm tracking-tight shadow-xs">
                              {formatMoney(entry.unitPriceChf, 'CHF', language)}
                            </span>
                            <span className="block text-xs text-neutral-500 mt-1">
                              {entry.packageQuantity ? `${t.packSize}: ${entry.packageQuantity}` : ''}
                            </span>
                            {entry.packagePriceChf !== null && entry.packagesNeeded !== null ? (
                              <span className="block text-xs text-neutral-500 tabular-nums">
                                {entry.packagesNeeded} {t.packs} × {formatMoney(entry.packagePriceChf, 'CHF', language)}
                              </span>
                            ) : null}
                            {entry.estimatedTotalChf !== null ? (
                              <span className="block text-xs font-semibold text-neutral-900 mt-0.5 tabular-nums">
                                {t.positionTotal}: {formatMoney(entry.estimatedTotalChf, 'CHF', language)}
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Card>
          </section>

          <section className="flex flex-col gap-2">
            <Typography.Heading level={2} className="text-base font-bold text-neutral-900">
              {t.budgetSection}
            </Typography.Heading>
            <Card className="flex flex-col gap-3 p-5 bg-white border border-neutral-200 rounded-lg shadow-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-neutral-600">{t.estimatedTotal}</span>
                <span className="text-2xl font-bold text-primary tabular-nums">
                  {formatMoney(plan.pricing.estimatedTotal, plan.pricing.currency, language)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold ${
                  withinBudget ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {`${t.labelBudget}: ${formatMoney(result.budget.amount, result.budget.currency, language)}`}
                </span>
              </div>
              {!plan.pricing.isComplete ? (
                <Typography.Paragraph className="text-xs text-neutral-500 italic">
                  {t.incompletePricing}
                </Typography.Paragraph>
              ) : null}
            </Card>
          </section>
        </>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-200">
        <Button
          variant="outline"
          onPress={onBack}
          className="border-neutral-300 text-neutral-800 hover:border-primary hover:text-primary rounded text-xs font-medium"
        >
          {t.backToBrief}
        </Button>
        <Button
          variant="outline"
          onPress={onOpenRecipes}
          className="border-neutral-300 text-neutral-800 hover:border-primary hover:text-primary rounded text-xs font-medium"
        >
          {t.recipeOpen}
        </Button>
        <Button
          variant="ghost"
          className="text-neutral-500 hover:text-neutral-800 p-0 text-xs font-medium"
          onPress={onRestart}
        >
          {t.restart}
        </Button>
      </div>
    </div>
  );
}
