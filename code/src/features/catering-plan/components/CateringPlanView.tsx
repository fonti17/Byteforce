import { Alert, Button, Card, Chip, IconChevronLeft, Spinner, Typography } from '@heroui/react';
import type { PricedCateringPlan, PricedShoppingListEntry, WasteRisk } from '../types';
import type { GatheringResult } from '@/features/gathering/types';
import type { Language, Strings } from '@/shared/i18n/strings';

interface CateringPlanViewProps {
  t: Strings;
  language: Language;
  result: GatheringResult;
  plan: PricedCateringPlan | null;
  isPlanning: boolean;
  streamedText: string;
  /** How many shopping list positions the model has priced so far. */
  pricingProgress?: { completed: number; total: number } | null;
  /** Number of recipes folded into this plan, shown as provenance. */
  usedRecipes: number;
  /** Target margin / earnings to add on top in business mode. */
  targetMargin?: number | null;
  /** Whether the user opted strictly for own recipes without new ideas. */
  onlyOwnRecipes?: boolean;
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

/** Colours the surplus by how likely it ends up in the bin. */
const WASTE_RISK_STYLE: Record<WasteRisk, string> = {
  none: 'bg-emerald-100 text-emerald-800',
  low: 'bg-emerald-100 text-emerald-800',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-red-100 text-red-800',
};

function formatAmount(quantity: number, unit: string, t: Strings, language: Language): string {
  const amount = new Intl.NumberFormat(localeOf(language), { maximumFractionDigits: 2 }).format(
    quantity
  );
  return `${amount} ${t.units[unit as keyof Strings['units']] ?? unit}`;
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
 * category, and the budget estimate from `cateringPlan.config.json`.
 */
export function CateringPlanView({
  t,
  language,
  result,
  plan,
  isPlanning,
  pricingProgress,
  usedRecipes,
  targetMargin,
  onlyOwnRecipes = false,
  usedLocalPlan,
  error,
  onRetry,
  onOpenRecipes,
  onBack,
  onRestart,
}: CateringPlanViewProps) {
  const groups = plan ? groupByCategory(plan.shoppingList, t.uncategorised) : [];
  const rawCost = plan?.pricing.estimatedTotal ?? 0;
  const marginAmount = typeof targetMargin === 'number' && targetMargin > 0 ? targetMargin : 0;
  const customerTotal = rawCost + marginAmount;

  const hasBudgetLimit = typeof result.budget.amount === 'number' && result.budget.amount > 0;
  const withinBudget = plan && hasBudgetLimit ? (marginAmount > 0 ? customerTotal <= result.budget.amount! : rawCost <= result.budget.amount!) : true;

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
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {usedRecipes > 0 ? (
            <Chip variant="soft" className="w-fit bg-neutral-200 text-neutral-800 text-xs font-semibold rounded">
              <Chip.Label>{`${t.recipeFromRecipes}: ${t.recipeSelected(usedRecipes)}`}</Chip.Label>
            </Chip>
          ) : null}
          {onlyOwnRecipes ? (
            <Chip variant="soft" className="w-fit bg-blue-100 text-blue-800 text-xs font-semibold rounded">
              <Chip.Label>{t.onlyOwnRecipesBadge}</Chip.Label>
            </Chip>
          ) : null}
        </div>
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
          <span className="text-xs text-neutral-500">
            {pricingProgress
              ? t.pricingProgress(pricingProgress.completed, pricingProgress.total)
              : t.planningHint}
          </span>
        </Card>
      ) : null}

      {error ? (
        <Alert status="danger" className="rounded-lg">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title className="font-semibold">{t.planError}</Alert.Title>
            <Alert.Description>{error.message}</Alert.Description>
          </Alert.Content>
          <Button
            size="sm"
            onPress={onRetry}
            className="mt-2 bg-red-600 text-white rounded text-xs font-medium"
          >
            {t.retry}
          </Button>
        </Alert>
      ) : null}

