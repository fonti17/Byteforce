import type { LLMMessage, LLMRequestOptions, LLMResponse } from './llm';

export type EventType = 'private' | 'business' | 'team_event' | 'other';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'other';

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
}

export type GatheringField =
  | 'eventType'
  | 'date.day'
  | 'date.month'
  | 'date.year'
  | 'participantCount'
  | 'meal'
  | 'budget.amount'
  | 'budget.currency';

export type GatheringStatus = 'incomplete' | 'complete';
export type GatheringUpdates = Partial<Record<GatheringField, unknown>>;

export interface GatheringState {
  data: GatheringData;
  messages: LLMMessage[];
  /** Field addressed by the most recent backend-generated question. */
  expectedField: GatheringField | null;
}

export interface GatheringTurn extends GatheringState {
  status: GatheringStatus;
  updates: GatheringUpdates;
  missingRequiredFields: GatheringField[];
  nextQuestion: string | null;
  response: LLMResponse;
}

export interface GatheringOptions extends LLMRequestOptions {
  language?: 'de' | 'en';
}
