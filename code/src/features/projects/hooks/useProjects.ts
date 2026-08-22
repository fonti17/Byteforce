import { useCallback, useEffect, useState } from 'react';
import { projectStore } from '../projectStore';
import type { ProjectLibraryFile, StoredProject } from '../types';

function isStoredProject(value: unknown): value is StoredProject {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const plan = record.plan as Record<string, unknown> | undefined;
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.gatheringResult === 'object' &&
    Array.isArray(plan?.shoppingList)
  );
}

export function useProjects() {
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;
    void projectStore.list().then((stored) => {
      if (isActive) {
        setProjects(stored);
        setIsLoading(false);
      }
    });
    return () => {
      isActive = false;
    };
  }, []);

  const saveProject = useCallback(
    async (
      payload: Omit<StoredProject, 'id' | 'createdAt' | 'updatedAt'>,
      existingId?: string
    ): Promise<StoredProject> => {
      const now = new Date().toISOString();
      const existing = existingId ? projects.find((p) => p.id === existingId) : undefined;
      const record: StoredProject = {
        ...payload,
        id: existing?.id ?? existingId ?? crypto.randomUUID(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      await projectStore.put(record);
      setProjects((current) => [record, ...current.filter((p) => p.id !== record.id)]);
      return record;
    },
    [projects]
  );

  const removeProject = useCallback(async (id: string): Promise<void> => {
    await projectStore.remove(id);
    setProjects((current) => current.filter((p) => p.id !== id));
  }, []);

  const getProject = useCallback(
    (id: string): StoredProject | null => {
      return projects.find((p) => p.id === id) ?? null;
    },
    [projects]
  );

  const exportLibrary = useCallback((): ProjectLibraryFile => {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      projects,
    };
  }, [projects]);

  const importLibrary = useCallback(
    async (raw: string): Promise<number> => {
      const parsed: unknown = JSON.parse(raw);
      const candidates = Array.isArray(parsed)
        ? parsed
        : ((parsed as ProjectLibraryFile | null)?.projects ?? []);
      const valid = candidates.filter(isStoredProject);

      if (valid.length === 0) {
        throw new Error('No valid projects found in file');
      }

      setProjects((current) => {
        const byId = new Map(current.map((entry) => [entry.id, entry]));
        for (const entry of valid) byId.set(entry.id, entry);
        const merged = [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        void projectStore.replaceAll(merged);
        return merged;
      });
      return valid.length;
    },
    []
  );

  return {
    projects,
    isLoading,
    saveProject,
    removeProject,
    getProject,
    exportLibrary,
    importLibrary,
  };
}
