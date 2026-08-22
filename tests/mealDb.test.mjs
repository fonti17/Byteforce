import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isExemptFromMealDb,
  MealDbService,
  mealDbToRecipe,
  parseMealDbInstructions,
  parseMealDbMeasure,
} from '../src/services/mealDbService.ts';
import {
  mergeShoppingList,
  normalizeUnit,
  recipeService,
  scaleRecipe,
} from '../src/services/recipeService.ts';
import {
  cateringPlanService,
  parseCateringPlan,
} from '../src/services/cateringPlanService.ts';

// Mock meal object from TheMealDB API
const MOCK_MEAL_ARRABIATA = {
  idMeal: '52771',
  strMeal: 'Spicy Arrabiata Penne',
  strDrinkAlternate: null,
  strCategory: 'Pasta',
  strArea: 'Italian',
  strInstructions:
    'Bring a large pot of water to a boil. Add salt and cook penne according to package directions.\r\n\r\nHeat olive oil in a skillet over medium heat. Add garlic and chili flakes, sauté for 1 minute.\r\n\r\nStir in canned tomatoes and simmer for 15 minutes. Season with salt and pepper.\r\n\r\nToss cooked penne with sauce and fresh basil.',
  strMealThumb: 'https://www.themealdb.com/images/media/meals/ustsqw1468250014.jpg',
  strTags: 'Pasta,Curry,Vegetarian',
  strYoutube: 'https://www.youtube.com/watch?v=1IszT_guI08',
  strIngredient1: 'penne rigate',
  strIngredient2: 'olive oil',
  strIngredient3: 'garlic',
  strIngredient4: 'chopped tomatoes',
  strIngredient5: 'red chilli flakes',
  strIngredient6: 'italian seasoning',
  strIngredient7: 'basil',
  strIngredient8: 'salt',
  strIngredient9: '',
  strIngredient10: '',
  strMeasure1: '1 pound',
  strMeasure2: '2 tbsp',
  strMeasure3: '3 cloves',
  strMeasure4: '1 tin',
  strMeasure5: '1/2 tsp',
  strMeasure6: '1/2 tsp',
  strMeasure7: '6 leaves',
  strMeasure8: 'to taste',
  strMeasure9: '',
  strMeasure10: '',
  strSource: 'https://www.pasta.com/arrabiata',
};

const MOCK_MEAL_CHICKEN_CURRY = {
  idMeal: '52850',
  strMeal: 'Chicken Handi Curry',
  strCategory: 'Chicken',
  strArea: 'Indian',
  strInstructions:
    '1. Heat oil in a pan.\n2. Add chopped onions and sauté until golden.\n3. Add ginger garlic paste and chicken pieces.\n4. Stir in spices and yogurt.\n5. Cook covered on low heat for 25 minutes.',
  strMealThumb: 'https://www.themealdb.com/images/media/meals/curry.jpg',
  strTags: 'Meat,Spicy',
  strIngredient1: 'Chicken',
  strIngredient2: 'Onion',
  strIngredient3: 'Ginger Garlic Paste',
  strIngredient4: 'Yogurt',
  strIngredient5: 'Garam Masala',
  strMeasure1: '500g',
  strMeasure2: '2 medium',
  strMeasure3: '1 tbsp',
  strMeasure4: '1 cup',
  strMeasure5: '1 tsp',
  strSource: 'https://www.indiancooking.com/handi',
};

const MOCK_MEAL_TIRAMISU = {
  idMeal: '52900',
  strMeal: 'Classic Tiramisu',
  strCategory: 'Dessert',
  strArea: 'Italian',
  strInstructions:
    'Whisk egg yolks and sugar. Fold in mascarpone. Dip ladyfingers in espresso. Layer and dust with cocoa.',
  strMealThumb: 'https://www.themealdb.com/images/media/meals/tiramisu.jpg',
  strTags: 'Dessert,Sweet,Vegetarian',
  strIngredient1: 'Mascarpone',
  strIngredient2: 'Ladyfingers',
  strIngredient3: 'Espresso',
  strIngredient4: 'Cocoa Powder',
  strMeasure1: '500g',
  strMeasure2: '200g',
  strMeasure3: '250ml',
  strMeasure4: '2 tbsp',
  strSource: 'https://www.dessert.com/tiramisu',
};