      {plan ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column on Desktop: Menu + Budget & Pricing Summary */}
          <div className="lg:col-span-5 flex flex-col gap-6 lg:sticky lg:top-20">
            <section className="flex flex-col gap-2">
              <Typography.Heading level={2} className="text-base font-bold text-neutral-900">
                {t.menuSection}
              </Typography.Heading>
              <Card className="flex flex-col gap-3 p-5 bg-white border border-neutral-200 rounded-lg shadow-xs">
                <Typography.Heading level={3} className="text-lg font-bold text-neutral-900">
                  {plan.menu.name || t.planTitle}
                </Typography.Heading>
                <ul className="divide-y divide-neutral-100">
                  {plan.menu.items.map((item, index) => (
                    <li key={`${item.name}-${index}`} className="py-2.5 first:pt-0 last:pb-0">
                      <span className="font-bold text-neutral-900 text-sm">{item.name}</span>
                      {item.description ? (
                        <p className="text-xs text-neutral-600 mt-0.5 leading-relaxed">
                          {item.description}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            </section>

            <section className="flex flex-col gap-2">
              <Typography.Heading level={2} className="text-base font-bold text-neutral-900">
                {t.budgetSection}
              </Typography.Heading>
              <Card className="flex flex-col gap-4 p-5 bg-white border border-neutral-200 rounded-lg shadow-xs">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-neutral-600">{t.estimatedTotal}</span>
                    <span className="text-lg font-bold text-neutral-900 tabular-nums">
                      {formatMoney(rawCost, plan.pricing.currency, language)}
                    </span>
                  </div>

                  {marginAmount > 0 ? (
                    <div className="flex items-center justify-between gap-3 text-sm text-neutral-600">
                      <span className="font-semibold">{t.marginLabel}</span>
                      <span className="font-bold text-emerald-700 tabular-nums">
                        + {formatMoney(marginAmount, plan.pricing.currency, language)}
                      </span>
                    </div>
                  ) : null}

                  {marginAmount > 0 ? (
                    <div className="pt-2 border-t border-neutral-100 flex items-center justify-between gap-3">
                      <span className="text-base font-bold text-neutral-900">{t.customerTotal}</span>
                      <span className="text-2xl font-bold text-primary tabular-nums">
                        {formatMoney(customerTotal, plan.pricing.currency, language)}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {plan.pricing.averageLeftoverShare !== null ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold bg-neutral-100 text-neutral-700">
                      {`${t.averageLeftover}: ${Math.round(plan.pricing.averageLeftoverShare * 100)}%`}
                    </span>
                  ) : null}
                  {hasBudgetLimit ? (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold ${
                      withinBudget ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {`${t.labelBudget}: ${formatMoney(result.budget.amount!, result.budget.currency, language)}`}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-600">
                      {t.noBudgetSpecified}
                    </span>
                  )}
                </div>

                {!plan.pricing.isComplete ? (
                  <Typography.Paragraph className="text-xs text-neutral-500 italic">
                    {t.incompletePricing}
                  </Typography.Paragraph>
                ) : null}
              </Card>
            </section>
          </div>

          {/* Right Column on Desktop: Full-width Shopping List */}
          <div className="lg:col-span-7 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <Typography.Heading level={2} className="text-base font-bold text-neutral-900">
                {t.shoppingSection}
              </Typography.Heading>
              <span className="text-xs font-semibold text-neutral-500">
                {t.itemCount(plan.shoppingList.length)}
              </span>
            </div>
            <Card className="gap-0 overflow-hidden p-0 bg-white border border-neutral-200 rounded-lg shadow-xs divide-y divide-neutral-200">
              {groups.map(([category, entries]) => (
                <div key={category}>
                  <div className="bg-neutral-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-neutral-600 border-b border-neutral-100">
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
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                            </a>
                          ) : (
                            <span className="block text-xs text-neutral-400 mt-1">{t.priceNotFound}</span>
                          )}
                          {entry.pricingStatus === 'quantity_unknown' && entry.pricingMessage ? (
                            <span className="block text-xs text-amber-600 font-medium mt-0.5">{entry.pricingMessage}</span>
                          ) : null}
                          {entry.wasteRisk !== null && entry.leftoverQuantity !== null ? (
                            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${WASTE_RISK_STYLE[entry.wasteRisk]}`}
                              >
                                {t.wasteRisk[entry.wasteRisk]}
                              </span>
                              <span className="text-xs text-neutral-500 tabular-nums">
                                {entry.leftoverQuantity > 0
                                  ? `${t.leftoverLabel}: ${formatAmount(entry.leftoverQuantity, entry.unit, t, language)}` +
                                    (entry.leftoverShare !== null
                                      ? ` (${Math.round(entry.leftoverShare * 100)}%)`
                                      : '')
                                  : t.noLeftover}
                              </span>
                            </span>
                          ) : null}
                          {entry.selectionReason ? (
                            <span className="block text-xs text-neutral-500 italic mt-0.5 leading-snug">
                              {entry.selectionReason}
                            </span>
                          ) : null}
                        </span>
                        {entry.unitPriceChf !== null ? (
                          <span className="shrink-0 text-right">
                            {entry.estimatedTotalChf !== null ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded bg-primary text-white font-bold text-sm tracking-tight shadow-xs">
                                {formatMoney(entry.estimatedTotalChf, 'CHF', language)}
                              </span>
                            ) : null}
                            <span className="block text-xs text-neutral-500 mt-1">
                              {entry.packageQuantity ? `${t.packSize}: ${entry.packageQuantity}` : ''}
                            </span>
                            {entry.packagePriceChf !== null && entry.packagesNeeded !== null ? (
                              <span className="block text-xs text-neutral-500 tabular-nums">
                                {entry.packagesNeeded} {t.packs} × {formatMoney(entry.packagePriceChf, 'CHF', language)}
                              </span>
                            ) : null}
                            <span className="block text-xs font-semibold text-neutral-900 mt-0.5 tabular-nums">
                              {formatMoney(entry.unitPriceChf, 'CHF', language)}
                              {entry.priceUnit ? (
                                  <span className="font-semibold opacity-80">{` / ${entry.priceUnit}`}</span>
                              ) : null}
                            </span>
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Card>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-200">
        <Button
          variant="outline"
          isDisabled={isPlanning}
          onPress={onBack}
          className="border-neutral-300 text-neutral-800 hover:border-primary hover:text-primary rounded text-xs font-medium"
        >
          {t.backToBrief}
        </Button>
        <Button
          variant="outline"
          isDisabled={isPlanning}
          onPress={onOpenRecipes}
          className="border-neutral-300 text-neutral-800 hover:border-primary hover:text-primary rounded text-xs font-medium"
        >
          {t.recipeOpen}
        </Button>
        <Button
          variant="outline"
          isDisabled={isPlanning}
          className="border-neutral-300 text-neutral-800 hover:border-primary hover:text-primary rounded text-xs font-medium"
          onPress={onRestart}>
          {t.restart}
        </Button>
      </div>
    </div>
  );
}
