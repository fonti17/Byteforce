import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isExemptFromMealDb,
  MealDbService,
  mealDbToRecipe,
  parseMealDbInstructions,
  parseMealDbMeasure,
} from '../src/features/recipes/mealDbService.ts';
import {
  mergeShoppingList,
  normalizeUnit,
  recipeService,
  scaleRecipe,
} from '../src/features/recipes/recipeService.ts';
import {
  cateringPlanService,
  parseCateringPlan,
} from '../src/features/catering-plan/cateringPlanService.ts';
import {
  extractJsonArray,
  translationService,
  TranslationService,
} from '../src/features/pricing/transgourmet/translationService.ts';

// Mock meal object from TheMealDB API
const MOCK_MEAL_ARRABIATA = {
  idMeal: '52771',
  strMeal: 'Spicy Arrabiata Penne',
  strCategory: 'Vegetarian',
  strArea: 'Italian',
  strInstructions:
    'Bring a large pot of water to a boil. Add salt and penne.\n\nMeanwhile, heat olive oil in a pan. Add garlic and red chili flakes.\n\nAdd chopped tomatoes and simmer for 15 minutes. Combine pasta with sauce and serve.',
  strMealThumb: 'https://www.themealdb.com/images/media/meals/ustsqw1468250014.jpg',
  strIngredient1: 'penne rigate',
  strIngredient2: 'olive oil',
  strIngredient3: 'garlic',
  strIngredient4: 'chopped tomatoes',
  strIngredient5: 'red chili flakes',
  strIngredient6: 'italian seasoning',
  strIngredient7: 'basil',
  strIngredient8: 'Parmigiano-Reggiano',
  strIngredient9: '',
  strIngredient10: '',
  strMeasure1: '1 pound',
  strMeasure2: '1/4 cup',
  strMeasure3: '3 cloves',
  strMeasure4: '1 tin',
  strMeasure5: '1/2 teaspoon',
  strMeasure6: '1/2 teaspoon',
  strMeasure7: '6 leaves',
  strMeasure8: 'sprinkling',
  strMeasure9: '',
  strMeasure10: '',
};

const MOCK_MEAL_TIRAMISU = {
  idMeal: '52900',
  strMeal: 'Classic Tiramisu',
  strCategory: 'Dessert',
  strArea: 'Italian',
  strInstructions: '1. Whisk mascarpone and sugar.\n2. Dip savoiardi in coffee.\n3. Layer and chill.',
  strMealThumb: 'https://www.themealdb.com/images/media/meals/tiramisu.jpg',
  strIngredient1: 'Mascarpone',
  strIngredient2: 'Savoiardi',
  strIngredient3: 'Coffee',
  strIngredient4: '',
  strMeasure1: '500g',
  strMeasure2: '200g',
  strMeasure3: '1 cup',
  strMeasure4: '',
};

test('Requirement R1 - parseMealDbMeasure handles various measurement formats', () => {
  assert.deepEqual(parseMealDbMeasure('500g'), { quantity: 500, unit: 'g' });
  assert.deepEqual(parseMealDbMeasure('1.5 kg'), { quantity: 1.5, unit: 'kg' });
  assert.deepEqual(parseMealDbMeasure('250 ml'), { quantity: 250, unit: 'ml' });
  assert.deepEqual(parseMealDbMeasure('1 l'), { quantity: 1, unit: 'l' });
  assert.deepEqual(parseMealDbMeasure('3 tbsp'), { quantity: 45, unit: 'ml' });
  assert.deepEqual(parseMealDbMeasure('2 tsp'), { quantity: 10, unit: 'ml' });
  assert.deepEqual(parseMealDbMeasure('1/2 cup'), { quantity: 125, unit: 'ml' });
  assert.deepEqual(parseMealDbMeasure('1 1/2 cup'), { quantity: 375, unit: 'ml' });
  assert.deepEqual(parseMealDbMeasure('½ tsp'), { quantity: 2.5, unit: 'ml' });
  assert.deepEqual(parseMealDbMeasure('3 cloves'), { quantity: 3, unit: 'piece' });
  assert.deepEqual(parseMealDbMeasure('2 tins'), { quantity: 2, unit: 'pack' });
  assert.deepEqual(parseMealDbMeasure('to taste'), { quantity: 1, unit: 'piece' });
  assert.deepEqual(parseMealDbMeasure(''), { quantity: 1, unit: 'piece' });
  assert.deepEqual(parseMealDbMeasure(null), { quantity: 1, unit: 'piece' });
});

