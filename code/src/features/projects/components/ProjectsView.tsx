import { useRef, useState } from 'react';
import {
  Alert,
  AlertDialog,
  Button,
  Card,
  Chip,
  IconChevronLeft,
  IconChevronRight,
  Typography,
} from '@heroui/react';
import type { ProjectLibraryFile, StoredProject } from '../types';
import type { Language, Strings } from '@/shared/i18n/strings';

interface ProjectsViewProps {
  t: Strings;
  language: Language;
  projects: StoredProject[];
  onOpenProject: (project: StoredProject) => void;
  onDeleteProject: (id: string) => Promise<void>;
  onExport: () => ProjectLibraryFile;
  onImportLibrary: (raw: string) => Promise<number>;
  onBack: () => void;
}

function localeOf(language: Language): string {
  return language === 'de' ? 'de-CH' : 'en-GB';
}

function formatMoney(amount: number, currency: string, language: Language): string {
  return new Intl.NumberFormat(localeOf(language), {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(isoString: string, language: Language): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat(localeOf(language), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return isoString;
  }
}

export function ProjectsView({
  t,
  language,
  projects,
  onOpenProject,
  onDeleteProject,
  onExport,
  onImportLibrary,
  onBack,
}: ProjectsViewProps) {
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<StoredProject | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportProjects = () => {
    const file = onExport();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'catering-projects.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    setNotice(null);
    try {
      const count = await onImportLibrary(await file.text());
      setNotice({ text: t.projectImported(count), isError: false });
    } catch {
      setNotice({ text: t.projectImportError, isError: true });
    }
  };

  const handleDelete = () => {
    if (!projectToDelete) return;
    const id = projectToDelete.id;
    setIsConfirmingDelete(false);
    setProjectToDelete(null);
    void onDeleteProject(id);
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
        <div className="flex items-center justify-between gap-4">
          <div>
            <Typography.Heading level={1} className="text-2xl font-bold tracking-tight text-neutral-900">
              {t.projectsTitle}
            </Typography.Heading>
            <Typography.Paragraph className="text-sm text-neutral-600">
              {t.projectsSubtitle}
            </Typography.Paragraph>
          </div>
          <span className="text-xs font-semibold text-neutral-500 shrink-0">
            {t.savedProjectsCount(projects.length)}
          </span>
        </div>
      </div>

      {notice ? (
        <Alert
          status={notice.isError ? 'danger' : 'success'}
          className={`rounded-lg ${
            notice.isError
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{notice.text}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      {projects.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-8 text-center bg-white border border-neutral-200 rounded-lg shadow-xs gap-3">
          <Typography.Heading level={3} className="text-base font-bold text-neutral-900">
            {t.projectsEmpty}
          </Typography.Heading>
          <Typography.Paragraph className="text-sm text-neutral-500 max-w-md">
            {t.projectsEmptyHint}
          </Typography.Paragraph>
          <Button
            size="sm"
            onPress={onBack}
            className="mt-2 bg-primary text-white hover:bg-primary/90 rounded px-4 py-2 text-sm font-medium"
          >
            {t.toResult}
          </Button>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {projects.map((project) => {
            const rawCost = project.plan.pricing.estimatedTotal ?? 0;
            const margin = project.targetMargin ?? 0;
            const total = rawCost + margin;
            const itemsCount = project.plan.menu.items.length;
            const shoppingCount = project.plan.shoppingList.length;

            return (
              <Card
                key={project.id}
                className="overflow-hidden bg-white border border-neutral-200 rounded-lg shadow-xs hover:border-primary/50 transition-all p-5 flex flex-col gap-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Typography.Heading level={3} className="text-lg font-bold text-neutral-900 truncate">
                        {project.name}
                      </Typography.Heading>
                      <Chip
                        variant="soft"
                        className={`text-xs font-semibold rounded ${
                          project.plannerMode === 'business'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-neutral-100 text-neutral-800'
                        }`}
                      >
                        <Chip.Label>
                          {project.plannerMode === 'business' ? t.modeBusiness : t.modePrivate}
                        </Chip.Label>
                      </Chip>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                      <span>{t.projectSavedAt(formatDate(project.updatedAt, language))}</span>
                      <span>•</span>
                      <span>{t.planSubtitle(project.gatheringResult.participantCount)}</span>
                      {project.gatheringResult.date.day && project.gatheringResult.date.month ? (
                        <>
                          <span>•</span>
                          <span>
                            {`${project.gatheringResult.date.day}.${project.gatheringResult.date.month}.${project.gatheringResult.date.year ?? ''}`}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="text-left sm:text-right shrink-0">
                    <div className="text-lg font-bold text-primary tabular-nums">
                      {formatMoney(total, project.plan.pricing.currency, language)}
                    </div>
                    {margin > 0 ? (
                      <div className="text-xs text-emerald-700 font-semibold">
                        {`+ ${formatMoney(margin, project.plan.pricing.currency, language)} ${t.marginLabel}`}
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Menu items preview */}
                <div className="bg-neutral-50 rounded-md p-3 border border-neutral-100 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-neutral-700 uppercase tracking-wider">
                    <span>{t.menuSection} ({t.projectCoursesCount(itemsCount)})</span>
                    <span>{t.projectShoppingItems(shoppingCount)}</span>
                  </div>
                  <div className="text-xs text-neutral-600 flex flex-wrap gap-x-2 gap-y-1">
                    {project.plan.menu.items.map((item, idx) => (
                      <span key={`${item.name}-${idx}`} className="inline-flex items-center">
                        <span className="font-medium text-neutral-900">{item.name}</span>
                        {idx < itemsCount - 1 ? <span className="text-neutral-400 ml-2">/</span> : null}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-neutral-100">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:underline hover:bg-transparent p-0 text-xs font-medium"
                    onPress={() => {
                      setProjectToDelete(project);
                      setIsConfirmingDelete(true);
                    }}
                  >
                    {t.projectDelete}
                  </Button>

                  <Button
                    size="sm"
                    className="bg-primary text-white hover:bg-primary/90 rounded text-xs font-semibold px-4 py-1.5 flex items-center gap-1 shadow-xs"
                    onPress={() => onOpenProject(project)}
                  >
                    {t.projectOpen}
                    <IconChevronRight className="size-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Alert Dialog (matches RecipeDetailView) */}
      <AlertDialog isOpen={isConfirmingDelete} onOpenChange={setIsConfirmingDelete}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>{t.projectDeleteTitle}</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <Typography.Paragraph className="text-muted text-sm">
                  {t.projectDeleteBody(projectToDelete?.name ?? '')}
                </Typography.Paragraph>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button
                  variant="outline"
                  onPress={() => {
                    setIsConfirmingDelete(false);
                    setProjectToDelete(null);
                  }}
                >
                  {t.recipeCancel}
                </Button>
                <Button
                  variant="danger"
                  onPress={handleDelete}
                >
                  {t.projectDeleteConfirm}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>

      {/* Backup and Import Tools */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-200">
        <Button
          variant="outline"
          isDisabled={projects.length === 0}
          onPress={exportProjects}
          className="border-neutral-300 text-neutral-800 hover:border-primary hover:text-primary rounded text-xs font-medium"
        >
          {t.projectExport}
        </Button>
        <Button
          variant="outline"
          onPress={() => fileInputRef.current?.click()}
          className="border-neutral-300 text-neutral-800 hover:border-primary hover:text-primary rounded text-xs font-medium"
        >
          {t.projectImport}
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
