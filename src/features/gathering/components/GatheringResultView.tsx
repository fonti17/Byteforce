import { useEffect, useState } from 'react';
import { Button, Card, Chip, IconChevronLeft, SuccessIcon, Typography } from '@heroui/react';
import type { GatheringResult } from '../gathering';
import type { Strings } from '../../../shared/i18n/strings';

interface GatheringResultViewProps {
  t: Strings;
  result: GatheringResult;
  /** Part 2 already runs in the background, so the button only opens its view. */
  isPlanning: boolean;
  onContinue: () => void;
  onBack: () => void;
  onRestart: () => void;
}

/**
 * Final view — the payload handed to part 2, shaped exactly like
 * `config/gatheringConfig.json` describes it.
 */
export function GatheringResultView({
  t,
  result,
  isPlanning,
  onContinue,
  onBack,
  onRestart,
}: GatheringResultViewProps) {
  const json = JSON.stringify(result, null, 2);
  const [hasCopied, setHasCopied] = useState(false);

  useEffect(() => {
    if (!hasCopied) return;
    const timer = window.setTimeout(() => setHasCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [hasCopied]);

  const copy = async () => {
    await navigator.clipboard.writeText(json);
    setHasCopied(true);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'gathering.json';
    link.click();
    URL.revokeObjectURL(url);
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
          {t.editAnswers}
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <Typography.Heading level={1} className="text-2xl font-bold tracking-tight text-neutral-900">
            {t.resultTitle}
          </Typography.Heading>
          <Chip color="success" variant="soft" className="bg-emerald-100 text-emerald-800 font-semibold rounded text-xs">
            <SuccessIcon className="size-3.5 text-emerald-700" />
            <Chip.Label>{t.schemaValid}</Chip.Label>
          </Chip>
        </div>
        <Typography.Paragraph className="text-sm text-neutral-600">{t.resultSubtitle}</Typography.Paragraph>
      </div>

      <Card className="overflow-hidden p-0 bg-white border border-neutral-200 rounded-lg shadow-xs">
        <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-neutral-800 bg-neutral-50/50">
          {json}
        </pre>
      </Card>

      <Button
        fullWidth
        onPress={onContinue}
        className="bg-primary text-white hover:bg-primary/90 rounded px-4 py-3 text-base font-semibold transition-colors shadow-xs"
      >
        {isPlanning ? t.planning : t.toPlan}
      </Button>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onPress={() => void copy()}
          className="border-neutral-300 text-neutral-800 hover:border-primary hover:text-primary rounded text-xs font-medium"
        >
          {hasCopied ? t.copied : t.copy}
        </Button>
        <Button
          variant="outline"
          onPress={download}
          className="border-neutral-300 text-neutral-800 hover:border-primary hover:text-primary rounded text-xs font-medium"
        >
          {t.download}
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
