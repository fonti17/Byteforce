import cateringPlanConfig from '../../config/cateringPlanConfig.json';
import { llmService } from './llmService';
import type { GatheringData } from '../types/gathering';
import type { LLMRequestOptions, LLMResponse } from '../types/llm';

function buildSystemPrompt(): string {
  return [
    'You are a professional catering planner.',
    'The information-gathering phase is complete. Use the supplied state as authoritative.',
    '',
    'Your task:',
    '1. Choose one coherent menu suitable for the event type, date, meal, participant count, and budget.',
    '2. Derive all required ingredients from that menu.',
    '3. Calculate realistic total purchase quantities for the complete participant count.',
    '4. Keep the proposal within the stated budget.',
    '',
    'Return only one valid JSON object that conforms exactly to this JSON Schema:',
    JSON.stringify(cateringPlanConfig),
    '',
    'Write all human-readable values in German.',
    'Use numeric quantities and one of the units allowed by the schema.',
    'Do not wrap the JSON in markdown code fences.',
    '',
    'Do not ask further questions. Do not add venue, decoration, seating, transport, or activity planning.',
  ].join('\n');
}

export const cateringPlanService = {
  async create(
    gatheringState: GatheringData,
    options: LLMRequestOptions = {}
  ): Promise<LLMResponse> {
    return llmService.chat(
      [{
        role: 'user',
        content: [
          'Erstelle aus diesem abgeschlossenen Catering-State ein Menü und die Einkaufsliste:',
          JSON.stringify(gatheringState, null, 2),
        ].join('\n\n'),
      }],
      {
        ...options,
        model: options.model ?? 'apertus-70b',
        temperature: options.temperature ?? 0.2,
        maxTokens: options.maxTokens ?? 1800,
        systemPrompt: buildSystemPrompt(),
      }
    );
  },
};
