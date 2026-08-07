// @ts-check
export const TECHNICAL_STORY_EXAMPLE_KEY: string;
export interface TechnicalStoryRandomRecipe {
    selectedFamilies: string[];
    options: Record<string, any>;
}
export interface PresentationExampleSummary {
    key: string;
    title: string;
    profileId: string;
    description: string;
}
export function listPresentationExamples(): PresentationExampleSummary[];
export function getTechnicalStoryRandomRecipe(): TechnicalStoryRandomRecipe;
export function buildTechnicalStoryExample(options?: Record<string, any>): Record<string, any>;
export function createOrReplaceTechnicalStoryExample(options?: Record<string, any>): Record<string, any> & { id: string };
export function ensureTechnicalStoryExamplePresentation(options?: Record<string, any>): Record<string, any> & { id: string };