test('Requirement R1 - parseMealDbMeasure handles various measurement formats', () => {
  // Volume fractions
  const cup34 = parseMealDbMeasure('3/4 cup');
  assert.equal(cup34.unit, 'ml');
  assert.equal(cup34.quantity, 188); // 0.75 * 250 = 187.5 -> 188

  const cup12 = parseMealDbMeasure('1/2 cup');
  assert.equal(cup12.unit, 'ml');
  assert.equal(cup12.quantity, 125);

  const mixedCup = parseMealDbMeasure('1 1/2 cups');
  assert.equal(mixedCup.unit, 'ml');
  assert.equal(mixedCup.quantity, 375); // 1.5 * 250 = 375

  const mixedCup2 = parseMealDbMeasure('2 1/4 cups');
  assert.equal(mixedCup2.unit, 'ml');
  assert.equal(mixedCup2.quantity, 563); // 2.25 * 250 = 562.5 -> 563

  // Spoons
  const tbsp = parseMealDbMeasure('2 tbsp');
  assert.equal(tbsp.unit, 'ml');
  assert.equal(tbsp.quantity, 30); // 2 * 15 = 30

  const tsp = parseMealDbMeasure('1 tsp');
  assert.equal(tsp.unit, 'ml');
  assert.equal(tsp.quantity, 5);

  const halfTsp = parseMealDbMeasure('1/2 tsp');
  assert.equal(halfTsp.unit, 'ml');
  assert.equal(halfTsp.quantity, 3); // 0.5 * 5 = 2.5 -> 3

  const eighthTsp = parseMealDbMeasure('1/8 tsp');
  assert.equal(eighthTsp.unit, 'ml');
  assert.equal(eighthTsp.quantity, 1);

  // Metric weights and volumes
  const grams = parseMealDbMeasure('200g');
  assert.equal(grams.unit, 'g');
  assert.equal(grams.quantity, 200);

  const kilo = parseMealDbMeasure('1.5 kg');
  assert.equal(kilo.unit, 'kg');
  assert.equal(kilo.quantity, 1.5);

  const ml = parseMealDbMeasure('500 ml');
  assert.equal(ml.unit, 'ml');
  assert.equal(ml.quantity, 500);

  // Imperial weights
  const oz = parseMealDbMeasure('8 oz');
  assert.equal(oz.unit, 'g');
  assert.equal(oz.quantity, 227); // 8 * 28.35 = 226.8 -> 227

  const lb = parseMealDbMeasure('1 pound');
  assert.equal(lb.unit, 'g');
  assert.equal(lb.quantity, 454); // 453.59 -> 454

  const lbs2 = parseMealDbMeasure('2 lbs');
  assert.equal(lbs2.unit, 'g');
  assert.equal(lbs2.quantity, 907);

  const lbs3 = parseMealDbMeasure('3 lbs');
  assert.equal(lbs3.unit, 'kg');
  assert.equal(lbs3.quantity, 1.36);

  const pint = parseMealDbMeasure('1 pint');
  assert.equal(pint.unit, 'ml');
  assert.equal(pint.quantity, 473);

  // Count items & packaging
  const cloves = parseMealDbMeasure('3 cloves');
  assert.equal(cloves.unit, 'piece');
  assert.equal(cloves.quantity, 3);

  const tin = parseMealDbMeasure('1 tin');
  assert.equal(tin.unit, 'pack');
  assert.equal(tin.quantity, 1);

  const can = parseMealDbMeasure('2 cans');
  assert.equal(can.unit, 'pack');
  assert.equal(can.quantity, 2);

  const juice = parseMealDbMeasure('juice of 2');
  assert.equal(juice.unit, 'piece');
  assert.equal(juice.quantity, 2);
  assert.equal(juice.note, 'juice');

  // Ranges & Unicode fractions
  const range = parseMealDbMeasure('1-2 tbsp');
  assert.equal(range.unit, 'ml');
  assert.equal(range.quantity, 30); // max(1, 2) * 15 = 30

  const unicodeHalf = parseMealDbMeasure('½ cup');
  assert.equal(unicodeHalf.unit, 'ml');
  assert.equal(unicodeHalf.quantity, 125);

  // Non-numeric qualifiers
  const taste = parseMealDbMeasure('to taste');
  assert.equal(taste.unit, 'piece');
  assert.equal(taste.quantity, 1);
  assert.equal(taste.note, 'to taste');

  const pinch = parseMealDbMeasure('Pinch');
  assert.equal(pinch.unit, 'piece');
  assert.equal(pinch.quantity, 1);
  assert.equal(pinch.note, 'pinch');

  const dash = parseMealDbMeasure('A dash');
  assert.equal(dash.unit, 'piece');
  assert.equal(dash.quantity, 1);
  assert.equal(dash.note, 'dash');

  const handful = parseMealDbMeasure('handful');
  assert.equal(handful.unit, 'piece');
  assert.equal(handful.quantity, 1);
  assert.equal(handful.note, 'handful');

  const empty = parseMealDbMeasure('');
  assert.equal(empty.unit, 'piece');
  assert.equal(empty.quantity, 1);
});

