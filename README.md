# Event in a Box

React + TypeScript + Vite PWA that turns a free-text catering request into a brief,
a menu and a priced shopping list.

## Project structure

The code is organised by feature, not by technical layer: everything one
capability needs — components, hooks, service, types and its LLM prompt config —
sits in one folder.

```
src/
  main.tsx                    entry point, mounts the app shell
  app/                        app shell: routing between the planner views
    CateringPlanner.tsx       orchestrates the features, owns the step state
    PlannerLanding.tsx        view 1 — request input and recipe picking
    index.css                 global styles / Tailwind entry
  features/
    gathering/                part 1 — read the request into an event brief
      components/             GatheringInput, GatheringResultView, MissingValues
      hooks/useGathering.ts
      gatheringService.ts     LLM call + parsing
      questions.ts            question order, options, presets, formatting
      types.ts
      gathering.config.json   JSON schema / prompt config for the extraction
    recipes/                  the user's own recipe library
      components/             RecipesView, RecipeDetailView, RecipeEditor, …
      hooks/useRecipes.ts
      recipeService.ts        LLM call, scaling, plan contribution
      recipeStore.ts          browser persistence
      recipeFields.ts         labels, prompts and presets for recipe fields
      types.ts
      recipe.config.json
    catering-plan/            part 2 — menu, quantities and shopping list
      components/CateringPlanView.tsx
      hooks/useCateringPlan.ts
      cateringPlanService.ts
      types.ts
      cateringPlan.config.json
    pricing/                  product choice and pricing for the shopping list
      llmPriceService.ts
      productChoicePrompt.ts
      productChoice.config.json
      transgourmet/           webshop catalog client (catalog, articles,
                              turbostream decoding, pack-content maths, types)
  shared/                     used by more than one feature
    llm/                      llmService + LLM types
    i18n/strings.ts           all DE/EN copy
    ui/ProdegaLogo.tsx
    utils/json.ts
  server/transgourmetProxy.ts Vite dev-server plugin, Node-side only
```

### Conventions

- **Imports**: `@/…` (alias for `src/`) across features and into `shared/`;
  relative paths inside a feature, so a feature folder can move as a unit.
  `src/server/` and `features/pricing/transgourmet/` stay on relative `.ts`
  specifiers — they are compiled by `tsconfig.node.json` (Node resolution) as
  well as by the app.
- **Config**: each `*.config.json` is the JSON schema / prompt contract of the
  service next to it. Change the schema and the types in the sibling `types.ts`
  together.
- **Copy**: no user-visible strings in components — everything goes through
  `shared/i18n/strings.ts` and reaches components as the `t` prop.
- **Dependencies** point one way: `app/` → `features/` → `shared/`. Features may
  read another feature's types and services, never its internals.

## Scripts

```bash
npm run dev       # vite dev server (PWA enabled)
npm run build     # tsc -b && vite build
npm run lint      # eslint
npm run preview   # serve the production build
```

---

## About this Vite template

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
