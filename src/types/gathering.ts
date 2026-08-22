import type { LLMMessage, LLMRequestOptions, LLMResponse } from './llm';

export type EventType = 'private' | 'business' | 'team_event' | 'other';
export type MealType = 'breakfast' | 'lunch' | 'dinner' |'apero'|'buffet'| 'other';

export interface GatheringData {
  eventType: EventType | null;
  date: {
    day: number | null;
    month: number | null;
    year: number | null;
  };
  participantCount: number | null;
  meal: MealType | null;
  budget: {
    amount: number | null;
    currency: string | null;
  };
  /** Free-form preferences and constraints that do not fit the fixed fields. */
  context: string | null;
}

export type GatheringField =
  | 'eventType'
  | 'date.day'
  | 'date.month'
  | 'date.year'
  | 'participantCount'
  | 'meal'
  | 'context'
  | 'budget.amount'
  | 'budget.currency';

export type GatheringStatus = 'incomplete' | 'complete';
export type GatheringUpdates = Partial<Record<GatheringField, unknown>>;

export interface GatheringState {
  data: GatheringData;
  messages: LLMMessage[];
  originalRequest: string | null;
  /** Field addressed by the most recent backend-generated question. */
  expectedField: GatheringField | null;
}

export interface GatheringUncertainty {
  field?: GatheringField;
  reason: string;
}

export interface GatheringTurn extends GatheringState {
  status: GatheringStatus;
  updates: GatheringUpdates;
  missingRequiredFields: GatheringField[];
  nextQuestion: string | null;
  uncertain: GatheringUncertainty[];
  response: LLMResponse;
}

export interface GatheringOptions extends LLMRequestOptions {
  language?: 'de' | 'en';
}

/**
 * Schema-shaped payload produced once every required field is present.
 * Mirrors `config/gatheringConfig.json` exactly, including `additionalProperties: false`.
 */
export interface GatheringResult {
  eventType: EventType;
  date: {
    day: number | null;
    month: number | null;
    year: number | null;
  };
  participantCount: number;
  meal: MealType;
  budget: {
    amount: number;
    currency: string;
  };
  context: string | null;
}
