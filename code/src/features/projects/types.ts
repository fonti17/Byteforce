import type { GatheringResult } from '@/features/gathering/types';
import type { PricedCateringPlan } from '@/features/catering-plan/types';

export interface StoredProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  gatheringResult: GatheringResult;
  originalRequest: string | null;
  plan: PricedCateringPlan;
  plannerMode: 'private' | 'business';
  targetMargin: number | null;
  onlyOwnRecipes: boolean;
  selectedRecipeIds: string[];
}

export interface ProjectLibraryFile {
  version: number;
  exportedAt: string;
  projects: StoredProject[];
}