test('Requirement R1 - parseMealDbInstructions parses paragraphs and numbered steps', () => {
  const paragraphText =
    'Bring water to a boil.\r\n\r\nHeat olive oil in skillet.\r\n\r\nServe hot.';
  const pSteps = parseMealDbInstructions(paragraphText);
  assert.equal(pSteps.length, 3);
  assert.equal(pSteps[0], 'Bring water to a boil.');
  assert.equal(pSteps[1], 'Heat olive oil in skillet.');
  assert.equal(pSteps[2], 'Serve hot.');

  const numberedText =
    '1. Heat oil in a pan.\n2. Add chopped onions.\n3. Stir in spices.\n4. Cook covered for 25 minutes.';
  const nSteps = parseMealDbInstructions(numberedText);
  assert.equal(nSteps.length, 4);
  assert.equal(nSteps[0], 'Heat oil in a pan.');
  assert.equal(nSteps[1], 'Add chopped onions.');
  assert.equal(nSteps[2], 'Stir in spices.');
  assert.equal(nSteps[3], 'Cook covered for 25 minutes.');

  const stepFormatted =
    'STEP 1: Preheat oven.\nSTEP 2: Combine dry ingredients.\nSTEP 3: Bake for 30 minutes.';
  const sSteps = parseMealDbInstructions(stepFormatted);
  assert.equal(sSteps.length, 3);
  assert.equal(sSteps[0], 'Preheat oven.');
  assert.equal(sSteps[1], 'Combine dry ingredients.');
  assert.equal(sSteps[2], 'Bake for 30 minutes.');
});

test('Requirement R1 - mealDbToRecipe hydrates Recipe strictly from TheMealDB data', () => {
  const recipe = mealDbToRecipe(MOCK_MEAL_ARRABIATA);

  assert.equal(recipe.name, 'Spicy Arrabiata Penne');
  assert.equal(recipe.course, 'main');
  assert.ok(recipe.diet.includes('vegetarian'));
  assert.equal(recipe.servings, 4);
  assert.equal(recipe.source, 'https://www.pasta.com/arrabiata');

  // Exact ingredients count
  assert.equal(recipe.ingredients.length, 8);

  // Validate specific extracted ingredients and normalized units
  const penne = recipe.ingredients.find((i) => i.ingredient === 'penne rigate');
  assert.ok(penne);
  assert.equal(penne.quantity, 454);
  assert.equal(penne.unit, 'g');

  const oil = recipe.ingredients.find((i) => i.ingredient === 'olive oil');
  assert.ok(oil);
  assert.equal(oil.quantity, 30);
  assert.equal(oil.unit, 'ml');

  const garlic = recipe.ingredients.find((i) => i.ingredient === 'garlic');
  assert.ok(garlic);
  assert.equal(garlic.quantity, 3);
  assert.equal(garlic.unit, 'piece');

  const tomatoes = recipe.ingredients.find((i) => i.ingredient === 'chopped tomatoes');
  assert.ok(tomatoes);
  assert.equal(tomatoes.quantity, 1);
  assert.equal(tomatoes.unit, 'pack');

  assert.equal(recipe.steps.length, 4);
});

test('Requirement R3 - isExemptFromMealDb identifies beverages and sauces', () => {
  // Beverages
  assert.deepEqual(isExemptFromMealDb('Red Wine'), { isExempt: true, type: 'beverage' });
  assert.deepEqual(isExemptFromMealDb('Swiss Craft Beer'), { isExempt: true, type: 'beverage' });
  assert.deepEqual(isExemptFromMealDb('Mojito Cocktail'), { isExempt: true, type: 'beverage' });
  assert.deepEqual(isExemptFromMealDb('Fresh Lemonade'), { isExempt: true, type: 'beverage' });
  assert.deepEqual(isExemptFromMealDb('Espresso & Kaffee'), { isExempt: true, type: 'beverage' });
  assert.deepEqual(isExemptFromMealDb('Mineralwasser mit Gas'), { isExempt: true, type: 'beverage' });
  assert.deepEqual(isExemptFromMealDb({ name: 'House Punch', course: 'drink' }), {
    isExempt: true,
    type: 'beverage',
  });

  // Sauces & Condiments
  assert.deepEqual(isExemptFromMealDb('Creamy Tartar Sauce'), { isExempt: true, type: 'sauce' });
  assert.deepEqual(isExemptFromMealDb('French Salad Dressing'), { isExempt: true, type: 'sauce' });
  assert.deepEqual(isExemptFromMealDb('Kräuter-Vinaigrette'), { isExempt: true, type: 'sauce' });
  assert.deepEqual(isExemptFromMealDb('Garlic Aioli Dip'), { isExempt: true, type: 'sauce' });
  assert.deepEqual(isExemptFromMealDb('Homemade Gravy'), { isExempt: true, type: 'sauce' });
  assert.deepEqual(isExemptFromMealDb('Basil Pesto'), { isExempt: true, type: 'sauce' });
  assert.deepEqual(isExemptFromMealDb('Guacamole'), { isExempt: true, type: 'sauce' });
  assert.deepEqual(isExemptFromMealDb('Béarnaise Sauce'), { isExempt: true, type: 'sauce' });

  // Food / dishes (MUST NOT BE EXEMPT)
  assert.deepEqual(isExemptFromMealDb('Spaghetti Arrabiata'), { isExempt: false, type: null });
  assert.deepEqual(isExemptFromMealDb('Teriyaki Chicken Casserole'), { isExempt: false, type: null });
  assert.deepEqual(isExemptFromMealDb('Beef Bourguignon'), { isExempt: false, type: null });
  assert.deepEqual(isExemptFromMealDb('Lasagna Bolognese'), { isExempt: false, type: null });
  assert.deepEqual(isExemptFromMealDb('Tiramisu'), { isExempt: false, type: null });
  assert.deepEqual(isExemptFromMealDb('Kartoffelgratin'), { isExempt: false, type: null });
});

