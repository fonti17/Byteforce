import { useEffect, useState } from 'react';
import { Button, Card, Chip, IconChevronLeft, SuccessIcon, Typography } from '@heroui/react';
import type { GatheringResult } from '../../types/gathering';
import type { Strings } from './strings';

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
        <Button variant="ghost" size="sm" className="-ml-3 w-fit text-muted" onPress={onBack}>
          <IconChevronLeft />
          {t.editAnswers}
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <Typography.Heading level={1} className="text-2xl font-bold tracking-tight">
            {t.resultTitle}
          </Typography.Heading>
          <Chip color="success" variant="soft">
            <SuccessIcon className="size-3.5" />
            <Chip.Label>{t.schemaValid}</Chip.Label>
          </Chip>
        </div>
        <Typography.Paragraph className="text-muted">{t.resultSubtitle}</Typography.Paragraph>
      </div>

      <Card className="overflow-hidden p-0">
        <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-foreground">
          {json}
        </pre>
      </Card>

      <Button fullWidth onPress={onContinue}>
        {isPlanning ? t.planning : t.toPlan}
      </Button>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onPress={() => void copy()}>
          {hasCopied ? t.copied : t.copy}
        </Button>
        <Button variant="outline" onPress={download}>
          {t.download}
        </Button>
        <Button variant="ghost" className="text-muted" onPress={onRestart}>
          {t.restart}
        </Button>
      </div>
    </div>
  );
}