test('Requirement R1 - parseMealDbInstructions parses paragraphs and numbered steps', () => {
  const paragraphs = parseMealDbInstructions(MOCK_MEAL_ARRABIATA.strInstructions);
  assert.equal(paragraphs.length, 3);
  assert.ok(paragraphs[0].includes('Bring a large pot'));
  assert.ok(paragraphs[1].includes('Meanwhile, heat'));
  assert.ok(paragraphs[2].includes('Add chopped tomatoes'));

  const numbered = parseMealDbInstructions(MOCK_MEAL_TIRAMISU.strInstructions);
  assert.equal(numbered.length, 3);
  assert.equal(numbered[0], 'Whisk mascarpone and sugar.');
  assert.equal(numbered[1], 'Dip savoiardi in coffee.');
  assert.equal(numbered[2], 'Layer and chill.');
});

test('Requirement R1 - mealDbToRecipe hydrates Recipe strictly from TheMealDB data', () => {
  const recipe = mealDbToRecipe(MOCK_MEAL_ARRABIATA);
  assert.equal(recipe.name, 'Spicy Arrabiata Penne');
  assert.equal(recipe.servings, 4);
  assert.equal(recipe.course, 'main');
  assert.ok(recipe.diet.includes('vegetarian'));
  assert.equal(recipe.ingredients.length, 8);
  assert.equal(recipe.steps.length, 3);
  assert.equal(recipe.source, 'TheMealDB (52771)');

  const tiramisu = mealDbToRecipe(MOCK_MEAL_TIRAMISU);
  assert.equal(tiramisu.course, 'dessert');
  assert.ok(tiramisu.diet.includes('vegetarian'));
  assert.equal(tiramisu.ingredients.length, 3);
  assert.equal(tiramisu.steps.length, 3);
});

test('Requirement R3 - isExemptFromMealDb identifies beverages and sauces', () => {
  assert.equal(isExemptFromMealDb('Chianti Classico Red Wine'), true);
  assert.equal(isExemptFromMealDb('Mineralwasser mit Kohlensäure'), true);
  assert.equal(isExemptFromMealDb('Champagne Brut'), true);
  assert.equal(isExemptFromMealDb('Garlic Dip'), true);
  assert.equal(isExemptFromMealDb('Herb Butter'), true);
  assert.equal(isExemptFromMealDb('Apfelsaft'), true);

  assert.equal(isExemptFromMealDb('Spicy Arrabiata Penne'), false);
  assert.equal(isExemptFromMealDb('Beef Sunday Roast'), false);
  assert.equal(isExemptFromMealDb('Chocolate Cake'), false);
});

test('Requirement R2 - findMatchingMeal matching and cleaning strategy', async () => {
  const testMealDb = new MealDbService();

  testMealDb.searchByName = async (query) => {
    if (query.toLowerCase() === 'arrabiata') {
      return [MOCK_MEAL_ARRABIATA];
    }
    if (query.toLowerCase() === 'tiramisu') {
      return [MOCK_MEAL_TIRAMISU];
    }
    return [];
  };

  const match1 = await testMealDb.findMatchingMeal('Spicy Arrabiata Penne');
  assert.ok(match1);
  assert.equal(match1.idMeal, '52771');

  const match2 = await testMealDb.findMatchingMeal('Homemade Tiramisu Dessert');
  assert.ok(match2);
  assert.equal(match2.idMeal, '52900');
});

test('Requirement R2 & R3 - resolveMealRecipe resolution and retry pipeline', async () => {
  const testMealDb = new MealDbService();

  testMealDb.searchByName = async (query) => {
    if (query.toLowerCase().includes('arrabiata')) {
      return [MOCK_MEAL_ARRABIATA];
    }
    return [];
  };

  const resolved = await testMealDb.resolveMealRecipe({
    name: 'Spicy Arrabiata Penne with fresh herbs',
    description: 'Delicious pasta',
  });
  assert.ok(resolved);
  assert.equal(resolved.name, 'Spicy Arrabiata Penne');
  assert.equal(resolved.ingredients.length, 8);

  const exempt = await testMealDb.resolveMealRecipe({
    name: 'Mineral Water Still 1L',
    description: 'Refreshing water',
  });
  assert.equal(exempt, null);
});