test('Requirement R2 - findMatchingMeal matching and cleaning strategy', async () => {
  const testMealDb = new MealDbService();

  testMealDb.searchByName = async (name) => {
    if (name.toLowerCase().includes('arrabiata')) return [MOCK_MEAL_ARRABIATA];
    if (name.toLowerCase().includes('curry') || name.toLowerCase().includes('chicken'))
      return [MOCK_MEAL_CHICKEN_CURRY];
    if (name.toLowerCase().includes('tiramisu')) return [MOCK_MEAL_TIRAMISU];
    return [];
  };

  const directMatch = await testMealDb.findMatchingMeal('Spicy Arrabiata Penne');
  assert.ok(directMatch);
  assert.equal(directMatch.idMeal, '52771');

  // Test German descriptor cleaning: "Klassisches Hühnercurry" -> finds "curry"
  const cleanedMatch = await testMealDb.findMatchingMeal('Klassisches Hühnercurry', {
    keywords: ['Chicken Curry'],
  });
  assert.ok(cleanedMatch);
  assert.equal(cleanedMatch.idMeal, '52850');

  // Test dessert matching
  const dessertMatch = await testMealDb.findMatchingMeal('Feines Tiramisu');
  assert.ok(dessertMatch);
  assert.equal(dessertMatch.idMeal, '52900');
});

test('Requirement R2 & R3 - resolveMealRecipe resolution and retry pipeline', async () => {
  // Test beverage direct AI bypass
  const beverageResult = await recipeService.resolveMealRecipe('Aperol Spritz', {
    course: 'drink',
    retryWithAi: false,
  });
  assert.equal(beverageResult.isFromMealDb, false);
  assert.ok(beverageResult.recipe);
  assert.equal(beverageResult.recipe.course, 'drink');

  // Test sauce direct AI bypass
  const sauceResult = await recipeService.resolveMealRecipe('Balsamico Vinaigrette Dressing', {
    retryWithAi: false,
  });
  assert.equal(sauceResult.isFromMealDb, false);
  assert.ok(sauceResult.recipe);
});

test('Requirement R1 & R4 - Recipe scaling and shopping list aggregation for catering', () => {
  const recipe = mealDbToRecipe(MOCK_MEAL_ARRABIATA); // 4 servings
  const scaled = scaleRecipe(recipe, 80); // 80 participants = 20x factor

  const penneScaled = scaled.find((i) => i.ingredient === 'penne rigate');
  assert.ok(penneScaled);
  // 454g * 20 = 9080g -> 9.08 kg
  assert.equal(penneScaled.quantity, 9.08);
  assert.equal(penneScaled.unit, 'kg');

  const oilScaled = scaled.find((i) => i.ingredient === 'olive oil');
  assert.ok(oilScaled);
  // 30ml * 20 = 600ml
  assert.equal(oilScaled.quantity, 600);
  assert.equal(oilScaled.unit, 'ml');

  const garlicScaled = scaled.find((i) => i.ingredient === 'garlic');
  assert.ok(garlicScaled);
  // 3 piece * 20 = 60 piece
  assert.equal(garlicScaled.quantity, 60);
  assert.equal(garlicScaled.unit, 'piece');

  const tomatoesScaled = scaled.find((i) => i.ingredient === 'chopped tomatoes');
  assert.ok(tomatoesScaled);
  // 1 pack * 20 = 20 pack
  assert.equal(tomatoesScaled.quantity, 20);
  assert.equal(tomatoesScaled.unit, 'pack');

  // Merging multiple recipes
  const merged = mergeShoppingList([...scaled, ...scaled]);
  const penneMerged = merged.find((i) => i.ingredient === 'penne rigate');
  assert.ok(penneMerged);
  assert.equal(penneMerged.quantity, 18.16);
  assert.equal(penneMerged.unit, 'kg');
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
