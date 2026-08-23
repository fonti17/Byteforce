<a id="readme-top"></a>

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <h1 align="center">Event in a Box</h1>

  <p align="center">
    AI-powered catering planning platform that transforms unstructured customer inquiries into tailored menus, scaled portion calculations, and live-priced Prodega shopping lists.
    <br />
    <br />
    <a href="#about-the-project">Explore Documentation</a>
    ·
    <a href="#getting-started">Quickstart</a>
    ·
    <a href="#feature-recipe-db-branch">DB & Scraper Branch</a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details open>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#key-features">Key Features</a></li>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation-and-running">Installation and Running</a></li>
        <li><a href="#deployment-note">Deployment Note</a></li>
      </ul>
    </li>
    <li><a href="#usage-and-available-scripts">Usage and Available Scripts</a></li>
    <li>
      <a href="#feature-recipe-db-branch">The `feature/recipe-db` Branch</a>
      <ul>
        <li><a href="#checking-out-the-branch">Checking Out</a></li>
        <li><a href="#running-the-mealdb-service">Running the MealDB Service</a></li>
        <li><a href="#running-the-python-scraper">Running the Python Scraper</a></li>
      </ul>
    </li>
    <li><a href="#project-structure">Project Structure</a></li>
    <li><a href="#documentation">Documentation</a></li>
    <li><a href="#team--acknowledgments">Team & Acknowledgments</a></li>
  </ol>
</details>

---

<!-- ABOUT THE PROJECT -->
## About The Project

Planning catering events involves multiple disconnected steps: extracting dietary requirements and budget limits from client emails, scaling recipes to varying guest numbers, harmonizing shopping lists, and checking wholesale supplier catalogs for pricing.

**Event in a Box** unifies this workflow into a single, privacy-focused Progressive Web Application powered by Swiss open-weight language models.

### Key Features

* **Intelligent Information Extraction**: Analyzes unformatted emails or text briefs using **Apertus v1.5 (8B)** to extract event date, guest count, meal type, budget, and dietary constraints with deterministic safety nets.
* **Interactive Question Follow-up**: Prompts users only for missing required details through guided, one-click questionnaires.
* **Local Recipe Management**: Full local storage (IndexedDB) for user recipes with automatic unit conversion (40+ unit aliases mapped to 6 standard units) and guest-proportional scaling.
* **Generative Menu Composition**: Employs **Apertus v1.5 (70B)** via Server-Sent Events streaming to compose balanced menus and consolidated ingredient lists.
* **Real-Time Prodega Pricing**: Queries the live Transgourmet Prodega assortment via Serverless proxy routes. An LLM-driven decision engine selects optimal package sizes to balance wholesale savings against food waste risk.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

* [![React][React.js]][React-url]
* [![TypeScript][TypeScript]][TypeScript-url]
* [![Vite][Vite]][Vite-url]
* [![TailwindCSS][TailwindCSS]][Tailwind-url]
* [![HeroUI][HeroUI]][HeroUI-url]
* **Apertus v1.5 (8B & 70B)**: Swiss LLM hosted on Stoney Cloud / onprem.ai
* **IndexedDB & Workbox**: Client-side persistence and Progressive Web App engine

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- GETTING STARTED -->
## Getting Started

Follow these steps to set up and run the main application locally.

### Prerequisites

* **Node.js**: `v20.0.0` or higher
* **npm**: `v10.0.0` or higher

Verify your installation:
```bash
node -v
npm -v
```

### Installation and Running

1. Clone the repository:
   ```bash
   git clone https://github.com/fonti17/Byteforce.git
   cd Byteforce
   ```

2. Enter the application directory:
   ```bash
   cd code
   ```

3. Install project dependencies:
   ```bash
   npm install
   ```

4. Launch the local development server:
   ```bash
   npm run dev
   ```

5. Open your browser and visit:
   ```
   http://localhost:5173
   ```

### Deployment Note