test('Requirement R1 & R4 - Recipe scaling and shopping list aggregation for catering', () => {
  const recipe = mealDbToRecipe(MOCK_MEAL_ARRABIATA); // 4 servings
  const scaled = scaleRecipe(recipe, 80); // 80 participants => 20x scaling

  assert.equal(scaled.servings, 80);

  const penne = scaled.ingredients.find((i) => i.ingredient === 'penne rigate');
  assert.ok(penne);
  assert.equal(penne.quantity, 20);
  assert.equal(penne.unit, 'pack');

  const shoppingList = mergeShoppingList([
    scaled.ingredients,
    [
      { ingredient: 'penne rigate', quantity: 5, unit: 'pack', category: 'pasta' },
      { ingredient: 'parmigiano-reggiano', quantity: 2, unit: 'pack', category: 'dairy' },
    ],
  ]);

  const penneTotal = shoppingList.find((i) => i.ingredient === 'penne rigate');
  assert.ok(penneTotal);
  assert.equal(penneTotal.quantity, 25);
  assert.equal(penneTotal.unit, 'pack');
});

test('Requirement R2 & R4 - Automatic Retry and Category Fallback in TheMealDB', async () => {
  const testMealDb = new MealDbService();

  testMealDb.searchByName = async () => [];
  testMealDb.filterByCategory = async (cat) => {
    if (cat === 'Dessert') {
      return [{ strMeal: 'Classic Tiramisu', strMealThumb: '', idMeal: '52900' }];
    }
    return [];
  };
  testMealDb.lookupById = async (id) => {
    if (id === '52900') return MOCK_MEAL_TIRAMISU;
    return null;
  };

  const result = await testMealDb.findMatchingMeal('Unknown Special Sweet', {
    course: 'dessert',
  });
  assert.ok(result);
  assert.equal(result.idMeal, '52900');
  assert.equal(result.strMeal, 'Classic Tiramisu');
});

test('Requirement R1 & R2 - parseCateringPlan validation and extraction', () => {
  const validJson = JSON.stringify({
    menu: {
      name: 'Italian Feast',
      items: [
        { name: 'Spicy Arrabiata Penne', description: 'Classic pasta with spicy tomato sauce' },
        { name: 'Chianti Wine', description: 'Red wine' },
        { name: 'Garlic Butter Sauce', description: 'Rich dip' },
      ],
    },
    shoppingList: [
      { ingredient: 'penne rigate', quantity: 500, unit: 'g', category: 'pasta' },
      { ingredient: 'garlic', quantity: 2, unit: 'piece', category: 'vegetables' },
    ],
  });

  const parsed = parseCateringPlan(validJson);
  assert.equal(parsed.menu.name, 'Italian Feast');
  assert.equal(parsed.menu.items.length, 3);
  assert.equal(parsed.shoppingList.length, 2);
});

test('Translation Layer - extractJsonArray parses array responses cleanly', () => {
  const directArray = '["Pouletbrust", "Vollrahm", "Olivenöl"]';
  assert.deepEqual(extractJsonArray(directArray), ['Pouletbrust', 'Vollrahm', 'Olivenöl']);

  const fencedArray = '```json\n["Gehackte Tomaten", "Zwiebeln", "Knoblauch"]\n```';
  assert.deepEqual(extractJsonArray(fencedArray), ['Gehackte Tomaten', 'Zwiebeln', 'Knoblauch']);

  const arrayWithProse = 'Here is the translated list:\n["Peperoni", "Zucchetti"]\nHope this helps!';
  assert.deepEqual(extractJsonArray(arrayWithProse), ['Peperoni', 'Zucchetti']);

  const invalid = '{"not": "an array"}';
  assert.equal(extractJsonArray(invalid), null);
});

test('Translation Layer - translateIngredientsToGerman handles empty, cached, and fallback cases', async () => {
  const service = new TranslationService();

  // Empty array
  const empty = await service.translateIngredientsToGerman([]);
  assert.deepEqual(empty, []);

  // Empty strings
  const emptyStrings = await service.translateIngredientsToGerman(['', '   ']);
  assert.deepEqual(emptyStrings, ['', '']);
});