The application is deployed as a Vercel project and is publicly reachable at **[byteforce-three.vercel.app](https://byteforce-three.vercel.app/)**. No installation is required to try it out — the PWA can be installed directly from the browser.

Every push to `main` triggers an automatic build (`npm run build` with `code/` as the root directory), the static bundle is served from `dist/`, and all deployment behaviour is declared in [`code/vercel.json`](./code/vercel.json):

| Route | Type | Purpose |
|---|---|---|
| `/api/transgourmet/search` | Serverless Function | Queries the live Prodega catalog server-side (`maxDuration: 60`) |
| `/api/stoney/*` | Proxy rewrite | Forwards to `https://llm.stoney-cloud.com` (Apertus 8B) |
| `/api/onprem/*` | Proxy rewrite | Forwards to `https://llm-api2.b.onprem.ai` (Apertus 70B) |
| `/*` (everything else) | SPA fallback | Rewrites to `/index.html` for client-side routing |

The two proxy rewrites mirror the Vite dev server proxy defined in `vite.config.ts`, so the exact same relative request paths work locally and in production. Their purpose is to avoid browser CORS restrictions against the LLM hosts — note that `VITE_*` keys are compiled into the client bundle and are therefore not secret.

The environment variables from [`code/.env.example`](./code/.env.example) (model endpoints, API keys, default model) must be configured in the Vercel project settings; a redeploy is required for changes to take effect.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- USAGE -->
## Usage and Available Scripts

Inside the `code/` directory, you can execute the following lifecycle commands:

| Command | Action |
|---|---|
| `npm run dev` | Starts the Vite development server with local catalog proxy and PWA support |
| `npm run build` | Compiles TypeScript and builds production-ready bundles |
| `npm run preview` | Serves the production build locally for verification |
| `npm run lint` | Analyzes code quality using ESLint |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- DB & SCRAPER BRANCH -->
## The `feature/recipe-db` Branch

During the initial solution exploration, we developed and tested two alternative components: an external recipe database connector (**TheMealDB**) and a dedicated Python webscraper for Prodega catalog data. While both were superseded by direct live catalog lookups and generative LLM planning, their full codebases and test suites remain available on the `feature/recipe-db` branch.

### Checking Out the Branch

```bash
git fetch origin
git checkout feature/recipe-db
```

### Running the MealDB Service

The branch contains a `MealDbService` module (`src/features/recipes/mealDbService.ts`) with multi-strategy recipe lookup algorithms.

1. Install dependencies and start the app:
   ```bash
   npm install
   npm run dev
   ```

2. Run the MealDB test suite:
   ```bash
   node tests/mealDb.test.mjs
   ```

### Running the Python Scraper

The `scraper/` directory provides a modular Python package for extracting Transgourmet product data, prices, and weekly flyers.

1. Navigate to the scraper directory and set up a virtual environment:
   ```bash
   cd scraper
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. Run CLI commands:
   ```bash
   # Search for products by keyword
   python -m scraper search --query "milch"

   # Search within a specific category
   python -m scraper search --query "butter" --category "molkerei-backwaren" --limit 10

   # Export active promotional products
   python -m scraper promotions --limit 20
   ```

3. Run the automated scraper test suite:
   ```bash
   pytest
   ```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- PROJECT STRUCTURE -->
## Project Structure

```
Byteforce/
├── code/                          # Production Web Application
│   ├── api/transgourmet/          # Serverless catalog search route
│   ├── src/
│   │   ├── app/                   # App shell, routing and state coordination
│   │   ├── features/
│   │   │   ├── gathering/         # Phase 1: Brief extraction and questionnaires
│   │   │   ├── recipes/           # User recipe library and quantity scaling
│   │   │   ├── catering-plan/     # Phase 2: Menu generation and grocery list
│   │   │   └── pricing/           # Phase 3: Prodega assortment matching in CHF
│   │   ├── shared/                # Swiss LLM client, i18n translations, UI atoms
│   │   └── server/                # Local proxy middleware for Vite
│   └── package.json
├── documentation/                 # Technical reports and architecture documents
│   └── technische_informationen.md
├── presentation/                  # Slides and pitch materials
└── Readme.md                      # Project root documentation
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- DOCUMENTATION -->
## Documentation

Detailed architectural decisions, prompt contracts, and dataflow diagrams are available in the official jury documentation:

* [Technische Informationen für die Jury](./documentation/technische_informationen.md)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- TEAM -->
## Team & Acknowledgments

Developed by team **Byteforce**.

Special thanks to:
* **Transgourmet / Prodega** for challenge inspiration and catalog structure.
* **onprem.ai & Stoney Cloud** for hosting and supporting the **Apertus** Swiss LLM models.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
[React.js]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://react.dev/
[TypeScript]: https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[Vite]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vite.dev/
[TailwindCSS]: https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white
[Tailwind-url]: https://tailwindcss.com/
[HeroUI]: https://img.shields.io/badge/HeroUI-000000?style=for-the-badge&logo=react&logoColor=white
[HeroUI-url]: https://heroui.com/
